import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { physicalConfig } from '../config/physical.ts';
import { createPhysicalDefinitions } from '../src/data/world/physical.ts';
import {
  advanceWorld,
  completeDay,
  createPhysicalWorld,
  createFarmWorld,
  worldPhase,
} from '../src/world/engine.ts';
import {
  activityKey,
  activityCounts,
  applyPhysicalGame,
  recoverPhysicalDay,
  physicalView,
} from '../src/world/physical.ts';
import { applyManagement } from '../src/world/management.ts';
import { WorldController } from '../src/world/controller.ts';
import { WorldDatabase, DexieWorldStorage } from '../src/world/dexie-storage.ts';
import { validateWorld, WorldValidator } from '../src/world/validation.ts';
import type { WorldRecord } from '../src/world/types.ts';
import type { PhysicalWorld } from '../src/world/physical.ts';

function finishGames<T extends WorldRecord>(world: T): T {
  let next: WorldRecord = world;
  while (worldPhase(next) === 'playing') next = advanceWorld(next, 25);
  assert.equal(worldPhase(next), 'readyToComplete');
  return next as T;
}

const inputs = (world: PhysicalWorld) => world.definitions.squads.flatMap((s) => s.physicalInputs!);

test('身体入力：120人を明示し、初期値・上限・係数・重複ID・旧版混入を検査する', () => {
  const world = createPhysicalWorld();
  assert.equal(inputs(world).length, 120);
  assert.equal(Object.keys(world.physical.players).length, 120);
  assert.deepEqual(world.definitions.physicalConfig, physicalConfig);
  for (const mutate of [
    (d: typeof world.definitions) => d.squads[0]!.physicalInputs!.pop(),
    (d: typeof world.definitions) => {
      d.squads[0]!.physicalInputs![1]!.playerId = 'player-a-01';
    },
    (d: typeof world.definitions) => {
      d.squads[0]!.physicalInputs![0]!.energyMilli = -1;
    },
    (d: typeof world.definitions) => {
      d.squads[0]!.physicalInputs![0]!.fatigueMilli = 100001;
    },
    (d: typeof world.definitions) => {
      d.squads[0]!.physicalInputs![0]!.physical.recovery.valueMilli = 120001;
    },
    (d: typeof world.definitions) => {
      d.physicalConfig!.workloadUnits.pitching = NaN;
    },
    (d: typeof world.definitions) => {
      Reflect.deleteProperty(d.physicalConfig!.dailyRecovery, 'energyBaseMilli');
    },
  ]) {
    const d = structuredClone(world.definitions);
    mutate(d);
    assert.throws(() => createPhysicalWorld(1, undefined, d));
  }
  const old = createFarmWorld();
  old.definitions.physicalConfig = physicalConfig;
  assert.throws(() => validateWorld(old));
  world.definitions.squads[0]!.physicalInputs![0]!.physical.stamina.valueMilli = 0;
  assert.notEqual(inputs(createPhysicalWorld())[0]!.physical.stamina.valueMilli, 0);
});

test('初球：投手の準備＋投球、打者、守備者のみ消耗し、入力と基礎能力は不変', () => {
  const world = createPhysicalWorld();
  const before = structuredClone(world);
  const next = advanceWorld(world, 1) as PhysicalWorld;
  const game = Object.values(next.games)[0]!;
  const pitch = game.events[0]!.pitch!;
  const input = inputs(world).find((p) => p.playerId === pitch.pitcherId)!;
  const scale = 120000 / (60000 + input.physical.stamina.valueMilli);
  const expectedEnergy =
    Math.round(((8000 * 500) / 1000) * scale) + Math.round(((1000 * 500) / 1000) * scale);
  assert.equal(next.physical.players[pitch.pitcherId]!.energyMilli, 100000 - expectedEnergy);
  const load = next.physical.activityLoads[activityKey(pitch.pitcherId, world.currentDate)]!;
  assert.equal(activityCounts(load, 'pitching'), 1);
  assert.equal(activityCounts(load, 'preparation'), 1);
  assert.equal(activityCounts(load, 'fielding'), 0);
  assert(next.physical.players[pitch.batterId]!.energyMilli < 100000);
  assert(next.physical.players[pitch.catcherId]!.energyMilli < 100000);
  assert.equal(next.physical.players['player-a-13']!.energyMilli, 100000);
  assert.equal(next.physical.players['player-a-16']!.energyMilli, 100000);
  assert.deepEqual(world, before);
  assert.deepEqual(next.definitions, world.definitions);
  assert.deepEqual(applyPhysicalGame(next, game.state.gameId, game), next.physical);
});

