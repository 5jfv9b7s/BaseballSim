import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { createFarmDefinitions } from '../src/data/world/farm.ts';
import { players as farmPlayers } from '../src/data/farm/hoshihara/players.ts';
import { farmConfig } from '../config/farm.ts';
import {
  createFarmWorld,
  createRosterPolicyWorld,
  createScheduledGame,
  advanceWorld,
  completeDay,
  worldPhase,
} from '../src/world/engine.ts';
import { applyManagement } from '../src/world/management.ts';
import { registrationPreview, registeredIds } from '../src/world/registration.ts';
import { rosterPolicyView } from '../src/world/roster-policy.ts';
import { statsForScope, standings } from '../src/world/stats.ts';
import { gameScope, worldSquad } from '../src/world/squads.ts';
import { validateWorld } from '../src/world/validation.ts';
import { DexieWorldStorage, WorldDatabase } from '../src/world/dexie-storage.ts';
import { WorldController } from '../src/world/controller.ts';
import type { WorldRecord, WorldDefinitions } from '../src/world/types.ts';

type FarmWorld = Extract<WorldRecord, { version: 'world-prototype-v7' }>;
const squadId = 'hoshihara-first';
const farmId = 'hoshihara-farm';
function finishGames<T extends WorldRecord>(world: T): T {
  let next: WorldRecord = world;
  let steps = 0;
  while (worldPhase(next) === 'playing') {
    assert.ok(steps++ < 2000, '1日の試合が上限内で終わる');
    next = advanceWorld(next, 25);
  }
  assert.equal(worldPhase(next), 'readyToComplete');
  return next as T;
}
function finishDate<T extends WorldRecord>(world: T): T {
  const ready = finishGames(world);
  return completeDay(ready, ready.currentDate) as T;
}
function exchange(world: FarmWorld): FarmWorld {
  return applyManagement(world, 'exchange-' + world.currentDate, {
    kind: 'setRegistrations',
    squadId,
    changes: [
      { playerId: 'player-a-01', category: 'farm' },
      { playerId: 'player-a-16', category: 'first' },
    ],
  }) as FarmWorld;
}

test('二軍データ：4球団120人・72持ち球、所属は一人一件で能力の正本を共有', () => {
  const world = createFarmWorld();
  assert.equal(world.registration.memberships.length, 120);
  assert.equal(new Set(world.registration.memberships.map((row) => row.playerId)).size, 120);
  assert.equal(
    world.definitions.squads.reduce((sum, squad) => sum + squad.pitches.length, 0),
    72,
  );
  for (const squad of world.definitions.squads) assert.equal(squad.players.length, 30);
  assert.equal(registeredIds(world, squadId).length, 15);
  assert.equal(registeredIds(world, farmId).length, 15);
  const fixture = createScheduledGame(world, 'G2026-farm-0924-01').fixture;
  assert.equal(fixture.teams.away.name, '星原フォックス 二軍');
  assert.ok(
    fixture.teams.away.lineup.every((slot) => registeredIds(world, farmId).includes(slot.playerId)),
  );
  assert.equal(
    worldSquad(world.definitions, farmId)!.players,
    world.definitions.squads[0]!.players,
  );
  const original = structuredClone(world);
  const oldName = farmPlayers[0]!.familyName;
  const oldLimit = farmConfig.benchLimit;
  try {
    farmPlayers[0]!.familyName = '編集用';
    farmConfig.benchLimit = 20;
    const edited = createFarmWorld();
    assert.equal(edited.definitions.squads[0]!.players[15]!.familyName, '編集用');
    assert.equal(edited.definitions.farm!.benchLimit, 20);
    assert.deepEqual(world, original);
    validateWorld(world);
  } finally {
    farmPlayers[0]!.familyName = oldName;
    farmConfig.benchLimit = oldLimit;
  }
});

