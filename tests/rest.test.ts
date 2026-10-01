import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { restConfig } from '../config/rest.ts';
import { createRestDefinitions } from '../src/data/world/rest.ts';
import {
  createRestWorld,
  createPhysicalWorld,
  advanceWorld,
  completeDay,
  worldPhase,
  createScheduledGame,
} from '../src/world/engine.ts';
import { evaluateRest, recordPitchingAppearances } from '../src/world/rest.ts';
import { applyManagement } from '../src/world/management.ts';
import { registrationPreview } from '../src/world/registration.ts';
import { WorldController } from '../src/world/controller.ts';
import { WorldDatabase, DexieWorldStorage } from '../src/world/dexie-storage.ts';
import { validateWorld, WorldValidator } from '../src/world/validation.ts';
import type { WorldRecord } from '../src/world/types.ts';
import type { RestWorld } from '../src/world/rest.ts';
import type { RestRules } from '../src/world/rest-types.ts';

const squadId = 'hoshihara-first';
const p1 = 'player-a-10';
const p2 = 'player-a-11';
const p3 = 'player-a-12';
const emptyRules: RestRules = {
  action: 'preferRest',
  consecutiveDays: null,
  recentDays: 3,
  recentPitches: null,
  previousDayInnings: null,
  energyMilli: null,
  fatigueMilli: null,
};

function finishGames<T extends WorldRecord>(world: T): T {
  let next: WorldRecord = world;
  while (worldPhase(next) === 'playing') next = advanceWorld(next, 25);
  assert.equal(worldPhase(next), 'readyToComplete');
  return next as T;
}

function policy(
  world: RestWorld,
  rules: Partial<RestRules>,
  individual = world.restControl.pitcherUsagePlans[squadId]!.individualRest,
): RestWorld {
  return applyManagement(world, 'policy-' + world.management.actions.length, {
    kind: 'setRestPolicy',
    squadId,
    teamRestPolicy: { ...emptyRules, ...rules },
    individualRest: individual,
  }) as RestWorld;
}

test('休養入力：全8チーム、継承、範囲と参照IDを検査し、開始時設定を独立保持する', () => {
  const definitions = createRestDefinitions();
  const world = createRestWorld(1, undefined, definitions);
  assert.equal(Object.keys(world.restControl.teamPolicies).length, 8);
  assert.deepEqual(
    world.restControl.teamPolicies[squadId]!.teamRestPolicy,
    restConfig.defaultRules,
  );
  definitions.restPolicyInputs![0]!.teamRestPolicy.recentPitches = 1;
  assert.equal(definitions.restPolicyInputs![1]!.teamRestPolicy.recentPitches, 80);
  assert.equal(world.restControl.teamPolicies[squadId]!.teamRestPolicy.recentPitches, 80);
  for (const mutate of [
    (d: typeof definitions) => d.restPolicyInputs!.pop(),
    (d: typeof definitions) => {
      d.restPolicyInputs![0]!.squadId = 'unknown';
    },
    (d: typeof definitions) => {
      d.restPolicyInputs![0]!.individualRest[0]!.playerId = 'player-h-10';
    },
    (d: typeof definitions) => {
      d.restPolicyInputs![0]!.teamRestPolicy.recentDays = 0;
    },
    (d: typeof definitions) => {
      d.restPolicyInputs![0]!.teamRestPolicy.consecutiveDays = NaN;
    },
    (d: typeof definitions) => {
      d.restPolicyInputs![0]!.teamRestPolicy.previousDayInnings = 1;
    },
    (d: typeof definitions) => {
      d.restPolicyInputs![0]!.teamRestPolicy.fatigueMilli = 100001;
    },
  ]) {
    const d = createRestDefinitions();
    mutate(d);
    assert.throws(() => createRestWorld(1, undefined, d));
  }
  const old = createPhysicalWorld();
  old.definitions.restPolicyInputs = world.definitions.restPolicyInputs;
  assert.throws(() => validateWorld(old));
});

