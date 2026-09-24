import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createRosterDefinitions } from '../src/data/world/rosters.ts';
import {
  createRosterWorld,
  createManagedWorld,
  createAnnualWorld,
  advanceWorld,
  completeDay,
  worldPhase,
  createScheduledGame,
} from '../src/world/engine.ts';
import { applyManagement } from '../src/world/management.ts';
import { validateWorld } from '../src/world/validation.ts';
import { DexieWorldStorage, WorldDatabase } from '../src/world/dexie-storage.ts';
import { WorldController } from '../src/world/controller.ts';
import { canonicalJson, sha256 } from '../src/storage/codec.ts';
import type { IdealLineup, WorldRecord, ManagementAction } from '../src/world/types.ts';

function replaceBatter(lineup: IdealLineup, playerId: string, index = 0): IdealLineup {
  const next = structuredClone(lineup);
  const previous = next.battingOrder[index]!.playerId;
  next.battingOrder[index]!.playerId = playerId;
  next.defense.forEach((slot) => {
    if (slot.playerId === previous) slot.playerId = playerId;
  });
  return next;
}

function setup() {
  const world = createRosterWorld();
  const squadId = world.management.controlledSquadId;
  const squad = world.definitions.squads.find((item) => item.squadId === squadId)!;
  const lineup = replaceBatter(
    world.management.idealLineups[squadId]!,
    squad.reserveBatterIds![0]!,
  );
  const gameId = world.dayPlan.gameIds.find((id) => {
    const game = world.definitions.schedule.find((game) => game.gameId === id)!;
    return [game.awaySquadId, game.homeSquadId].includes(squadId);
  })!;
  return { world, squad, squadId, lineup, gameId };
}

function finishDate(world: WorldRecord): WorldRecord {
  while (worldPhase(world) === 'playing') world = advanceWorld(world, 25);
  return completeDay(world, world.currentDate);
}

test('控え名簿：60人の能力とIDを検査し、未出場者の不正値・区分重複も拒否', () => {
  const definitions = createRosterDefinitions();
  assert.ok(
    definitions.squads.every(
      (squad) => squad.players.length === 15 && squad.reserveBatterIds!.length === 3,
    ),
  );
  const invalid = structuredClone(definitions);
  invalid.squads[0]!.players.at(-1)!.runningSpeed.valueMilli = -1;
  assert.throws(() => createRosterWorld(1, undefined, invalid));
  const duplicate = structuredClone(definitions);
  duplicate.squads[0]!.reserveBatterIds![0] = duplicate.squads[0]!.team.pitcherIds[0]!;
  assert.throws(() => createRosterWorld(1, undefined, duplicate), /区分/);
  const missing = structuredClone(definitions);
  missing.squads[0]!.players.pop();
  assert.throws(() => createRosterWorld(1, undefined, missing), /区分/);
});

test('控え未使用：旧短期モデルと各試合のスコア・乱数・成績が同じ', () => {
  let old: WorldRecord = createManagedWorld();
  let current: WorldRecord = createRosterWorld();
  while (worldPhase(old) !== 'scheduleComplete') {
    old = finishDate(old);
    current = finishDate(current);
  }
  assert.deepEqual(current.stats, old.stats);
  for (const id of Object.keys(old.games)) {
    assert.deepEqual(current.games[id]!.state.rng, old.games[id]!.state.rng);
    assert.deepEqual(current.games[id]!.result, old.games[id]!.result);
  }
});

