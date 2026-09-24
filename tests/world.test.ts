import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldDefinitions } from '../src/data/world/index.ts';
import {
  advanceWorld,
  completeDay,
  createScheduledGame,
  createWorld,
  worldPhase,
} from '../src/world/engine.ts';
import { applyContribution, gameContribution, standings } from '../src/world/stats.ts';
import { validateWorld } from '../src/world/validation.ts';
import { WorldDatabase, DexieWorldStorage } from '../src/world/dexie-storage.ts';
import { WorldController, type WorldAction, type WorldView } from '../src/world/controller.ts';
import { runToCompletion } from '../src/game/engine.ts';
import { finalizeGame } from '../src/game/results.ts';
import type { WorldRecord } from '../src/world/types.ts';

function playDate(world: WorldRecord, size = 25): WorldRecord {
  while (worldPhase(world) === 'playing') world = advanceWorld(world, size);
  assert.equal(worldPhase(world), 'readyToComplete');
  return world;
}

function finishDate(world: WorldRecord, size = 25): WorldRecord {
  world = playDate(world, size);
  return completeDay(world, world.currentDate);
}

function allDates(seed: number, size: number): WorldRecord {
  let world = createWorld(seed);
  while (worldPhase(world) !== 'scheduleComplete') world = finishDate(world, size);
  return world;
}

test('日次：最初の試合終了では日付が進まず、全試合と集計が揃ってから一度だけ進む', () => {
  const original = createWorld();
  let world = original;
  assert.throws(() => completeDay(world, world.currentDate), /全試合/);
  while (world.dayPlan.cursor === 0) world = advanceWorld(world, 25);
  assert.equal(world.currentDate, '2026-09-24');
  assert.equal(Object.keys(world.statApplicationMarkers).length, 1);
  assert.equal(
    world.stats.teams.reduce((sum, row) => sum + row.games, 0),
    2,
  );
  assert.deepEqual(original, createWorld());

  const first = structuredClone(world.games[world.dayPlan.gameIds[0]!]!);
  world = finishDate(world);
  assert.equal(world.currentDate, '2026-09-25');
  assert.equal(world.lastCompletedDate, '2026-09-24');
  assert.deepEqual(world.completedDates, ['2026-09-24']);
  assert.deepEqual(world.games[first.state.gameId], first);
  assert.deepEqual(
    Object.values(world.games).map((game) => game.result!.score),
    [
      { home: 2, away: 0 },
      { home: 4, away: 2 },
    ],
  );
  assert.throws(() => completeDay(world, '2026-09-24'), /日付/);
  validateWorld(world);
});

test('日次：進行単位1/25・試合の列挙順が結果と完全な乱数状態へ影響しない', () => {
  for (const seed of [20260924, 19]) {
    const one = allDates(seed, 1);
    const batch = allDates(seed, 25);
    assert.deepEqual(batch, one);
    const definitions = createWorldDefinitions();
    definitions.schedule.reverse();
    const reordered = createWorld(seed, definitions);
    for (const scheduled of definitions.schedule) {
      const game = createScheduledGame(reordered, scheduled.gameId);
      runToCompletion(game);
      finalizeGame(game);
      assert.deepEqual(game, batch.games[scheduled.gameId]);
      assert.equal(game.state.rng.streamId, scheduled.gameId + ':attempt:1');
    }
    assert.equal(new Set(Object.values(batch.games).map((game) => game.state.gameId)).size, 6);
    assert.equal(batch.currentDate, '2026-09-28');
    assert.throws(() => completeDay(batch, batch.currentDate), /全試合/);
  }
});

test('日次：試合なし・月境界でも日付を1回だけ処理し、成績を変えない', () => {
  const definitions = createWorldDefinitions();
  definitions.startDate = '2026-09-30';
  definitions.endDate = '2026-10-01';
  definitions.schedule = [];
  let world = createWorld(42, definitions);
  const stats = structuredClone(world.stats);
  world = finishDate(world);
  assert.equal(world.currentDate, '2026-10-01');
  assert.equal(world.lastCompletedDate, '2026-09-30');
  assert.deepEqual(world.stats, stats);
  world = finishDate(world);
  assert.equal(world.currentDate, '2026-10-02');
  assert.deepEqual(world.completedDates, ['2026-09-30', '2026-10-01']);
  validateWorld(world);
});