test('休養条件の境界：過去の暦日・一二軍登板・連投・球数・回跨ぎ・身体状態', () => {
  // 評価関数の固定入力。試合を欠いた世界として保存するものではない。
  const world = createRestWorld();
  world.currentDate = '2026-09-28';
  world.restControl.appearances = Object.fromEntries(
    [
      ['2026-09-24', 100, [1, 2, 3], 'hoshihara-farm'],
      ['2026-09-26', 10, [8], squadId],
      ['2026-09-27', 20, [8, 9], squadId],
      ['2026-09-28', 99, [1, 2, 3], squadId],
    ].map(([date, pitches, innings, team], i) => [
      String(i),
      {
        gameId: 'sample-' + i,
        playerId: p1,
        squadId: team as string,
        date: date as string,
        pitches: pitches as number,
        innings: innings as number[],
      },
    ]),
  );
  world.physical.players[p1]!.energyMilli = 35000;
  world.physical.players[p1]!.fatigueMilli = 40000;
  world.restControl.teamPolicies[squadId]!.teamRestPolicy = {
    ...emptyRules,
    consecutiveDays: 2,
    recentPitches: 30,
    previousDayInnings: 2,
    energyMilli: 35000,
    fatigueMilli: 40000,
  };
  const decision = evaluateRest(world, squadId, p1);
  assert.deepEqual(decision.reasons, [
    '連投日数',
    '直近投球数',
    '前日の回跨ぎ',
    '体力低下',
    '疲労蓄積',
  ]);
  assert.equal(decision.metrics.recentPitches, 30); // 今日と4日前は除外
  assert.equal(decision.metrics.lastPitchedOn, '2026-09-27');
  assert.equal(decision.metrics.restDays, 0);
  world.restControl.teamPolicies[squadId]!.teamRestPolicy = {
    ...emptyRules,
    consecutiveDays: 3,
    recentPitches: 31,
    previousDayInnings: 3,
    energyMilli: 34999,
    fatigueMilli: 40001,
  };
  assert.equal(evaluateRest(world, squadId, p1).requested, 'available');
  world.currentDate = '2026-09-30';
  assert.equal(evaluateRest(world, squadId, p1).metrics.consecutiveDays, 0);
  assert.equal(evaluateRest(world, squadId, p1).metrics.restDays, 1);
  const absent = evaluateRest(world, squadId, p3);
  assert.equal(absent.metrics.lastPitchedOn, null);
  assert.equal(absent.metrics.restDays, null);
});

test('休養優先とベンチ外を区別し、継承・個別解除と手動先発・ベンチ指定を反映', () => {
  let world = policy(createRestWorld(), {}, [
    { playerId: p2, mode: 'custom', rules: { ...emptyRules, fatigueMilli: 0 } },
  ]);
  let preview = registrationPreview(world)!;
  assert(preview.roster.playerIds.includes(p2));
  assert.deepEqual(createScheduledGame(world, preview.gameId).fixture.teams.away.pitcherIds, [
    p1,
    p3,
    p2,
  ]);
  assert.equal(
    preview.roster.restSnapshot!.decisions.find((d) => d.playerId === p2)!.outcome,
    'preferRest',
  );
  world = policy(world, {}, [
    {
      playerId: p2,
      mode: 'custom',
      rules: { ...emptyRules, action: 'benchRest', fatigueMilli: 0 },
    },
  ]);
  preview = registrationPreview(world)!;
  assert(!preview.roster.playerIds.includes(p2));
  assert(
    !createScheduledGame(world, preview.gameId).fixture.players.some((p) => p.playerId === p2),
  );
  const manualBench = applyManagement(world, 'bench', {
    kind: 'setGameBench',
    squadId,
    gameId: preview.gameId,
    playerIds: [...preview.roster.playerIds, p2],
  }) as RestWorld;
  assert.equal(
    registrationPreview(manualBench)!.roster.restSnapshot!.decisions.find((d) => d.playerId === p2)!
      .outcome,
    'preferRest',
  );
  assert.match(
    registrationPreview(manualBench)!.roster.restSnapshot!.decisions.find((d) => d.playerId === p2)!
      .exception!,
    /手動のベンチ/,
  );
  const manualStarter = applyManagement(world, 'starter', {
    kind: 'setGameStarter',
    squadId,
    gameId: preview.gameId,
    playerId: p2,
  }) as RestWorld;
  assert.equal(registrationPreview(manualStarter)!.starterId, p2);
  assert.match(
    registrationPreview(manualStarter)!.roster.restSnapshot!.decisions.find(
      (d) => d.playerId === p2,
    )!.exception!,
    /手動先発/,
  );
  world = policy(world, { fatigueMilli: 0 }, [
    { playerId: p1, mode: 'custom', rules: { ...emptyRules, action: 'none' } },
  ]);
  assert.equal(registrationPreview(world)!.starterId, p1);
  assert.equal(evaluateRest(world, squadId, p2).mode, 'inherit');
  assert.equal(evaluateRest(world, squadId, p2).requested, 'preferRest');
  assert.throws(() =>
    applyManagement(world, 'other', {
      kind: 'setRestPolicy',
      squadId: 'aonagi-first',
      teamRestPolicy: emptyRules,
      individualRest: [],
    }),
  );
});

