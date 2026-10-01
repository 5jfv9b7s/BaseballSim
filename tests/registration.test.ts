import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { registrationRules } from '../config/registration.ts';
import { registrations as hoshiharaInputs } from '../src/data/registrations/hoshihara.ts';
import { createRegistrationDefinitions } from '../src/data/world/registrations.ts';
import {
  createRegistrationWorld,
  createRosterWorld,
  createScheduledGame,
  advanceWorld,
  completeDay,
  worldPhase,
} from '../src/world/engine.ts';
import { applyManagement } from '../src/world/management.ts';
import { registeredIds, registrationPreview } from '../src/world/registration.ts';
import { validateWorld } from '../src/world/validation.ts';
import { canonicalJson, sha256 } from '../src/storage/codec.ts';
import { DexieWorldStorage, WorldDatabase } from '../src/world/dexie-storage.ts';
import { WorldController } from '../src/world/controller.ts';
import type { WorldRecord, WorldDefinitions, ManagementAction } from '../src/world/types.ts';
import type { RegisteredWorld } from '../src/world/registration.ts';

const squadId = 'hoshihara-first';
const batter = 'player-a-01';
const reserve = 'player-a-13';
const change = (
  world: WorldRecord,
  commandId: string,
  playerId: string,
  category: 'first' | 'farm',
) =>
  applyManagement(world, commandId, {
    kind: 'setRegistrations',
    squadId,
    changes: [{ playerId, category }],
  }) as RegisteredWorld;
function finishDate(world: WorldRecord): WorldRecord {
  while (worldPhase(world) === 'playing') world = advanceWorld(world, 25);
  return completeDay(world, world.currentDate);
}
function restDefinitions(): WorldDefinitions {
  const definitions = createRegistrationDefinitions();
  definitions.schedule = [];
  definitions.endDate = '2026-10-10';
  return definitions;
}
function enlarged(count: number): WorldDefinitions {
  const definitions = restDefinitions();
  const squad = definitions.squads[0]!;
  while (squad.players.length < count) {
    const playerId = 'extra-player-' + squad.players.length;
    squad.players.push({ ...structuredClone(squad.players[0]!), playerId });
    squad.reserveBatterIds!.push(playerId);
    squad.registrationInputs!.push({ playerId, category: 'farm', foreignBaseStatus: 'exempt' });
  }
  return definitions;
}

test('登録初期値：全60人・開始時規則・編集ファイルを分離し、欠損や不正区分を拒否', () => {
  const world = createRegistrationWorld();
  assert.equal(world.registration.memberships.length, 60);
  assert.equal(world.registration.registrations.length, 60);
  validateWorld(world);
  const original = canonicalJson(world);
  const first = hoshiharaInputs[0]!.category;
  const days = registrationRules.reentryDays;
  try {
    hoshiharaInputs[0]!.category = 'farm';
    registrationRules.reentryDays = 12;
    const edited = createRegistrationWorld();
    assert.equal(edited.registration.registrations[0]!.category, 'farm');
    assert.equal(edited.definitions.registrationRules!.reentryDays, 12);
    assert.equal(canonicalJson(world), original);
    assert.equal(
      edited.registration.registrations.find((row) => row.playerId === 'player-h-01')!.category,
      'first',
    );
  } finally {
    hoshiharaInputs[0]!.category = first;
    registrationRules.reentryDays = days;
  }
  for (const corrupt of [
    (d: WorldDefinitions) => d.squads[0]!.registrationInputs!.pop(),
    (d: WorldDefinitions) => {
      d.squads[0]!.registrationInputs![0]!.category = 'unknown' as never;
    },
    (d: WorldDefinitions) => {
      d.registrationRules!.reentryDays = NaN;
    },
  ]) {
    const invalid = createRegistrationDefinitions();
    corrupt(invalid);
    assert.throws(() => createRegistrationWorld(1, undefined, invalid));
  }
});