test('進行の分割数・検証キャッシュによらず負荷が一致し、試合終了で重複しない', () => {
  const base = createPhysicalWorld();
  let one: PhysicalWorld = base;
  let many: PhysicalWorld = base;
  for (let i = 0; i < 100; i++) one = advanceWorld(one, 1) as PhysicalWorld;
  for (let i = 0; i < 4; i++) many = advanceWorld(many, 25) as PhysicalWorld;
  assert.deepEqual(one, many);
  const complete = finishGames(many);
  const before = structuredClone(complete.physical);
  for (const game of Object.values(complete.games)) {
    for (const pitcher of game.result!.pitching) {
      const load =
        complete.physical.activityLoads[activityKey(pitcher.playerId, base.currentDate)]!;
      assert.equal(activityCounts(load, 'pitching'), pitcher.pitches);
      assert.equal(activityCounts(load, 'preparation'), pitcher.pitches > 0 ? 1 : 0);
    }
    assert.deepEqual(applyPhysicalGame(complete, game.state.gameId, game), before);
  }
  const validator: WorldValidator = new WorldValidator();
  validator.validate(complete);
  validator.validate(complete); // 終了ゲームのキャッシュを使う2回目
  assert.deepEqual(complete.physical, before);
  const old = finishGames(createFarmWorld());
  assert.deepEqual(complete.games, old.games);
  assert.deepEqual(complete.stats, old.stats);
  assert.deepEqual(complete.registration.gameRosters, old.registration.gameRosters);
});

test('上下限・スタミナ差・投打の負荷合算と、活動なしの日の回復', () => {
  const definitions = createPhysicalDefinitions();
  definitions.schedule = [];
  const row = definitions.squads[0]!.physicalInputs![0]!;
  row.energyMilli = 1000;
  row.fatigueMilli = 99999;
  row.physical.recovery.valueMilli = 60000;
  const resting = createPhysicalWorld(1, undefined, definitions);
  const next = completeDay(resting, resting.currentDate) as PhysicalWorld;
  assert.equal(next.physical.players[row.playerId]!.energyMilli, 41000);
  assert.equal(next.physical.players[row.playerId]!.fatigueMilli, 89999);
  assert.equal(
    next.physical.recoveries[activityKey(row.playerId, resting.currentDate)]!.rested,
    true,
  );
  assert.throws(() => completeDay(next, resting.currentDate));
  assert.throws(() =>
    recoverPhysicalDay({ ...next, currentDate: resting.currentDate }, next.currentDate),
  );

  const base = createPhysicalWorld();
  const game = structuredClone(Object.values(advanceWorld(base, 1).games)[0]!);
  const pitcherId = game.events[0]!.pitch!.pitcherId;
  game.events[0]!.pitch!.batterId = pitcherId;
  // 共通の身体状態に両活動が足されることを確認する負荷抽出単体試験。
  base.physical.players[pitcherId]!.energyMilli = 1;
  base.physical.players[pitcherId]!.fatigueMilli = 99999;
  const result = applyPhysicalGame(base, game.state.gameId, game);
  assert.equal(result.players[pitcherId]!.energyMilli, 0);
  assert.equal(result.players[pitcherId]!.fatigueMilli, 100000);
  const activity = result.activityLoads[activityKey(pitcherId, base.currentDate)]!;
  assert.equal(activityCounts(activity, 'pitching'), 1);
  assert.equal(activityCounts(activity, 'batting'), 1);
  const low = createPhysicalWorld();
  const high = createPhysicalWorld();
  inputs(low).find((p) => p.playerId === pitcherId)!.physical.stamina.valueMilli = 0;
  inputs(high).find((p) => p.playerId === pitcherId)!.physical.stamina.valueMilli = 110000;
  assert(
    applyPhysicalGame(low, game.state.gameId, game).players[pitcherId]!.energyMilli <
      applyPhysicalGame(high, game.state.gameId, game).players[pitcherId]!.energyMilli,
  );
});

test('一軍から二軍へ移っても状態を維持し、控えと出場の回復理由を分ける', () => {
  const complete = finishGames(createPhysicalWorld());
  let world = completeDay(complete, complete.currentDate) as PhysicalWorld;
  const state = structuredClone(world.physical);
  world = applyManagement(world, 'swap', {
    kind: 'setRegistrations',
    squadId: 'hoshihara-first',
    changes: [
      { playerId: 'player-a-01', category: 'farm' },
      { playerId: 'player-a-16', category: 'first' },
    ],
  }) as PhysicalWorld;
  assert.deepEqual(world.physical, state);
  assert.equal(state.recoveries[activityKey('player-a-13', '2026-09-24')]!.rested, true);
  assert.equal(state.recoveries[activityKey('player-a-01', '2026-09-24')]!.rested, false);
  world = completeDay(finishGames(world), world.currentDate) as PhysicalWorld;
  world = finishGames(world); // 9/26は二軍のみ。元一軍選手にも負荷が付く。
  assert(
    activityCounts(
      world.physical.activityLoads[activityKey('player-a-01', '2026-09-26')]!,
      'batting',
    ) > 0,
  );
  assert.equal(world.physical.activityLoads[activityKey('player-a-16', '2026-09-26')], undefined);
  validateWorld(world);
});