test('全員休養でも先発1人を確保して理由を記録し、登録外・手動ベンチ外は起用しない', () => {
  let world = policy(createRestWorld(), { action: 'benchRest', fatigueMilli: 0 });
  const preview = registrationPreview(world)!;
  const pitchers = createScheduledGame(world, preview.gameId).fixture.teams.away.pitcherIds;
  assert.deepEqual(pitchers, [p1]);
  assert.match(
    preview.roster.restSnapshot!.decisions.find((d) => d.playerId === p1)!.exception!,
    /先発を確保/,
  );
  assert(!pitchers.includes('player-a-25')); // 二軍登録は緊急でも起用しない
  world = applyManagement(world, 'manual-bench', {
    kind: 'setGameBench',
    squadId,
    gameId: preview.gameId,
    playerIds: [...preview.roster.playerIds.filter((id) => id !== p1), p3],
  }) as RestWorld;
  assert.equal(registrationPreview(world)!.starterId, p3);
  const complete = finishGames(world);
  validateWorld(complete);
  assert.deepEqual(complete.games[preview.gameId]!.fixture.teams.away.pitcherIds, [p3]);
});

test('AC-08：初球前の判定・ベンチを固定し、当日負荷は翌日の起用へ反映する', () => {
  const base = policy(createRestWorld(), { action: 'benchRest', fatigueMilli: 1 });
  const preview = registrationPreview(base)!;
  const snapshot = structuredClone(preview.roster.restSnapshot);
  let world = base;
  while (world.physical.players[p1]!.fatigueMilli <= 1) world = advanceWorld(world, 1) as RestWorld;
  assert.deepEqual(registrationPreview(world)!.roster.restSnapshot, snapshot);
  assert.deepEqual(registrationPreview(world)!.roster.playerIds, preview.roster.playerIds);
  assert.throws(() => policy(world, { action: 'none' }));
  world = finishGames(world);
  assert.deepEqual(registrationPreview(world)!.roster.restSnapshot, snapshot);
  const next = completeDay(world, world.currentDate) as RestWorld;
  assert.notEqual(registrationPreview(next)!.starterId, p1);
  assert.deepEqual(next.registration.gameRosters[preview.gameId]!.away.restSnapshot, snapshot);
  const noPitch = evaluateRest(base, squadId, p3);
  assert.equal(noPitch.metrics.lastPitchedOn, null);
  const p1Decision = evaluateRest(next, squadId, p1);
  assert.equal(p1Decision.metrics.lastPitchedOn, '2026-09-24');
  assert.equal(p1Decision.requested, 'benchRest');
  validateWorld(next);
});

test('登板実績は実投球と一致し、分割・再適用・検証キャッシュで重複しない', () => {
  const base = createRestWorld();
  let one: RestWorld = base;
  let many: RestWorld = base;
  for (let i = 0; i < 50; i++) one = advanceWorld(one, 1) as RestWorld;
  for (let i = 0; i < 2; i++) many = advanceWorld(many, 25) as RestWorld;
  assert.deepEqual(one, many);
  const world = finishGames(many);
  for (const game of Object.values(world.games)) {
    for (const pitcher of game.result!.pitching) {
      const row =
        world.restControl.appearances[JSON.stringify([game.state.gameId, pitcher.playerId])]!;
      if (pitcher.pitches === 0) {
        assert.equal(row, undefined);
        continue;
      }
      assert.equal(row.pitches, pitcher.pitches);
      assert.deepEqual(row.innings, [
        ...new Set(
          game.events
            .filter((e) => e.pitch?.pitcherId === pitcher.playerId)
            .map((e) => e.before.inning),
        ),
      ]);
    }
    assert.deepEqual(recordPitchingAppearances(world, game.state.gameId, game), world.restControl);
  }
  const validator: WorldValidator = new WorldValidator();
  validator.validate(world);
  validator.validate(world);
});

test('休養なしの試作は旧v8の試合・乱数・身体状態を維持する', () => {
  const definitions = createRestDefinitions();
  for (const input of definitions.restPolicyInputs!) input.teamRestPolicy.action = 'none';
  let world: WorldRecord = createRestWorld(20260924, undefined, definitions);
  let old: WorldRecord = createPhysicalWorld();
  while (worldPhase(world) !== 'scheduleComplete') {
    world = completeDay(finishGames(world), world.currentDate);
    old = completeDay(finishGames(old), old.currentDate);
  }
  assert.deepEqual(world.games, old.games);
  assert.deepEqual(world.stats, old.stats);
  assert.deepEqual((world as RestWorld).physical, (old as RestWorld).physical);
});