test('二軍定義：所属不一致、ID・守備重複、一軍との対戦、期限外、旧版への混入を拒否', () => {
  for (const mutate of [
    (d: WorldDefinitions) => {
      d.farm!.squads[0]!.team.clubId = 'missing';
    },
    (d: WorldDefinitions) => {
      d.farm!.squads[0]!.squadId = d.squads[0]!.squadId;
    },
    (d: WorldDefinitions) => {
      d.farm!.squads[0]!.team.lineup[0]!.playerId = 'player-h-16';
    },
    (d: WorldDefinitions) => {
      d.farm!.squads[0]!.team.lineup[0]!.position = d.farm!.squads[0]!.team.lineup[1]!.position;
    },
    (d: WorldDefinitions) => {
      d.farm!.squads[0]!.team.pitcherIds[0] = 'player-h-25';
    },
    (d: WorldDefinitions) => {
      d.schedule[6]!.homeSquadId = 'aonagi-first';
    },
    (d: WorldDefinitions) => {
      d.schedule[6]!.date = '2026-09-27';
    },
    (d: WorldDefinitions) => {
      d.schedule.push({ ...d.schedule[6]!, gameId: 'farm-duplicate-date' });
    },
    (d: WorldDefinitions) => {
      d.farm!.endDate = '2026-02-30';
    },
    (d: WorldDefinitions) => {
      d.farm!.competitionId = d.competitionId;
    },
    (d: WorldDefinitions) => {
      d.squads[0]!.registrationInputs!.filter((row) => row.category === 'farm').forEach((row) => {
        row.category = 'first';
      });
    },
  ]) {
    const definitions = createFarmDefinitions();
    mutate(definitions);
    assert.throws(() => createFarmWorld(1, undefined, definitions));
  }
  const old = createRosterPolicyWorld();
  old.definitions.farm = createFarmDefinitions().farm;
  assert.throws(() => validateWorld(old), /旧定義/);
});

test('同日4試合：一軍完了だけでは翌日へ進めず、二軍も完了後に日次確定', () => {
  let world = createFarmWorld();
  while (world.dayPlan.cursor < 2) world = advanceWorld(world, 25) as FarmWorld;
  assert.throws(() => completeDay(world, world.currentDate), /全試合/);
  assert.ok(
    world.stats.teams
      .filter((row) => row.statScope === 'firstRegular')
      .every((row) => row.games === 1),
  );
  assert.ok(
    world.stats.teams
      .filter((row) => row.statScope === 'farmRegular')
      .every((row) => row.games === 0),
  );
  world = finishDate(world);
  assert.equal(world.currentDate, '2026-09-25');
  assert.equal(Object.keys(world.statApplicationMarkers).length, 4);
  assert.equal(standings(world.stats).length, 4);
  assert.equal(standings(world.stats, 'farmRegular').length, 4);
  const usedFirst = world.registration.gameRosters['G2026-0924-01']!.away.playerIds;
  const usedFarm = world.registration.gameRosters['G2026-farm-0924-01']!.away.playerIds;
  assert.equal(
    usedFirst.some((id) => usedFarm.includes(id)),
    false,
  );
  validateWorld(world);
});

test('一軍休養日も二軍を処理し、二軍期限に独立した要約を一度だけ確定', () => {
  let world = finishDate(finishDate(createFarmWorld()));
  assert.equal(world.currentDate, '2026-09-26');
  assert.ok(world.dayPlan.gameIds.every((id) => id.includes('farm')));
  const first = structuredClone(statsForScope(world.stats, 'firstRegular'));
  world = finishDate(world);
  assert.deepEqual(statsForScope(world.stats, 'firstRegular'), first);
  assert.equal(world.seasonSummary, null);
  assert.equal(world.farmSummary!.games, 4);
  assert.equal(world.farmSummary!.completedOn, '2026-09-26');
  assert.equal(world.farmSummary!.statScope, 'farmRegular');
  const farmSummary = structuredClone(world.farmSummary);
  world = finishDate(world);
  assert.equal(world.seasonSummary!.games, 6);
  assert.deepEqual(world.farmSummary, farmSummary);
  assert.equal(Object.keys(world.games).length, 10);
  assert.throws(() => completeDay(world, world.currentDate));
  validateWorld(world);
});

