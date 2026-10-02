import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createFielderRestDefinitions } from '../src/data/world/fielder-rest.ts';
import { createPerformanceDefinitions } from '../src/data/world/performance.ts';
import {
  createFielderRestWorld,
  createPerformanceWorld,
  advanceWorld,
  completeDay,
  worldPhase,
  createScheduledGame,
} from '../src/world/engine.ts';
import { resolveRegisteredRoster, registrationPreview } from '../src/world/registration.ts';
import { applyManagement } from '../src/world/management.ts';
import { WorldController } from '../src/world/controller.ts';
import { WorldDatabase, DexieWorldStorage } from '../src/world/dexie-storage.ts';
import { validateWorld, WorldValidator } from '../src/world/validation.ts';
import type { FielderRestWorld } from '../src/world/fielder-rest.ts';
import type { WorldRecord } from '../src/world/types.ts';

const squadId = 'hoshihara-first';
const p1 = 'player-a-01';
const p2 = 'player-a-02';
const reserve = 'player-a-13';

function tired(calendar: 'short' | 'annual' = 'short') {
  const defs = createFielderRestDefinitions(calendar);
  const inputs = defs.squads[0]!.physicalInputs!;
  inputs.find((p) => p.playerId === p1)!.energyMilli = 35000;
  inputs.find((p) => p.playerId === p2)!.fatigueMilli = 40000;
  return createFielderRestWorld(20260924, undefined, defs);
}
function preview(world: FielderRestWorld) {
  return registrationPreview(world)!;
}
function finishGames<T extends WorldRecord>(world: T, count = 25): T {
  let next: WorldRecord = world;
  while (worldPhase(next) === 'playing') next = advanceWorld(next, count);
  assert.equal(worldPhase(next), 'readyToComplete');
  return next as T;
}
function finishDay<T extends WorldRecord>(world: T): T {
  return completeDay(finishGames(world), world.currentDate) as T;
}

test('野手休養の入力：8チームの独立設定、範囲、重複、旧版混入を拒否', () => {
  const defs = createFielderRestDefinitions();
  const world = createFielderRestWorld(1, undefined, defs);
  defs.fielderRestInputs![0]!.rules.energyMilli = 100000;
  assert.equal(world.fielderRest.teamPolicies[squadId]!.rules.energyMilli, 35000);
  assert.equal(defs.fielderRestInputs![1]!.rules.energyMilli, 35000);
  for (const change of [
    (d: typeof defs) => {
      d.fielderRestInputs!.pop();
    },
    (d: typeof defs) => {
      d.fielderRestInputs![1]!.squadId = squadId;
    },
    (d: typeof defs) => {
      d.fielderRestInputs![0]!.rules.energyMilli = -1;
    },
    (d: typeof defs) => {
      d.fielderRestInputs![0]!.rules.fatigueMilli = NaN;
    },
    (d: typeof defs) => {
      d.fielderRestModelVersion = 'unknown' as 'fielder-rest-v1';
    },
  ]) {
    const d = createFielderRestDefinitions();
    change(d);
    assert.throws(() => createFielderRestWorld(1, undefined, d));
  }
  const old = createPerformanceDefinitions();
  old.fielderRestInputs = defs.fielderRestInputs;
  assert.throws(() => createPerformanceWorld(1, undefined, old), /旧定義/);
});

test('野手休養の境界：体力以下・疲労以上のOR、無効と空欄、基本能力は不変', () => {
  const world = tired();
  const original = structuredClone(world);
  const rows = preview(world).roster.fielderRestSnapshot!.decisions;
  assert.equal(rows.find((r) => r.playerId === p1)!.requested, true);
  assert.equal(rows.find((r) => r.playerId === p2)!.requested, true);
  world.physical.players[p1]!.energyMilli++;
  world.physical.players[p2]!.fatigueMilli--;
  assert(preview(world).roster.fielderRestSnapshot!.decisions.every((r) => !r.requested));
  for (const rules of [
    { enabled: false, energyMilli: 100000, fatigueMilli: 0 },
    { enabled: true, energyMilli: null, fatigueMilli: null },
  ]) {
    const next = applyManagement(original, 'disable', {
      kind: 'setFielderRestPolicy',
      squadId,
      rules,
    }) as FielderRestWorld;
    assert(preview(next).roster.fielderRestSnapshot!.decisions.every((r) => !r.requested));
  }
  assert.deepEqual(world.definitions, original.definitions);
  assert.deepEqual(world.management, original.management);
});