test('日次：累計は各結果の整数カウンタの和、寄与の再適用は無操作で改訂は拒否', () => {
  const world = allDates(20260924, 25);
  for (const row of world.stats.batting) {
    const source = Object.values(world.games)
      .flatMap((game) => game.result!.batting)
      .filter((line) => line.playerId === row.playerId);
    assert.equal(
      row.hits,
      source.reduce((sum, line) => sum + line.hits, 0),
    );
    assert.equal(
      row.plateAppearances,
      source.reduce((sum, line) => sum + line.plateAppearances, 0),
    );
  }
  assert.equal(
    world.stats.teams.reduce((sum, row) => sum + row.games, 0),
    12,
  );
  assert.equal(
    world.stats.teams.reduce((sum, row) => sum + row.runsFor, 0),
    world.stats.batting.reduce((sum, row) => sum + row.runs, 0),
  );
  assert.equal(
    world.stats.pitching.reduce((sum, row) => sum + row.runsAllowed, 0),
    world.stats.teams.reduce((sum, row) => sum + row.runsAgainst, 0),
  );
  const before = structuredClone(world);
  const contribution = Object.values(world.contributions)[0]!;
  applyContribution(world, contribution);
  assert.deepEqual(world, before);
  const changed = structuredClone(contribution);
  changed.stats.teams[0]!.runsFor++;
  assert.throws(() => applyContribution(world, changed), /寄与/);
  assert.deepEqual(world, before);
  const unfinished = createWorld();
  assert.throws(
    () =>
      gameContribution(
        unfinished.definitions,
        unfinished.definitions.schedule[0]!,
        createScheduledGame(unfinished, unfinished.definitions.schedule[0]!.gameId),
      ),
    /未確定/,
  );
});

test('順位：引分を分母にせず、丸め前比較・安全整数を超える交差積・未観測を扱う', () => {
  const world = createWorld();
  const rows = world.stats.teams;
  Object.assign(rows[0]!, { wins: 1, losses: 1, draws: 8, games: 10 });
  Object.assign(rows[1]!, { wins: 2, losses: 2, draws: 0, games: 4 });
  Object.assign(rows[2]!, {
    wins: 500000000001,
    losses: 500000000000,
    draws: 0,
    games: 1000000000001,
  });
  Object.assign(rows[3]!, { wins: 0, losses: 0, draws: 1, games: 1 });
  const result = standings(world.stats);
  assert.equal(result[0]!.squadId, rows[2]!.squadId);
  assert.deepEqual(
    result.map((row) => row.rank),
    [1, 2, 2, null],
  );
  assert.equal(result[1]!.winPercentage, 0.5);
  assert.equal(result[3]!.winPercentage, null);
});

test('日程入力：重複ID、同日重複出場、未知の球団、期間外、未対応球種を拒否', () => {
  for (const mutate of [
    (d: ReturnType<typeof createWorldDefinitions>) => {
      d.schedule[1]!.gameId = d.schedule[0]!.gameId;
    },
    (d: ReturnType<typeof createWorldDefinitions>) => {
      d.schedule[1]!.awaySquadId = d.schedule[0]!.awaySquadId;
    },
    (d: ReturnType<typeof createWorldDefinitions>) => {
      d.schedule[1]!.homeSquadId = 'unknown';
    },
    (d: ReturnType<typeof createWorldDefinitions>) => {
      d.schedule[1]!.date = '2026-10-01';
    },
    (d: ReturnType<typeof createWorldDefinitions>) => {
      d.squads[0]!.pitches[0]!.pitchTypeCode = 'curve' as never;
    },
  ]) {
    const definitions = createWorldDefinitions();
    mutate(definitions);
    assert.throws(() => createWorld(1, definitions));
  }
});