test('昇降格：選手ID・能力・所属を保持し、一軍と二軍の成績・過去名簿を分離', () => {
  let world = finishDate(createFarmWorld());
  const firstGame = structuredClone(world.games['G2026-0924-01']);
  const memberships = structuredClone(world.registration.memberships);
  const players = structuredClone(world.definitions.squads[0]!.players);
  const oldFirstStats = structuredClone(
    statsForScope(world.stats, 'firstRegular').batting.find(
      (row) => row.playerId === 'player-a-01',
    ),
  );
  world = exchange(world);
  assert.deepEqual(world.registration.memberships, memberships);
  assert.deepEqual(world.definitions.squads[0]!.players, players);
  assert.equal(registeredIds(world, squadId).includes('player-a-16'), true);
  assert.equal(registeredIds(world, farmId).includes('player-a-01'), true);
  world = finishDate(world);
  assert.equal(registrationPreview(world, farmId)!.lineup[0]!.playerId, 'player-a-01');
  world = finishDate(world);
  assert.deepEqual(
    statsForScope(world.stats, 'firstRegular').batting.find(
      (row) => row.playerId === 'player-a-01',
    ),
    oldFirstStats,
  );
  const farmLine = statsForScope(world.stats, 'farmRegular').batting.find(
    (row) => row.playerId === 'player-a-01',
  )!;
  assert.ok(farmLine.plateAppearances > 0);
  assert.equal(farmLine.competitionId, world.definitions.farm!.competitionId);
  assert.equal(farmLine.squadId, farmId);
  assert.deepEqual(world.games['G2026-0924-01'], firstGame);
  validateWorld(world);
});

test('二軍人数不足を手動・固定希望とも防ぎ、外国人の一軍枠を二軍へ流用しない', () => {
  const world = createFarmWorld();
  const changes = ['16', '17', '18', '19'].map((suffix) => ({
    playerId: 'player-a-' + suffix,
    category: 'first' as const,
  }));
  assert.throws(
    () => applyManagement(world, 'not-enough-farm', { kind: 'setRegistrations', squadId, changes }),
    /二軍.*野手9人/,
  );
  const preferences = rosterPolicyView(world).preferences.map(({ playerId, preference }) => ({
    playerId,
    preference: changes.some((row) => row.playerId === playerId)
      ? ('firstFixed' as const)
      : preference,
  }));
  const pending = applyManagement(world, 'fixed-not-enough', {
    kind: 'setRosterPolicy',
    squadId,
    changeMode: 'auto',
    preferences,
  }) as FarmWorld;
  assert.match(rosterPolicyView(pending).reason!, /二軍.*野手9人/);
  assert.deepEqual(pending.registration, world.registration);
  assert.throws(
    () =>
      applyManagement(world, 'no-farm-pitcher', {
        kind: 'setRegistrations',
        squadId,
        changes: ['25', '26', '27'].map((suffix) => ({
          playerId: 'player-a-' + suffix,
          category: 'first',
        })),
      }),
    /二軍.*投手/,
  );
  const definitions = createFarmDefinitions();
  for (const row of definitions.squads[0]!.registrationInputs!)
    if (row.category === 'farm') row.foreignBaseStatus = 'subject';
  const foreignFarm = createFarmWorld(1, undefined, definitions);
  assert.equal(registrationPreview(foreignFarm, farmId)!.roster.playerIds.length, 15);
  validateWorld(pending);
});

test('未編集なら全一軍試合の記録・乱数・成績は旧v6と同一で、二軍の表示は非破壊', () => {
  let old: WorldRecord = createRosterPolicyWorld();
  let world = createFarmWorld();
  const before = structuredClone(world);
  registrationPreview(world, farmId);
  standings(world.stats, 'farmRegular');
  assert.deepEqual(world, before);
  while (worldPhase(world) !== 'scheduleComplete') {
    old = finishDate(old);
    world = finishDate(world);
  }
  for (const [id, game] of Object.entries(old.games)) assert.deepEqual(world.games[id], game);
  assert.deepEqual(statsForScope(world.stats, 'firstRegular'), old.stats);
  assert.deepEqual(world.seasonSummary, 'seasonSummary' in old ? old.seasonSummary : null);
});

