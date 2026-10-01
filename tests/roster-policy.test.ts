import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { createRosterPolicyDefinitions } from '../src/data/world/roster-policies.ts';
import { rosterPolicy as initialPolicy } from '../src/data/roster-policies/hoshihara.ts';
import {
  createRosterPolicyWorld,
  createFarmWorld,
  createRegistrationWorld,
  completeDay,
  advanceWorld,
  worldPhase,
} from '../src/world/engine.ts';
import { applyManagement } from '../src/world/management.ts';
import { registeredIds, registrationPreview } from '../src/world/registration.ts';
import { rosterPolicyView, type RosterPolicyWorld } from '../src/world/roster-policy.ts';
import { validateWorld } from '../src/world/validation.ts';
import { DexieWorldStorage, WorldDatabase } from '../src/world/dexie-storage.ts';
import { WorldController } from '../src/world/controller.ts';
import type {
  RosterChangeMode,
  RosterPreference,
  RosterPolicyAction,
} from '../src/world/roster-policy-types.ts';
import type { WorldRecord } from '../src/world/types.ts';

const squadId = 'hoshihara-first';
const batter = 'player-a-01';
function action(
  world: RosterPolicyWorld,
  mode: RosterChangeMode,
  changes: Record<string, RosterPreference> = {},
): RosterPolicyAction {
  return {
    kind: 'setRosterPolicy',
    squadId,
    changeMode: mode,
    preferences: rosterPolicyView(world).preferences.map(({ playerId, preference }) => ({
      playerId,
      preference: changes[playerId] ?? preference,
    })),
  };
}
function set(
  world: RosterPolicyWorld,
  mode: RosterChangeMode,
  changes: Record<string, RosterPreference> = {},
): RosterPolicyWorld {
  return applyManagement(
    world,
    'policy-' + world.management.actions.length,
    action(world, mode, changes),
  ) as RosterPolicyWorld;
}
function restWorld(): RosterPolicyWorld {
  const definitions = createRosterPolicyDefinitions();
  definitions.schedule = [];
  definitions.endDate = '2026-10-10';
  return createRosterPolicyWorld(undefined, undefined, definitions);
}
function finishDate(world: WorldRecord): WorldRecord {
  while (worldPhase(world) === 'playing') world = advanceWorld(world, 25);
  return completeDay(world, world.currentDate);
}

test('方針初期値：全4球団60選手をdataから保存し、欠損・重複・他球団を拒否', () => {
  const world = createRosterPolicyWorld();
  assert.equal(Object.keys(world.rosterControl.policies).length, 4);
  assert.equal(world.rosterControl.preferences.length, 60);
  validateWorld(world);
  const original = structuredClone(world);
  try {
    initialPolicy.changeMode = 'auto';
    initialPolicy.preferences[0]!.preference = 'farmFixed';
    const edited = createRosterPolicyWorld();
    assert.ok(!registeredIds(edited, squadId).includes(batter));
    assert.deepEqual(world, original);
    validateWorld(edited);
  } finally {
    initialPolicy.changeMode = 'manual';
    initialPolicy.preferences[0]!.preference = 'auto';
  }
  for (const mutate of [
    (a: RosterPolicyAction) => {
      a.preferences.pop();
    },
    (a: RosterPolicyAction) => {
      a.preferences[0]!.playerId = a.preferences[1]!.playerId;
    },
    (a: RosterPolicyAction) => {
      a.preferences[0]!.playerId = 'player-h-01';
    },
    (a: RosterPolicyAction) => {
      (a as any).changeMode = 'unknown';
    },
    (a: RosterPolicyAction) => {
      (a.preferences[0] as any).preference = 'unknown';
    },
  ]) {
    const input = action(world, 'manual');
    mutate(input);
    assert.throws(() => applyManagement(world, 'bad', input));
    const definitions = createRosterPolicyDefinitions();
    definitions.squads[0]!.rosterPolicyInput = input;
    assert.throws(() => createRosterPolicyWorld(1, undefined, definitions));
  }
});