test('世界検査：乱数・集計・日次マーカー・未来試合の改変を再実行で拒否', () => {
  const original = finishDate(createWorld());
  for (const mutate of [
    (world: WorldRecord) => {
      Object.values(world.games)[0]!.state.rng.drawCount++;
    },
    (world: WorldRecord) => {
      world.stats.teams[0]!.wins++;
    },
    (world: WorldRecord) => {
      Object.values(world.statApplicationMarkers)[0]!.resultRevision = 2 as never;
    },
    (world: WorldRecord) => {
      world.dayPlan.cursor++;
    },
    (world: WorldRecord) => {
      world.games['fake'] = Object.values(world.games)[0]!;
    },
  ]) {
    const world = structuredClone(original);
    mutate(world);
    assert.throws(() => validateWorld(world));
  }
});

test('世界保存：途中の全世界を復元し、手動枠を保って自動/直前自動を回す', async () => {
  const db = new WorldDatabase('world-save-' + crypto.randomUUID());
  const storage = new DexieWorldStorage(db);
  try {
    let world = createWorld();
    while (world.dayPlan.cursor === 0) world = advanceWorld(world, 25);
    world = advanceWorld(world, 13);
    const partial = structuredClone(world);
    let slots = await storage.save(world, 3, 'manual', 0);
    assert.equal(slots.auto, null);
    const manualId = slots.manual!.snapshotId;
    const loaded = await storage.load('manual');
    assert.deepEqual(loaded.world, partial);
    assert.deepEqual(finishDate(loaded.world, 1), finishDate(partial, 25));
    world = finishDate(world);
    slots = await storage.save(world, 4, 'auto', slots.storageRevision);
    const firstAuto = slots.auto!.snapshotId;
    assert.equal(slots.previousAuto, null);
    world = finishDate(world);
    slots = await storage.save(world, 5, 'auto', slots.storageRevision);
    assert.equal(slots.previousAuto!.snapshotId, firstAuto);
    assert.equal(slots.manual!.snapshotId, manualId);
    assert.deepEqual((await storage.load('manual')).world, partial);
    assert.equal((await storage.load('previousAuto')).world.currentDate, '2026-09-25');
    assert.deepEqual((await storage.load('auto')).world, world);
    assert.deepEqual(db.tables.map((table) => table.name).sort(), [
      'local_worlds',
      'save_blocks',
      'save_slots',
      'save_snapshots',
    ]);
  } finally {
    await db.delete();
  }
});

test('世界保存：トランザクション失敗と世代競合は以前の保存を保つ', async () => {
  const db = new WorldDatabase('world-rollback-' + crypto.randomUUID());
  const storage = new DexieWorldStorage(db);
  try {
    const first = finishDate(createWorld());
    const slots = await storage.save(first, 1, 'auto', 0);
    const counts = await Promise.all(db.tables.map((table) => table.count()));
    const fail = () => {
      throw new Error('injected transaction failure');
    };
    db.save_snapshots.hook('creating', fail);
    const next = finishDate(first);
    await assert.rejects(storage.save(next, 2, 'auto', slots.storageRevision), /injected/);
    db.save_snapshots.hook('creating').unsubscribe(fail);
    assert.deepEqual(await storage.listSlots(), slots);
    assert.deepEqual(await Promise.all(db.tables.map((table) => table.count())), counts);
    assert.deepEqual((await storage.load('auto')).world, first);
    await assert.rejects(storage.save(next, 2, 'auto', 0), /別タブ/);
    assert.deepEqual(await storage.listSlots(), slots);
    await storage.save(next, 2, 'auto', slots.storageRevision);
  } finally {
    await db.delete();
  }
});

async function controllerDriver(controller: WorldController) {
  let view = await controller.initialize();
  let commandNo = 0;
  const send = async (action: WorldAction): Promise<WorldView> => {
    view = await controller.dispatch({
      ...action,
      commandId: 'command-' + ++commandNo,
      localWorldId: 'v02-local',
      expectedStateRevision: view.revision,
    });
    return view;
  };
  return { send, get: () => view };
}