test('二軍途中の保存・再開と旧v6固定保存の互換性、成績混入・名簿改変を拒否', async () => {
  let world = createFarmWorld();
  while (world.dayPlan.cursor < 2) world = advanceWorld(world, 25) as FarmWorld;
  world = advanceWorld(world, 17) as FarmWorld;
  const db = new WorldDatabase('farm-midgame');
  const storage = new DexieWorldStorage(db);
  try {
    await storage.save(world, 1, 'manual', 0);
    const restored = (await storage.load('manual')).world;
    assert.deepEqual(restored, world);
    assert.deepEqual(finishDate(restored), finishDate(world));
    const completed = finishDate(world);
    for (const mutate of [
      (w: FarmWorld) => {
        w.stats.batting.find((row) => row.statScope === 'farmRegular')!.statScope = 'firstRegular';
      },
      (w: FarmWorld) => {
        w.registration.gameRosters['G2026-farm-0924-01']!.away.participants[0]!.playerId =
          'player-a-01';
      },
      (w: FarmWorld) => {
        w.management.pitcherUsagePlans[farmId]!.nextSlotNo = 2;
      },
    ]) {
      const bad = structuredClone(completed);
      mutate(bad);
      assert.throws(() => validateWorld(bad));
    }
    const bytes = readFileSync(new URL('./fixtures/world-v6-save.json.gz', import.meta.url));
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      '8edc2ece17637e68c1e7bbda50ee4a4529c33083987b6e9384b01629f6abb573',
    );
    const old = JSON.parse(gunzipSync(bytes).toString()) as WorldRecord;
    validateWorld(old);
    await storage.save(old, 2, 'manual', 1);
    const oldLoaded = (await storage.load('manual')).world;
    assert.deepEqual(oldLoaded, old);
    assert.equal(oldLoaded.version, 'world-prototype-v6');
    assert.deepEqual(finishDate(oldLoaded), finishDate(old));
  } finally {
    await db.delete();
  }
});

test('日次保存失敗：一軍・二軍両方の結果を保持し、再試行で一度だけ翌日公開', async () => {
  const world = finishGames(createFarmWorld());
  const db = new WorldDatabase('farm-day-retry');
  const storage = new DexieWorldStorage(db);
  await storage.save(world, 1, 'manual', 0);
  let fail = false;
  const controller = new WorldController({
    listSlots: () => storage.listSlots(),
    load: (slot) => storage.load(slot),
    save: (...args) => {
      if (fail) throw Error('farm test save failure');
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
    assert.equal(controller.query().currentDate, before.currentDate);
    assert.deepEqual(controller.query().stats, before.stats);
    assert.deepEqual(controller.query().farm, before.farm);
    fail = false;
    const after = await controller.dispatch(command);
    assert.equal(after.currentDate, '2026-09-25');
    assert.deepEqual(await controller.dispatch(command), after);
    assert.deepEqual((await storage.load('auto')).world, completeDay(world, world.currentDate));
  } finally {
    await db.delete();
  }
});

test('年間：一軍144・二軍72試合、独立期限、188日完走と両区分の保存復元', async () => {
  const definitions = createFarmDefinitions('annual');
  assert.equal(
    definitions.schedule.filter((game) => gameScope(definitions, game) === 'firstRegular').length,
    144,
  );
  assert.equal(
    definitions.schedule.filter((game) => gameScope(definitions, game) === 'farmRegular').length,
    72,
  );
  assert.equal(definitions.farm!.endDate, '2026-09-15');
  let world = createFarmWorld(20260924, undefined, definitions);
  while (worldPhase(world) !== 'scheduleComplete') world = finishDate(world);
  assert.equal(world.completedDates.length, 188);
  assert.equal(world.seasonSummary!.games, 144);
  assert.equal(world.farmSummary!.games, 72);
  assert.ok(world.seasonSummary!.clubs.every((row) => row.games === 72));
  assert.ok(world.farmSummary!.clubs.every((row) => row.games === 36));
  const db = new WorldDatabase('farm-annual');
  const storage = new DexieWorldStorage(db);
  try {
    await storage.save(world, 1, 'auto', 0);
    assert.deepEqual((await storage.load('auto')).world, world);
  } finally {
    await db.delete();
  }
});