test('抹消：所属と理想案を保持し、当日のみ代役。履歴は半開区間で再現', () => {
  const original = createRegistrationWorld();
  const world = change(original, 'demote', batter, 'farm');
  assert.deepEqual(world.registration.memberships, original.registration.memberships);
  assert.deepEqual(world.management.idealLineups, original.management.idealLineups);
  assert.equal(original.registration.registrations.length, 60);
  const history = world.registration.registrations.filter((row) => row.playerId === batter);
  assert.deepEqual(history[0]!.until, history[1]!.from);
  assert.equal(history[1]!.nextFirstEligibleOn, '2026-10-04');
  assert.equal(registrationPreview(world)!.lineup[0]!.playerId, reserve);
  const game = createScheduledGame(world, registrationPreview(world)!.gameId);
  assert.ok(!game.fixture.players.some((player) => player.playerId === batter));
  validateWorld(world);
  assert.deepEqual(change(world, 'demote', batter, 'farm'), world);
  assert.throws(() => change(world, 'demote', batter, 'first'), /同じ編成指示/);
});

test('再登録：休養日も暦日で待ち、前日を拒否・10日後を許可。再抹消は新しい待ち期間', () => {
  let world: WorldRecord = change(
    createRegistrationWorld(1, undefined, restDefinitions()),
    'down',
    batter,
    'farm',
  );
  assert.throws(() => change(world, 'same-day', batter, 'first'), /2026-10-04/);
  while (world.currentDate < '2026-10-03') world = finishDate(world);
  assert.throws(() => change(world, 'day9', batter, 'first'), /再登録可能日/);
  world = finishDate(world);
  world = change(world, 'day10', batter, 'first');
  assert.ok(registeredIds(world as RegisteredWorld, squadId).includes(batter));
  world = change(world, 'again', batter, 'farm');
  const rows = (world as RegisteredWorld).registration.registrations.filter(
    (row) => row.playerId === batter,
  );
  assert.equal(rows.at(-1)!.nextFirstEligibleOn, '2026-10-14');
  validateWorld(world);
});

test('ベンチ：休養と抹消を分離し、当日だけ適用。未出場控えの成績を捏造しない', () => {
  const start = createRegistrationWorld();
  const gameId = registrationPreview(start)!.gameId;
  const playerIds = registrationPreview(start)!.roster.playerIds.filter(
    (id) => id !== batter && id !== 'player-a-12',
  );
  const selected = applyManagement(start, 'bench', {
    kind: 'setGameBench',
    squadId,
    gameId,
    playerIds,
  }) as RegisteredWorld;
  assert.ok(registeredIds(selected, squadId).includes(batter));
  assert.deepEqual(selected.registration.registrations, start.registration.registrations);
  const completed = finishDate(selected) as RegisteredWorld;
  const roster = completed.registration.gameRosters[gameId]!.away;
  assert.equal(roster.playerIds.includes(batter), false);
  assert.equal(roster.participants.find((p) => p.playerId === reserve)!.appeared, true);
  assert.equal(roster.participants.find((p) => p.playerId === 'player-a-14')!.appeared, false);
  assert.ok(!completed.stats.batting.some((row) => row.playerId === 'player-a-14'));
  assert.ok(registrationPreview(completed)!.roster.playerIds.includes(batter));
  assert.equal(registrationPreview(completed)!.lineup[0]!.playerId, batter);
  const changed = change(completed, 'after-game', reserve, 'farm');
  assert.deepEqual(changed.registration.gameRosters, completed.registration.gameRosters);
  validateWorld(changed);
});