test('登板後の昇降格：日付・球数を同じ選手IDで引き継ぎ二軍の休養判定へ使う', () => {
  let world: RestWorld = finishGames(createRestWorld());
  world = completeDay(world, world.currentDate) as RestWorld;
  const appearances = structuredClone(world.restControl.appearances);
  world = applyManagement(world, 'demote', {
    kind: 'setRegistrations',
    squadId,
    changes: [{ playerId: p1, category: 'farm' }],
  }) as RestWorld;
  assert.deepEqual(world.restControl.appearances, appearances);
  const decision = evaluateRest(world, 'hoshihara-farm', p1);
  assert.equal(decision.metrics.lastPitchedOn, '2026-09-24');
  assert(decision.metrics.recentPitches > 0);
  assert(!registrationPreview(world)!.roster.playerIds.includes(p1));
  validateWorld(world);
});

test('新旧保存：設定と判定履歴を再現し、改変を拒否する', async () => {
  let world = policy(createRestWorld(), { action: 'benchRest', recentPitches: 1 });
  world = completeDay(finishGames(world), world.currentDate) as RestWorld;
  world = advanceWorld(world, 17) as RestWorld;
  const db = new WorldDatabase('rest-save');
  const storage = new DexieWorldStorage(db);
  try {
    await storage.save(world, 1, 'manual', 0);
    const restored = (await storage.load('manual')).world;
    assert.deepEqual(restored, world);
    assert.deepEqual(finishGames(restored), finishGames(world));
    for (const mutate of [
      (w: RestWorld) => {
        Object.values(w.restControl.appearances)[0]!.pitches++;
      },
      (w: RestWorld) => {
        Object.values(w.registration.gameRosters)[0]!.away.restSnapshot!.decisions[0]!.metrics
          .fatigueMilli++;
      },
      (w: RestWorld) => {
        w.restControl.teamPolicies[squadId]!.teamRestPolicy.action = 'none';
      },
    ]) {
      const bad = structuredClone(world);
      mutate(bad);
      assert.throws(() => validateWorld(bad));
    }
    const bytes = readFileSync(new URL('./fixtures/world-v8-save.json.gz', import.meta.url));
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      'dcba625568874981ef41ff09fb87def8858295791ce2bc51bc5c66b36854d1d4',
    );
    const old = JSON.parse(gunzipSync(bytes).toString()) as WorldRecord;
    validateWorld(old);
    await storage.save(old, 2, 'manual', 1);
    const loaded = (await storage.load('manual')).world;
    assert.deepEqual(loaded, old);
    assert(!('restControl' in loaded));
    assert.deepEqual(finishGames(loaded), finishGames(old));
  } finally {
    await db.delete();
  }
});

test('方針保存失敗と再送：方針・起用・履歴を一緒に確定し二重適用しない', async () => {
  const db = new WorldDatabase('rest-retry');
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
      kind: 'setRestPolicy' as const,
      squadId,
      teamRestPolicy: { ...emptyRules, action: 'benchRest' as const, fatigueMilli: 0 },
      individualRest: [],
      commandId: 'rest',
      localWorldId: 'v02-local' as const,
      expectedStateRevision: before.revision,
    };
    await assert.rejects(controller.dispatch(command));
    assert.deepEqual(controller.query().restPolicy, before.restPolicy);
    assert.deepEqual(controller.query().registrationPreview, before.registrationPreview);
    fail = false;
    const after = await controller.dispatch(command);
    assert.deepEqual(await controller.dispatch(command), after);
    assert.equal(after.restPolicy!.policyRevision, 2);
    const loaded = (await storage.load('auto')).world as RestWorld;
    assert.equal(loaded.management.actions.length, 1);
    assert.deepEqual(registrationPreview(loaded), after.registrationPreview);
  } finally {
    await db.delete();
  }
});

test(
  '年間：休養方針を使う一軍・二軍216試合と188日を完走し保存復元',
  { timeout: 600000 },
  async () => {
    let world: RestWorld = createRestWorld(20260924, undefined, createRestDefinitions('annual'));
    while (worldPhase(world) !== 'scheduleComplete')
      world = completeDay(finishGames(world), world.currentDate) as RestWorld;
    assert.equal(Object.keys(world.games).length, 216);
    assert.equal(world.completedDates.length, 188);
    assert.equal(world.seasonSummary!.games, 144);
    assert.equal(world.farmSummary!.games, 72);
    assert(
      Object.values(world.registration.gameRosters).some((rosters) =>
        Object.values(rosters).some((roster) =>
          roster.restSnapshot!.decisions.some((d) => d.requested !== 'available'),
        ),
      ),
    );
    const db = new WorldDatabase('rest-annual');
    const storage = new DexieWorldStorage(db);
    try {
      await storage.save(world, 1, 'manual', 0);
      assert.deepEqual((await storage.load('manual')).world, world);
    } finally {
      await db.delete();
    }
  },
);