test('控えの理想オーダー：実名簿・成績へ反映し、原名簿と前日の記録を変更しない', () => {
  const { world, squad, squadId, lineup, gameId } = setup();
  const original = structuredClone(world);
  let next = applyManagement(world, 'reserve-plan', {
    kind: 'setClubPlan',
    squadId,
    lineup,
    pitchers: world.management.pitcherUsagePlans[squadId]!,
  });
  assert.deepEqual(world, original);
  assert.deepEqual(next.definitions, original.definitions);
  const played = finishDate(next);
  const game = played.games[gameId]!;
  const reserveId = squad.reserveBatterIds![0]!;
  assert.equal(game.fixture.teams.away.lineup[0]!.playerId, reserveId);
  assert.ok(played.stats.batting.some((row) => row.playerId === reserveId));
  assert.equal(
    game.fixture.players.some((player) => player.playerId === 'player-a-01'),
    false,
  );
  const before = canonicalJson(game);
  next = applyManagement(played, 'restore-plan', {
    kind: 'setClubPlan',
    squadId,
    lineup: original.management.idealLineups[squadId]!,
    pitchers: (played as typeof world).management.pitcherUsagePlans[squadId]!,
  });
  assert.equal(canonicalJson(next.games[gameId]), before);
  validateWorld(next);
});

test('当日オーダー：理想案を上書きせず翌日に戻り、解除・同ID再送も再現できる', () => {
  const { world, squadId, lineup, gameId } = setup();
  const action: ManagementAction = { kind: 'setGameLineup', squadId, lineup, gameId };
  const changed = applyManagement(world, 'today', action);
  assert.deepEqual(changed.management.idealLineups, world.management.idealLineups);
  assert.equal(
    createScheduledGame(changed, gameId).fixture.teams.away.lineup[0]!.playerId,
    lineup.battingOrder[0]!.playerId,
  );
  assert.equal(applyManagement(changed, 'today', action), changed);
  const cancelled = applyManagement(changed, 'cancel', { ...action, lineup: null });
  assert.equal(
    createScheduledGame(cancelled, gameId).fixture.teams.away.lineup[0]!.playerId,
    'player-a-01',
  );
  const next = finishDate(changed);
  const nextId = next.dayPlan.gameIds.find((id) => {
    const game = next.definitions.schedule.find((game) => game.gameId === id)!;
    return [game.awaySquadId, game.homeSquadId].includes(squadId);
  })!;
  assert.equal(
    createScheduledGame(next, nextId).fixture.teams.home.lineup[0]!.playerId,
    'player-a-01',
  );
  validateWorld(next);
  validateWorld(cancelled);
});

test('控え/当日指示：他球団・未来・重複・投手・開始後・旧世界を拒否', () => {
  const { world, squadId, lineup, gameId } = setup();
  const action: ManagementAction = { kind: 'setGameLineup', squadId, lineup, gameId };
  assert.throws(
    () => applyManagement(world, 'other', { ...action, squadId: 'aonagi-first' }),
    /担当/,
  );
  assert.throws(
    () => applyManagement(world, 'future', { ...action, gameId: 'G2026-0927-01' }),
    /当日/,
  );
  const duplicated = replaceBatter(lineup, lineup.battingOrder[1]!.playerId);
  assert.throws(
    () => applyManagement(world, 'duplicate', { ...action, lineup: duplicated }),
    /重複/,
  );
  const pitcher = replaceBatter(lineup, world.definitions.squads[0]!.team.pitcherIds[0]!);
  assert.throws(() => applyManagement(world, 'pitcher', { ...action, lineup: pitcher }), /野手/);
  const foreign = replaceBatter(lineup, 'player-h-13');
  assert.throws(() => applyManagement(world, 'foreign', { ...action, lineup: foreign }), /野手/);
  assert.throws(() => applyManagement(advanceWorld(world, 1), 'started', action), /始める前/);
  for (const legacy of [createManagedWorld(), createAnnualWorld()]) {
    assert.throws(
      () => applyManagement(legacy, 'old', { ...action, gameId: legacy.dayPlan.gameIds[0]! }),
      /新しい/,
    );
  }
});