test('代替起用：打順・守備を引継ぎ、他の理想枠と登録・ベンチは保持する', () => {
  const world = tired();
  const desired = structuredClone(world.management.idealLineups[squadId]!);
  const gameId = preview(world).gameId;
  const resolved = resolveRegisteredRoster(world, squadId, gameId);
  assert.equal(resolved.lineup.battingOrder[0]!.playerId, reserve);
  assert.equal(resolved.lineup.battingOrder[1]!.playerId, 'player-a-14');
  assert.deepEqual(resolved.lineup.battingOrder.slice(2), desired.battingOrder.slice(2));
  const position = desired.defense.find((s) => s.playerId === p1)!.positionCode;
  assert.equal(resolved.lineup.defense.find((s) => s.positionCode === position)!.playerId, reserve);
  assert.equal(new Set(resolved.lineup.battingOrder.map((s) => s.playerId)).size, 9);
  assert(resolved.roster.playerIds.includes(p1));
  assert.deepEqual(world.management.idealLineups[squadId], desired);
  const game = createScheduledGame(world, gameId);
  assert.equal(game.fixture.teams.away.lineup[0]!.playerId, reserve);
  assert(game.performance!.players[reserve]);
  assert(!game.performance!.players[p1]);
});

test('起用優先：手動当日指定・ベンチ外・代役不足・全員休養でも合法な9人を維持', () => {
  let world: FielderRestWorld = tired();
  const gameId = preview(world).gameId;
  const lineup = structuredClone(world.management.idealLineups[squadId]!);
  world = applyManagement(world, 'manual', {
    kind: 'setGameLineup',
    squadId,
    gameId,
    lineup,
  }) as FielderRestWorld;
  assert.equal(preview(world).lineup[0]!.playerId, p1);
  assert.match(preview(world).roster.fielderRestSnapshot!.decisions[0]!.exception!, /手動/);
  world = applyManagement(world, 'clear', {
    kind: 'setGameLineup',
    squadId,
    gameId,
    lineup: null,
  }) as FielderRestWorld;
  assert.equal(preview(world).lineup[0]!.playerId, reserve);
  const ids = [...lineup.battingOrder.map((s) => s.playerId), 'player-a-10'];
  world = applyManagement(world, 'bench', {
    kind: 'setGameBench',
    squadId,
    gameId,
    playerIds: ids,
  }) as FielderRestWorld;
  assert.equal(preview(world).lineup[0]!.playerId, p1);
  assert.match(preview(world).roster.fielderRestSnapshot!.decisions[0]!.exception!, /不足/);
  assert.equal(
    preview(world).roster.fielderRestSnapshot!.decisions.find((d) => d.playerId === reserve)!
      .outcome,
    'outsideBench',
  );
  world = applyManagement(world, 'all', {
    kind: 'setFielderRestPolicy',
    squadId,
    rules: { enabled: true, energyMilli: 100000, fatigueMilli: null },
  }) as FielderRestWorld;
  assert.equal(preview(world).lineup.length, 9);
  assert(
    preview(world)
      .roster.fielderRestSnapshot!.decisions.filter((d) => d.outcome === 'starting')
      .every((d) => d.exception),
  );
  assert.throws(
    () =>
      applyManagement(world, 'other', {
        kind: 'setFielderRestPolicy',
        squadId: 'aonagi-first',
        rules: { enabled: false, energyMilli: null, fatigueMilli: null },
      }),
    /担当/,
  );
});