test('世界Controller：日次保存失敗後は日付・結果を維持し、同じ指示で再試行できる', async () => {
  const db = new WorldDatabase('world-controller-' + crypto.randomUUID());
  const storage = new DexieWorldStorage(db);
  const controller = new WorldController(storage);
  try {
    const driver = await controllerDriver(controller);
    while (driver.get().phase === 'playing') await driver.send({ kind: 'advance', count: 25 });
    const before = controller.query();
    const command = {
      kind: 'completeDay' as const,
      date: before.currentDate,
      commandId: 'finish',
      localWorldId: 'v02-local' as const,
      expectedStateRevision: before.revision,
    };
    const fail = () => {
      throw new Error('disk full');
    };
    db.save_snapshots.hook('creating', fail);
    await assert.rejects(controller.dispatch(command), /disk full/);
    db.save_snapshots.hook('creating').unsubscribe(fail);
    const failed = controller.query();
    assert.equal(failed.currentDate, before.currentDate);
    assert.equal(failed.revision, before.revision);
    assert.deepEqual(failed.games, before.games);
    assert.deepEqual(failed.stats, before.stats);
    assert.match(failed.storageError!, /自動保存/);
    const after = await controller.dispatch(command);
    assert.equal(after.currentDate, '2026-09-25');
    assert.deepEqual(after.stats, before.stats);
    assert.equal(after.unsavedChanges, false);
    assert.deepEqual(await controller.dispatch(command), after);
    assert.equal((await storage.listSlots()).storageRevision, 1);
    await assert.rejects(controller.dispatch({ ...command, date: '2026-09-25' }), /同じ指示ID/);
    await assert.rejects(controller.dispatch({ ...command, commandId: 'stale' }), /古い世界/);
    after.definitions.squads[0]!.players[0]!.familyName = '表示の改変';
    assert.notDeepEqual(after.definitions, controller.query().definitions);
  } finally {
    await db.delete();
  }
});

test('世界保存：破損した最新保存を拒否し、直前自動と手動へ復旧できる', async () => {
  const db = new WorldDatabase('world-corruption-' + crypto.randomUUID());
  const storage = new DexieWorldStorage(db);
  try {
    const initial = createWorld();
    await storage.save(initial, 0, 'manual', 0);
    const first = finishDate(initial);
    await storage.save(first, 1, 'auto', 1);
    const second = finishDate(first);
    const slots = await storage.save(second, 2, 'auto', 2);
    const snapshot = await db.save_snapshots.get(slots.auto!.snapshotId);
    const ref = snapshot!.blockRefs.find((ref) => ref.logicalKey === 'world')!;
    const block = (await db.save_blocks.get(ref.blockId))!;
    block.payloadBytes[0] = 0;
    await db.save_blocks.put(block);
    await assert.rejects(storage.load('auto'), /ハッシュ/);
    assert.deepEqual((await storage.load('previousAuto')).world, first);
    assert.deepEqual((await storage.load('manual')).world, initial);
  } finally {
    await db.delete();
  }
});

test('世界入力と保存：予約語IDと再利用ブロックの形式改変を拒否する', async () => {
  for (const gameId of ['__proto__', 'constructor', 'toString']) {
    const definitions = createWorldDefinitions();
    definitions.schedule[0]!.gameId = gameId;
    assert.throws(() => createWorld(1, definitions), /使用できない試合ID/);
  }

  const db = new WorldDatabase('world-metadata-' + crypto.randomUUID());
  const storage = new DexieWorldStorage(db);
  try {
    const first = finishDate(createWorld());
    const slots = await storage.save(first, 1, 'auto', 0);
    const snapshot = (await db.save_snapshots.get(slots.auto!.snapshotId))!;
    const definitionRef = snapshot.blockRefs.find((ref) => ref.logicalKey === 'definitions')!;
    const block = (await db.save_blocks.get(definitionRef.blockId))!;
    block.schemaVersion = 'unknown-format' as never;
    await db.save_blocks.put(block);
    await assert.rejects(
      storage.save(finishDate(first), 2, 'auto', slots.storageRevision),
      /ブロックが破損/,
    );
    assert.deepEqual(await storage.listSlots(), slots);
  } finally {
    await db.delete();
  }
});