test('控え保存：途中再開・当日履歴改変拒否・保存失敗で正本を保ち再試行', async () => {
  const { world, squadId, lineup, gameId } = setup();
  const db = new WorldDatabase('roster-save-' + crypto.randomUUID());
  const storage = new DexieWorldStorage(db);
  try {
    const controller = new WorldController(storage);
    const before = await controller.initialize();
    const command = {
      kind: 'setGameLineup' as const,
      squadId,
      gameId,
      lineup,
      commandId: 'today',
      localWorldId: 'v02-local' as const,
      expectedStateRevision: before.revision,
    };
    const fail = () => {
      throw new Error('quota');
    };
    db.save_snapshots.hook('creating', fail);
    await assert.rejects(controller.dispatch(command), /quota/);
    assert.deepEqual(controller.query().gameLineups, {});
    assert.equal(controller.query().revision, before.revision);
    db.save_snapshots.hook('creating').unsubscribe(fail);
    const after = await controller.dispatch(command);
    assert.ok(after.gameLineups![gameId]);
    assert.deepEqual(await controller.dispatch(command), after);
    let changed: WorldRecord = applyManagement(world, 'today', {
      kind: 'setGameLineup',
      squadId,
      gameId,
      lineup,
    });
    changed = advanceWorld(changed, 17);
    await storage.save(changed, 2, 'manual', 1);
    const restored = (await storage.load('manual')).world;
    assert.deepEqual(restored, changed);
    assert.deepEqual(finishDate(restored), finishDate(changed));
    const invalid = structuredClone(restored);
    if (invalid.version === 'world-prototype-v4') invalid.gameLineups = {};
    assert.throws(() => validateWorld(invalid));
  } finally {
    await db.delete();
  }
});

test('控え互換性：3d276b8の実年間保存と途中再開ハッシュを維持', async () => {
  const fixture = JSON.parse(
    gunzipSync(readFileSync(new URL('./fixtures/world-v3-save.json.gz', import.meta.url))).toString(
      'utf8',
    ),
  );
  assert.equal(fixture.digest, 'da5e928f36f2610eecb6956335e41ec5f6440ac6e6907c981d760117a2dae930');
  const db = new WorldDatabase('roster-legacy-' + crypto.randomUUID());
  try {
    for (const table of db.tables)
      await table.bulkPut(
        fixture.tables[table.name].map((row: Record<string, unknown>) =>
          table.name === 'save_blocks'
            ? { ...row, payloadBytes: new Uint8Array(row.payloadBytes as number[]) }
            : row,
        ),
      );
    const storage = new DexieWorldStorage(db);
    const saved = (await storage.load('auto')).world;
    assert.equal(saved.version, 'world-prototype-v3');
    assert.equal(await sha256(canonicalJson(saved)), fixture.digest);
    assert.equal(
      await sha256(canonicalJson(finishDate((await storage.load('manual')).world))),
      fixture.digest,
    );
  } finally {
    await db.delete();
  }
});

test('共通data：全球団の独立編集が新規入力へ届き、他球団と開始済み世界へ波及しない', async () => {
  const { players: hoshihara } = await import('../src/data/players/hoshihara.ts');
  const { players: kohaku } = await import('../src/data/players/kohaku.ts');
  const { squad: kohakuTeam } = await import('../src/data/teams/kohaku.ts');
  const { createCurrentFixture } = await import('../src/data/datasets/current.ts');
  const oldPlayer = structuredClone(hoshihara[0]!);
  const oldTeamName = kohakuTeam.team.name;
  const started = createRosterWorld();
  const oldWorld = structuredClone(started);
  const kohakuPower = kohaku[0]!.powerVsRight.valueMilli;
  try {
    hoshihara[0]!.familyName = '共通編集';
    hoshihara[0]!.powerVsRight.valueMilli = 110000;
    kohakuTeam.team.name = '湖白編集確認';
    const next = createRosterWorld();
    assert.equal(next.definitions.squads[0]!.players[0]!.familyName, '共通編集');
    assert.equal(createCurrentFixture().players[0]!.familyName, '共通編集');
    assert.equal(next.definitions.squads[2]!.team.name, '湖白編集確認');
    assert.equal(kohaku[0]!.powerVsRight.valueMilli, kohakuPower);
    assert.deepEqual(started, oldWorld);
    validateWorld(started);
  } finally {
    Object.assign(hoshihara[0]!, oldPlayer);
    kohakuTeam.team.name = oldTeamName;
  }
});