test('一二軍・CPU共通：固定登録も休養でき、登録外は代役候補にしない', () => {
  const defs = createFielderRestDefinitions();
  for (const squad of defs.squads) {
    for (const input of squad.physicalInputs!) input.energyMilli = 100000;
    const firstId = squad.team.lineup[0]!.playerId;
    squad.rosterPolicyInput!.preferences.find((p) => p.playerId === firstId)!.preference =
      'firstFixed';
    squad.physicalInputs!.find((p) => p.playerId === firstId)!.energyMilli = 10000;
    const farm = defs.farm!.squads.find((s) => s.team.clubId === squad.team.clubId)!;
    const farmId = farm.team.lineup[0]!.playerId;
    squad.physicalInputs!.find((p) => p.playerId === farmId)!.energyMilli = 10000;
  }
  const world = createFielderRestWorld(1, undefined, defs);
  for (const squad of [...world.definitions.squads, ...world.definitions.farm!.squads]) {
    const game = world.definitions.schedule.find(
      (g) => g.date === world.currentDate && [g.awaySquadId, g.homeSquadId].includes(squad.squadId),
    )!;
    const result = resolveRegisteredRoster(world, squad.squadId, game.gameId);
    assert.notEqual(result.lineup.battingOrder[0]!.playerId, squad.team.lineup[0]!.playerId);
    assert.equal(result.roster.fielderRestSnapshot!.decisions[0]!.outcome, 'resting');
    assert(result.roster.playerIds.includes(squad.team.lineup[0]!.playerId));
  }
});

test('開始時固定：分割数・翌日回復・検証キャッシュでも判定と試合を再現', () => {
  const world = tired();
  const before = preview(world);
  const partial = advanceWorld(world, 25) as FielderRestWorld;
  assert.deepEqual(preview(partial).roster.fielderRestSnapshot, before.roster.fielderRestSnapshot);
  assert.deepEqual(preview(partial).lineup, before.lineup);
  assert.throws(
    () =>
      applyManagement(partial, 'late', {
        kind: 'setFielderRestPolicy',
        squadId,
        rules: { enabled: false, energyMilli: null, fatigueMilli: null },
      }),
    /始める前/,
  );
  const a = finishGames(world, 1),
    b = finishGames(world, 25);
  assert.deepEqual(a, b);
  const participants = a.registration.gameRosters[before.gameId]!.away.participants;
  assert.equal(participants.find((p) => p.playerId === p1)!.appeared, false);
  assert.equal(participants.find((p) => p.playerId === reserve)!.appeared, true);
  assert(
    Object.values(a.physical.activityLoads)
      .filter((r) => r.playerId === p1)
      .every((r) => r.sourceLoads.every((load) => load.actualCounts === 0)),
  );
  assert(
    Object.values(a.physical.activityLoads).some(
      (r) =>
        r.playerId === reserve &&
        r.sourceLoads.some((load) => load.kind === 'batting' && load.actualCounts > 0),
    ),
  );
  assert(a.condition.samples[before.gameId]!.some((r) => r.playerId === p1));

  const validator: WorldValidator = new WorldValidator();
  validator.validate(a);
  validator.validate(a);
  const tomorrow = completeDay(a, a.currentDate) as FielderRestWorld;
  assert.equal(preview(tomorrow).lineup[0]!.playerId, p1);
  assert.equal(
    tomorrow.registration.gameRosters[before.gameId]!.away.fielderRestSnapshot!.decisions[0]!
      .outcome,
    'resting',
  );
});

test('無効設定：旧v11と短期全試合・成績・身体状態・調子が一致', () => {
  const defs = createFielderRestDefinitions();
  for (const row of defs.fielderRestInputs!) row.rules.enabled = false;
  let world = createFielderRestWorld(9, undefined, defs);
  let old = createPerformanceWorld(9);
  while (worldPhase(world) !== 'scheduleComplete') {
    world = finishDay(world);
    old = finishDay(old);
  }
  assert.deepEqual(world.games, old.games);
  assert.deepEqual(world.stats, old.stats);
  assert.deepEqual(world.physical, old.physical);
  assert.deepEqual(world.condition, old.condition);
});