test('手動は希望だけを更新し、日次進行でも実登録・理想編成を変えない', () => {
  const start = restWorld();
  let world = set(start, 'manual', { [batter]: 'farmFixed' });
  assert.deepEqual(world.registration, start.registration);
  assert.deepEqual(world.management.idealLineups, start.management.idealLineups);
  assert.equal(rosterPolicyView(world).pending, 1);
  assert.equal(rosterPolicyView(world).preferences[0]!.updatedAt.order, 1);
  for (let day = 0; day < 3; day++)
    world = completeDay(world, world.currentDate) as RosterPolicyWorld;
  assert.deepEqual(world.registration, start.registration);
  validateWorld(world);
});

test('自動は固定希望のみ反映し、一軍固定のベンチ外休養・希望解除を認める', () => {
  const start = createRosterPolicyWorld();
  const world = set(start, 'auto', { [batter]: 'farmFixed', 'player-a-02': 'firstFixed' });
  assert.equal(rosterPolicyView(world).pending, 0);
  assert.equal(registeredIds(world, squadId).length, 14);
  assert.deepEqual(world.management.idealLineups, start.management.idealLineups);
  const preview = registrationPreview(world)!;
  const rested = applyManagement(world, 'rest-fixed', {
    kind: 'setGameBench',
    squadId,
    gameId: preview.gameId,
    playerIds: preview.roster.playerIds.filter((id) => id !== 'player-a-02'),
  }) as RosterPolicyWorld;
  assert.ok(registeredIds(rested, squadId).includes('player-a-02'));
  assert.ok(!registrationPreview(rested)!.roster.playerIds.includes('player-a-02'));
  assert.throws(
    () =>
      applyManagement(rested, 'manual-in-auto', {
        kind: 'setRegistrations',
        squadId,
        changes: [{ playerId: 'player-a-02', category: 'farm' }],
      }),
    /手動モード/,
  );
  const released = set(rested, 'auto', { [batter]: 'auto' });
  assert.ok(!registeredIds(released, squadId).includes(batter));
  assert.equal(rosterPolicyView(released).pending, 0);
  validateWorld(released);
  assert.deepEqual(
    start.registration.registrations.map((row) => row.category),
    Array(60).fill('first'),
  );
});

test('再登録待ちは一式保留し、10日目の休養日に反映、再実行と期間IDの重複なし', () => {
  let world = set(restWorld(), 'auto', { [batter]: 'farmFixed' });
  world = set(world, 'auto', { [batter]: 'firstFixed', 'player-a-02': 'farmFixed' });
  assert.equal(rosterPolicyView(world).pending, 2);
  assert.match(rosterPolicyView(world).reason!, /2026-10-04/);
  assert.ok(registeredIds(world, squadId).includes('player-a-02'));
  while (world.currentDate < '2026-10-04') {
    assert.ok(!registeredIds(world, squadId).includes(batter));
    world = completeDay(world, world.currentDate) as RosterPolicyWorld;
  }
  assert.ok(registeredIds(world, squadId).includes(batter));
  assert.ok(!registeredIds(world, squadId).includes('player-a-02'));
  assert.equal(rosterPolicyView(world).pending, 0);
  const rows = world.registration.registrations;
  assert.equal(rows.at(-1)!.from.order, 0);
  assert.equal(new Set(rows.map((row) => row.registrationId)).size, rows.length);
  const next = completeDay(world, world.currentDate) as RosterPolicyWorld;
  assert.deepEqual(next.registration, world.registration);
  validateWorld(next);
});