test('資格：31人・26人・70人と外国人5人・4人の境界を検査し、一括入替を許可', () => {
  const definitions = enlarged(35);
  const entries = definitions.squads[0]!.registrationInputs!;
  entries.forEach((entry, index) => {
    entry.category = index < 31 ? 'first' : 'farm';
  });
  entries.slice(15, 20).forEach((entry) => {
    entry.foreignBaseStatus = 'subject';
  });
  const world = createRegistrationWorld(1, undefined, definitions);
  assert.throws(() => change(world, 'over31', entries[31]!.playerId, 'first'), /31人/);
  const exchanged = applyManagement(world, 'swap31', {
    kind: 'setRegistrations',
    squadId,
    changes: [
      { playerId: entries[31]!.playerId, category: 'first' },
      { playerId: entries[30]!.playerId, category: 'farm' },
    ],
  }) as RegisteredWorld;
  assert.equal(registeredIds(exchanged, squadId).length, 31);
  const overForeign = structuredClone(definitions);
  overForeign.squads[0]!.registrationInputs![20]!.foreignBaseStatus = 'subject';
  assert.throws(() => createRegistrationWorld(1, undefined, overForeign), /外国人.*5人/);
  const seventy = enlarged(70);
  createRegistrationWorld(1, undefined, seventy);
  assert.throws(() => createRegistrationWorld(1, undefined, enlarged(71)));

  const gameDefinitions = structuredClone(definitions);
  gameDefinitions.schedule = createRegistrationDefinitions().schedule;
  const gameWorld = createRegistrationWorld(1, undefined, gameDefinitions);
  const gameId = registrationPreview(gameWorld)!.gameId;
  const first = registeredIds(gameWorld, squadId);
  assert.throws(
    () =>
      applyManagement(gameWorld, 'over26', {
        kind: 'setGameBench',
        squadId,
        gameId,
        playerIds: first.slice(0, 27),
      }),
    /26人/,
  );
  assert.throws(
    () =>
      applyManagement(gameWorld, 'foreign5', {
        kind: 'setGameBench',
        squadId,
        gameId,
        playerIds: first.slice(0, 20),
      }),
    /外国人.*4人/,
  );
  const legal = first.filter((id) => id !== entries[19]!.playerId).slice(0, 26);
  const bench = applyManagement(gameWorld, 'bench26', {
    kind: 'setGameBench',
    squadId,
    gameId,
    playerIds: legal,
  }) as RegisteredWorld;
  assert.equal(registrationPreview(bench)!.roster.playerIds.length, 26);
  validateWorld(bench);
});

test('不正操作：他球団・重複・人数不足・未来・開始後・明示起用との矛盾を拒否', () => {
  const world = createRegistrationWorld();
  const gameId = registrationPreview(world)!.gameId;
  const rejected: ManagementAction[] = [
    {
      kind: 'setRegistrations',
      squadId: 'aonagi-first',
      changes: [{ playerId: 'player-h-01', category: 'farm' }],
    },
    { kind: 'setRegistrations', squadId, changes: [{ playerId: 'player-h-01', category: 'farm' }] },
    {
      kind: 'setRegistrations',
      squadId,
      changes: [
        { playerId: batter, category: 'farm' },
        { playerId: batter, category: 'first' },
      ],
    },
    {
      kind: 'setRegistrations',
      squadId,
      changes: ['player-a-10', 'player-a-11', 'player-a-12'].map((playerId) => ({
        playerId,
        category: 'farm',
      })),
    },
    { kind: 'setGameBench', squadId, gameId, playerIds: [batter, batter] },
    { kind: 'setGameBench', squadId, gameId: 'future', playerIds: null },
    { kind: 'setGameBench', squadId, gameId, playerIds: ['player-a-10'] },
  ];
  for (const action of rejected) assert.throws(() => applyManagement(world, 'invalid', action));
  const explicit = applyManagement(world, 'order', {
    kind: 'setGameLineup',
    squadId,
    gameId,
    lineup: world.management.idealLineups[squadId]!,
  });
  assert.throws(() => change(explicit, 'down', batter, 'farm'), /当日オーダー/);
  const started = advanceWorld(world, 1);
  assert.throws(() => change(started, 'started', batter, 'farm'), /始める前/);
  assert.throws(() => change(createRosterWorld(), 'old', batter, 'farm'), /新規プレイ/);
});

test('旧結果維持：登録変更なしならv4と全試合・成績・乱数が一致', () => {
  let old: WorldRecord = createRosterWorld();
  let next: WorldRecord = createRegistrationWorld();
  while (worldPhase(old) !== 'scheduleComplete') {
    old = finishDate(old);
    next = finishDate(next);
  }
  assert.deepEqual(next.games, old.games);
  assert.deepEqual(next.stats, old.stats);
  validateWorld(next);
});