test('野手休養の保存：途中再開・設定固定・開始時判定と指示の改変を拒否', async () => {
  const world = advanceWorld(tired(), 17) as FielderRestWorld;
  const db = new WorldDatabase('fielder-save');
  const storage = new DexieWorldStorage(db);
  try {
    await storage.save(world, 1, 'manual', 0);
    const loaded = (await storage.load('manual')).world as FielderRestWorld;
    assert.deepEqual(loaded, world);
    assert.deepEqual(finishGames(loaded), finishGames(world));
    for (const mutate of [
      (w: FielderRestWorld) => {
        w.fielderRest.teamPolicies[squadId]!.rules.enabled = false;
      },
      (w: FielderRestWorld) => {
        w.registration.gameRosters[
          preview(w).gameId
        ]!.away.fielderRestSnapshot!.decisions[0]!.replacementId = null;
      },
      (w: FielderRestWorld) => {
        delete w.registration.gameRosters[preview(w).gameId]!.away.fielderRestSnapshot;
      },
    ]) {
      const corrupt = structuredClone(world);
      mutate(corrupt);
      assert.throws(() => validateWorld(corrupt));
    }
  } finally {
    await db.delete();
  }
});

test('旧v11固定保存：変更前ハッシュと旧版の保存・続行を維持', async () => {
  const bytes = readFileSync(new URL('./fixtures/world-v11-save.json.gz', import.meta.url));
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    '08858107d90fbd6f6f5e3e36e93e3c7dda1cb49db5bb096042301e5667cc0a1c',
  );
  const old = JSON.parse(gunzipSync(bytes).toString()) as WorldRecord;
  validateWorld(old);
  assert(!('fielderRest' in old));
  const db = new WorldDatabase('fielder-old');
  const storage = new DexieWorldStorage(db);
  try {
    await storage.save(old, 1, 'manual', 0);
    const loaded = (await storage.load('manual')).world;
    assert.deepEqual(loaded, old);
    assert.deepEqual(advanceWorld(loaded, 25), advanceWorld(old, 25));
  } finally {
    await db.delete();
  }
});

test('方針保存失敗：表示と正本を保ち、再試行・再送で一度だけ反映', async () => {
  const db = new WorldDatabase('fielder-controller');
  const storage = new DexieWorldStorage(db);
  let fail = true;
  const controller = new WorldController({
    listSlots: () => storage.listSlots(),
    load: (s) => storage.load(s),
    save: (...args) => {
      if (fail) throw Error('test quota');
      return storage.save(...args);
    },
  });
  try {
    const before = await controller.initialize();
    const command = {
      kind: 'setFielderRestPolicy' as const,
      squadId,
      rules: { enabled: true, energyMilli: 100000, fatigueMilli: null },
      commandId: 'policy',
      localWorldId: 'v02-local' as const,
      expectedStateRevision: before.revision,
    };
    await assert.rejects(controller.dispatch(command));
    assert.deepEqual(controller.query().fielderRestPolicy, before.fielderRestPolicy);
    assert.deepEqual(controller.query().registrationPreview, before.registrationPreview);
    fail = false;
    const after = await controller.dispatch(command);
    assert.deepEqual(await controller.dispatch(command), after);
    assert.equal(after.fielderRestPolicy!.policyRevision, 2);
    const loaded = (await storage.load('auto')).world as FielderRestWorld;
    assert.equal(loaded.management.actions.length, 1);
    assert.deepEqual(preview(loaded), after.registrationPreview);
  } finally {
    await db.delete();
  }
});

test(
  '年間野手休養：216試合・188日・代替記録と終了保存の完全復元',
  { timeout: 600000 },
  async () => {
    let world = tired('annual');
    while (worldPhase(world) !== 'scheduleComplete') world = finishDay(world);
    assert.equal(world.completedDates.length, 188);
    assert.equal(Object.keys(world.games).length, 216);
    const rows = Object.values(world.registration.gameRosters).flatMap((g) =>
      Object.values(g).flatMap((r) => r.fielderRestSnapshot!.decisions),
    );
    assert(rows.some((r) => r.outcome === 'resting'));
    assert(
      Object.values(world.games).every(
        (g) => g.fixture.teams.away.lineup.length === 9 && g.fixture.teams.home.lineup.length === 9,
      ),
    );
    const db = new WorldDatabase('fielder-annual');
    const storage = new DexieWorldStorage(db);
    try {
      await storage.save(world, 1, 'manual', 0);
      assert.deepEqual((await storage.load('manual')).world, world);
    } finally {
      await db.delete();
    }
  },
);