test('保存途中から再開：設定固定、状態改変拒否、旧v7の固定保存も継続できる', async () => {
  const definitions = createPhysicalDefinitions();
  definitions.physicalConfig!.energyCostMilli = 700;
  const initial = createPhysicalWorld(20260924, undefined, definitions);
  const world = advanceWorld(initial, 17) as PhysicalWorld;
  definitions.physicalConfig!.energyCostMilli = 1;
  assert.equal(world.definitions.physicalConfig!.energyCostMilli, 700);
  const db = new WorldDatabase('physical-save');
  const storage = new DexieWorldStorage(db);
  try {
    await storage.save(world, 1, 'manual', 0);
    const restored = (await storage.load('manual')).world;
    assert.deepEqual(restored, world);
    assert.deepEqual(finishGames(restored), finishGames(world));
    for (const mutate of [
      (w: PhysicalWorld) => {
        w.physical.players['player-a-01']!.energyMilli++;
      },
      (w: PhysicalWorld) => {
        w.physical.appliedEvents[w.dayPlan.gameIds[0]!] =
          (w.physical.appliedEvents[w.dayPlan.gameIds[0]!] ?? 0) + 1;
      },
      (w: PhysicalWorld) => {
        Object.values(w.physical.activityLoads)[0]!.sourceLoads[0]!.actualCounts++;
      },
    ]) {
      const bad = structuredClone(world);
      mutate(bad);
      assert.throws(() => validateWorld(bad));
    }
    const bytes = readFileSync(new URL('./fixtures/world-v7-save.json.gz', import.meta.url));
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      '1b3f472893d0ca00a549fa0847f7712298a4e815c2250996768f9e1f62874c8d',
    );
    const old = JSON.parse(gunzipSync(bytes).toString()) as WorldRecord;
    validateWorld(old);
    await storage.save(old, 2, 'manual', 1);
    const loaded = (await storage.load('manual')).world;
    assert.deepEqual(loaded, old);
    assert(!('physical' in loaded));
    assert.deepEqual(finishGames(loaded), finishGames(old));
  } finally {
    await db.delete();
  }
});

test('日次保存失敗は回復前の正本を保ち、再送・再開で回復を二重計上しない', async () => {
  const world = finishGames(createPhysicalWorld());
  const db = new WorldDatabase('physical-retry');
  const storage = new DexieWorldStorage(db);
  await storage.save(world, 1, 'manual', 0);
  let fail = false;
  const controller = new WorldController({
    listSlots: () => storage.listSlots(),
    load: (slot) => storage.load(slot),
    save: (...args) => {
      if (fail) throw Error('test failure');
      return storage.save(...args);
    },
  });
  try {
    await controller.initialize();
    const before = await controller.dispatch({
      kind: 'load',
      slot: 'manual',
      commandId: 'load',
      expectedStateRevision: 0,
      localWorldId: 'v02-local',
    });
    const command = {
      kind: 'completeDay' as const,
      date: before.currentDate,
      commandId: 'day',
      expectedStateRevision: before.revision,
      localWorldId: 'v02-local' as const,
    };
    fail = true;
    await assert.rejects(controller.dispatch(command));
    assert.deepEqual(controller.query().physical, before.physical);
    assert.equal(controller.query().currentDate, before.currentDate);
    fail = false;
    const after = await controller.dispatch(command);
    assert.deepEqual(await controller.dispatch(command), after);
    const expected = completeDay(world, world.currentDate) as PhysicalWorld;
    assert.deepEqual(after.physical, physicalView(expected));
    assert.deepEqual((await storage.load('auto')).world, expected);
    const bad = structuredClone(expected);
    Object.values(bad.physical.recoveries)[0]!.energyRecoveredMilli++;
    assert.throws(() => validateWorld(bad));
  } finally {
    await db.delete();
  }
});

test(
  '年間216試合・188日：全選手の負荷・日次回復を保存から再現する',
  { timeout: 600000 },
  async () => {
    let world: PhysicalWorld = createPhysicalWorld(
      20260924,
      undefined,
      createPhysicalDefinitions('annual'),
    );
    while (worldPhase(world) !== 'scheduleComplete') {
      world = completeDay(finishGames(world), world.currentDate) as PhysicalWorld;
    }
    assert.equal(Object.keys(world.games).length, 216);
    assert.equal(Object.keys(world.physical.recoveries).length, 120 * 188);
    assert.equal(world.seasonSummary!.games, 144);
    assert.equal(world.farmSummary!.games, 72);
    for (const state of Object.values(world.physical.players)) {
      assert(state.energyMilli >= 0 && state.energyMilli <= 100000);
      assert(state.fatigueMilli >= 0 && state.fatigueMilli <= 100000);
      assert.equal(state.lastUpdatedOn, '2026-10-01');
    }
    const db = new WorldDatabase('physical-annual');
    const storage = new DexieWorldStorage(db);
    try {
      await storage.save(world, 1, 'manual', 0);
      assert.deepEqual((await storage.load('manual')).world, world);
    } finally {
      await db.delete();
    }
  },
);