test('人数・外国人枠・成立人数を固定希望で迂回せず、同時入替なら成立する', () => {
  const definitions = createRosterPolicyDefinitions();
  definitions.registrationRules!.firstLimit = 15;
  definitions.registrationRules!.benchLimit = 15;
  const squad = definitions.squads[0]!;
  squad.registrationInputs!.find((row) => row.playerId === 'player-a-15')!.category = 'farm';
  squad.registrationInputs!.find((row) => row.playerId === 'player-a-15')!.foreignBaseStatus =
    'subject';
  definitions.registrationRules!.foreignFirstLimit = 0;
  definitions.registrationRules!.foreignBenchLimit = 0;
  let world = set(createRosterPolicyWorld(1, undefined, definitions), 'auto', {
    'player-a-15': 'firstFixed',
  });
  assert.match(rosterPolicyView(world).reason!, /外国人/);
  assert.equal(registeredIds(world, squadId).length, 14);
  const tooFew = set(
    createRosterPolicyWorld(),
    'auto',
    Object.fromEntries(
      ['01', '02', '03', '04'].map((suffix) => ['player-a-' + suffix, 'farmFixed']),
    ),
  );
  assert.match(rosterPolicyView(tooFew).reason!, /野手9人/);
  assert.equal(registeredIds(tooFew, squadId).length, 15);

  // 一軍枠10人で初期登録を成立させ、控えとの同時交換を検証する。
  const small = createRosterPolicyDefinitions();
  small.registrationRules!.firstLimit = 10;
  small.registrationRules!.benchLimit = 10;
  for (const team of small.squads)
    for (const entry of team.registrationInputs!) {
      if ([...team.reserveBatterIds!, ...team.team.pitcherIds.slice(1)].includes(entry.playerId))
        entry.category = 'farm';
    }
  world = set(createRosterPolicyWorld(1, undefined, small), 'auto', {
    'player-a-13': 'firstFixed',
  });
  assert.match(rosterPolicyView(world).reason!, /10人まで/);
  world = set(world, 'auto', { [batter]: 'farmFixed' });
  assert.equal(rosterPolicyView(world).pending, 0);
  assert.equal(registeredIds(world, squadId).length, 10);
  assert.ok(registeredIds(world, squadId).includes('player-a-13'));
  validateWorld(world);
});

test('当日指定と競合すると保留し、解除後の再試行で反映。開始後・他球団・旧版は拒否', () => {
  const start = createRosterPolicyWorld();
  let world = applyManagement(start, 'explicit', {
    kind: 'setGameLineup',
    squadId,
    gameId: start.dayPlan.gameIds[0]!,
    lineup: start.management.idealLineups[squadId]!,
  }) as RosterPolicyWorld;
  world = set(world, 'auto', { [batter]: 'farmFixed' });
  assert.match(rosterPolicyView(world).reason!, /当日オーダー/);
  assert.ok(registeredIds(world, squadId).includes(batter));
  world = applyManagement(world, 'clear', {
    kind: 'setGameLineup',
    squadId,
    gameId: world.dayPlan.gameIds[0]!,
    lineup: null,
  }) as RosterPolicyWorld;
  world = set(world, 'auto');
  assert.ok(!registeredIds(world, squadId).includes(batter));
  validateWorld(world);
  assert.throws(
    () => applyManagement(advanceWorld(world, 1), 'late', action(world, 'manual')),
    /始める前/,
  );
  assert.throws(
    () => applyManagement(world, 'other', { ...action(world, 'manual'), squadId: 'aonagi-first' }),
    /担当球団/,
  );
  assert.throws(
    () => applyManagement(createRegistrationWorld(), 'old', action(world, 'manual')),
    /新規プレイ/,
  );
});

test('CPU球団も保存した方針を使用し、担当球団の希望を流用しない', () => {
  const definitions = createRosterPolicyDefinitions();
  const other = definitions.squads[1]!;
  other.rosterPolicyInput!.changeMode = 'auto';
  other.rosterPolicyInput!.preferences[0]!.preference = 'farmFixed';
  const world = createRosterPolicyWorld(1, undefined, definitions);
  assert.equal(registeredIds(world, other.squadId).length, 14);
  assert.equal(registeredIds(world, squadId).length, 15);
  validateWorld(world);
});