test('保存：途中復帰・資格履歴の改ざん検出・旧v4の固定保存互換', async () => {
  const old = JSON.parse(
    gunzipSync(
      readFileSync(new URL('./fixtures/world-v4-save.json.gz', import.meta.url)),
    ).toString(),
  ) as WorldRecord;
  assert.equal(
    await sha256(canonicalJson(old)),
    'c628176527e11a77052d2fbb3eb4b5243ea2b0eadc610406761fbff94cdacc0f',
  );
  validateWorld(old);
  const db = new WorldDatabase('registration-save');
  const storage = new DexieWorldStorage(db);
  try {
    const world = advanceWorld(
      change(createRegistrationWorld(), 'down', batter, 'farm'),
      17,
    ) as RegisteredWorld;
    await storage.save(world, 1, 'manual', 0);
    const restored = (await storage.load('manual')).world;
    assert.deepEqual(finishDate(restored), finishDate(world));
    const bad = structuredClone(world);
    bad.registration.registrations.at(-1)!.nextFirstEligibleOn = null;
    assert.throws(() => validateWorld(bad));
    const changed = structuredClone(world);
    changed.registration.gameRosters[world.dayPlan.gameIds[0]!]!.away.participants[0]!.appeared =
      false;
    assert.throws(() => validateWorld(changed));
    await storage.save(old, 2, 'manual', 1);
    assert.deepEqual((await storage.load('manual')).world, old);
  } finally {
    await db.delete();
  }
});

test('保存失敗：登録と表示を公開せず同じ指示の再試行で一度だけ確定', async () => {
  const db = new WorldDatabase('registration-retry');
  const storage = new DexieWorldStorage(db);
  let fail = true;
  const controller = new WorldController({
    listSlots: () => storage.listSlots(),
    load: (kind) => storage.load(kind),
    save: (...args) => {
      if (fail) throw new Error('test write failure');
      return storage.save(...args);
    },
  });
  try {
    const view = await controller.initialize();
    const command = {
      kind: 'setRegistrations' as const,
      squadId,
      changes: [{ playerId: batter, category: 'farm' as const }],
      commandId: 'retry',
      expectedStateRevision: view.revision,
      localWorldId: 'v02-local' as const,
    };
    await assert.rejects(controller.dispatch(command));
    assert.deepEqual(controller.query().registration, view.registration);
    fail = false;
    const applied = await controller.dispatch(command);
    assert.equal(
      applied.registration!.registrations.length,
      view.registration!.registrations.length,
    );
    assert.equal(
      applied.registration!.registrations.find((row) => row.playerId === batter)!.category,
      'farm',
    );
    assert.equal('gameRosters' in applied.registration!, false);
    assert.deepEqual(await controller.dispatch(command), applied);
    const saved = (await storage.load('auto')).world as RegisteredWorld;
    assert.equal(
      saved.registration.registrations.length,
      view.definitions.squads.reduce((sum, squad) => sum + squad.players.length, 0) + 1,
    );
  } finally {
    await db.delete();
  }
});

test('投手登録と休養：ローテ割当を保持し、登録外の予定先発を救援から代替する', () => {
  const start = createRegistrationWorld();
  const pitchers = {
    rotationSlots: [
      { slotNo: 1, playerId: 'player-a-10' },
      { slotNo: 2, playerId: 'player-a-11' },
    ],
    nextSlotNo: 1,
    reliefRoles: [{ playerId: 'player-a-12', role: 'relief' as const, priority: 1 }],
  };
  const planned = applyManagement(start, 'rotation', {
    kind: 'setClubPlan',
    squadId,
    lineup: start.management.idealLineups[squadId]!,
    pitchers,
  }) as RegisteredWorld;
  assert.equal(registrationPreview(planned)!.roster.playerIds.includes('player-a-11'), false);
  assert.ok(registeredIds(planned, squadId).includes('player-a-11'));
  const absent = change(planned, 'pitcher-down', 'player-a-10', 'farm');
  assert.equal(registrationPreview(absent)!.starterId, 'player-a-12');
  assert.deepEqual(absent.management.pitcherUsagePlans[squadId], pitchers);
  const completed = finishDate(absent) as RegisteredWorld;
  assert.equal(completed.management.pitcherUsagePlans[squadId]!.nextSlotNo, 2);
  assert.equal(registrationPreview(completed)!.starterId, 'player-a-11');
  validateWorld(completed);
});