test('方針の変更なしなら旧v5と全短期試合・成績・乱数が一致', () => {
  let old: WorldRecord = createRegistrationWorld();
  let world: WorldRecord = createRosterPolicyWorld();
  while (worldPhase(world) !== 'scheduleComplete') {
    old = finishDate(old);
    world = finishDate(world);
  }
  assert.deepEqual(world.games, old.games);
  assert.deepEqual(world.stats, old.stats);
  validateWorld(world);
});

test('保存・復帰・改ざん検出と変更前v5固定保存の互換性', async () => {
  const db = new WorldDatabase('roster-policy-save');
  const storage = new DexieWorldStorage(db);
  try {
    const world = advanceWorld(
      set(createRosterPolicyWorld(), 'auto', { [batter]: 'farmFixed' }),
      17,
    ) as RosterPolicyWorld;
    await storage.save(world, 1, 'manual', 0);
    const restored = (await storage.load('manual')).world;
    assert.deepEqual(restored, world);
    assert.deepEqual(finishDate(restored), finishDate(world));
    for (const mutate of [
      (bad: RosterPolicyWorld) => {
        bad.rosterControl.preferences[0]!.preference = 'auto';
      },
      (bad: RosterPolicyWorld) => {
        bad.rosterControl.preferences[0]!.updatedAt.order++;
      },
      (bad: RosterPolicyWorld) => {
        bad.rosterControl.policies['club-a']!.policyRevision++;
      },
      (bad: RosterPolicyWorld) => {
        bad.registration.registrations.at(-1)!.sourceId = 'altered';
      },
    ]) {
      const bad = structuredClone(world);
      mutate(bad);
      assert.throws(() => validateWorld(bad));
    }
    const bytes = readFileSync(new URL('./fixtures/world-v5-save.json.gz', import.meta.url));
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      '6e75fa5f7ea4f1a7015fdb667502368d95662178bfd7ac68c588fe872c73092b',
    );
    const old = JSON.parse(gunzipSync(bytes).toString()) as WorldRecord;
    validateWorld(old);
    await storage.save(old, 2, 'manual', 1);
    const loadedOld = (await storage.load('manual')).world;
    assert.equal(loadedOld.version, 'world-prototype-v5');
    assert.deepEqual(loadedOld, old);
    assert.deepEqual(finishDate(loadedOld), finishDate(old));
  } finally {
    await db.delete();
  }
});

test('保存失敗では方針・実登録とも未公開。同一指示の再送は一度だけ反映', async () => {
  const db = new WorldDatabase('roster-policy-retry');
  const storage = new DexieWorldStorage(db);
  let fail = true;
  const controller = new WorldController({
    listSlots: () => storage.listSlots(),
    load: (slot) => storage.load(slot),
    save: (...args) => {
      if (fail) throw Error('test failure');
      return storage.save(...args);
    },
  });
  try {
    const before = await controller.initialize();
    const command = {
      ...action(createFarmWorld(), 'auto', { [batter]: 'farmFixed' }),
      commandId: 'retry-policy',
      expectedStateRevision: before.revision,
      localWorldId: 'v02-local' as const,
    };
    await assert.rejects(controller.dispatch(command));
    assert.deepEqual(controller.query().rosterPolicy, before.rosterPolicy);
    assert.deepEqual(controller.query().registration, before.registration);
    fail = false;
    const after = await controller.dispatch(command);
    assert.equal(after.rosterPolicy!.policy.policyRevision, 2);
    assert.equal(
      after.registration!.registrations.find((row) => row.playerId === batter)!.category,
      'farm',
    );
    assert.deepEqual(await controller.dispatch(command), after);
    assert.equal(after.rosterPolicy!.preferences.length, before.rosterPolicy!.preferences.length);
    assert.deepEqual((await storage.load('auto')).world.version, 'world-prototype-v10');
  } finally {
    await db.delete();
  }
});
