import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { performanceConfig } from '../config/performance.ts';
import { createPerformanceDefinitions } from '../src/data/world/performance.ts';
import { createConditionDefinitions } from '../src/data/world/condition.ts';
import {
  createPerformanceWorld,
  createConditionWorld,
  createScheduledGame,
  advanceWorld,
  completeDay,
  worldPhase,
} from '../src/world/engine.ts';
import {
  performanceFactors,
  performanceFixture,
  performanceDetails,
} from '../src/game/performance.ts';
import { performanceView } from '../src/world/performance.ts';
import type { PerformanceWorld } from '../src/world/performance.ts';
import type { WorldRecord } from '../src/world/types.ts';
import { createGame, runToCompletion } from '../src/game/engine.ts';
import { finalizeGame } from '../src/game/results.ts';
import { WorldDatabase, DexieWorldStorage } from '../src/world/dexie-storage.ts';
import { WorldController } from '../src/world/controller.ts';
import { validateWorld, WorldValidator } from '../src/world/validation.ts';
import { validateCompletedRecord } from '../src/storage/codec.ts';

function finishGames<T extends WorldRecord>(world: T): T {
  let next: WorldRecord = world;
  while (worldPhase(next) === 'playing') next = advanceWorld(next, 25);
  assert.equal(worldPhase(next), 'readyToComplete');
  return next as T;
}
function finishDay(world: PerformanceWorld): PerformanceWorld {
  return completeDay(finishGames(world), world.currentDate) as PerformanceWorld;
}
const playerId = 'player-a-01';

test('試合前補正入力：項目別係数・範囲・欠損・旧版への混入を検査し設定を固定', () => {
  const defs = createPerformanceDefinitions();
  const world = createPerformanceWorld(1, undefined, defs);
  defs.performanceConfig!.groups.contact.conditionSwingPermille = 500;
  assert.equal(world.definitions.performanceConfig!.groups.contact.conditionSwingPermille, 100);
  assert.equal(defs.performanceConfig!.groups.power.conditionSwingPermille, 100);
  for (const mutate of [
    (d: typeof defs) => {
      d.performanceConfig!.minFactorPermille = -1;
    },
    (d: typeof defs) => {
      d.performanceConfig!.maxFactorPermille = 999;
    },
    (d: typeof defs) => {
      d.performanceConfig!.groups.control.fatiguePenaltyPermille = NaN;
    },
    (d: typeof defs) => {
      delete (d.performanceConfig!.groups as Partial<typeof performanceConfig.groups>).power;
    },
  ]) {
    const d = createPerformanceDefinitions();
    mutate(d);
    assert.throws(() => createPerformanceWorld(1, undefined, d));
  }
  const old = createConditionDefinitions();
  old.performanceConfig = performanceConfig;
  assert.throws(() => createConditionWorld(1, undefined, old), /旧定義/);
});

test('補正の境界：中立・好不調・体力と疲労の独立寄与、倍率と能力0/120の上限', () => {
  const factors = (c: number, e: number, f: number) =>
    performanceFactors(
      { conditionMilli: c, energyMilli: e, fatigueMilli: f },
      performanceConfig,
      'contact',
    );
  assert.deepEqual(factors(50000, 100000, 0), {
    conditionDelta: 0,
    energyPenalty: 0,
    fatiguePenalty: 0,
    factorPermille: 1000,
  });
  assert.equal(factors(100000, 100000, 0).factorPermille, 1100);
  assert.equal(factors(0, 0, 100000).factorPermille, 600);
  assert.equal(factors(90000, 42000, 68000).factorPermille, 891);
  const cfg = structuredClone(performanceConfig);
  cfg.minFactorPermille = 800;
  cfg.maxFactorPermille = 1050;
  assert.equal(
    performanceFactors({ conditionMilli: 0, energyMilli: 0, fatigueMilli: 100000 }, cfg, 'contact')
      .factorPermille,
    800,
  );
  assert.equal(
    performanceFactors(
      { conditionMilli: 100000, energyMilli: 100000, fatigueMilli: 0 },
      cfg,
      'contact',
    ).factorPermille,
    1050,
  );
  const defs = createPerformanceDefinitions();
  defs.squads[0]!.conditionInputs![0]!.conditionMilli = 100000;
  const player = defs.squads[0]!.players[0]!;
  player.batting.contactVsRight = { valueMilli: 100000, ceilingMilli: 100000 };
  player.batting.contactVsLeft = { valueMilli: 120000, ceilingMilli: 120000 };
  player.powerVsRight = { valueMilli: 0, ceilingMilli: 100000 };
  const world = createPerformanceWorld(1, undefined, defs);
  const game = createScheduledGame(world, world.dayPlan.gameIds[0]!);
  const rows = performanceDetails(game.fixture, game.performance!).find(
    (p) => p.playerId === playerId,
  )!.abilities;
  assert.equal(rows.find((a) => a.target === 'batting.contactVsRight')!.effectiveMilli, 110000);
  assert.equal(rows.find((a) => a.target === 'batting.contactVsRight')!.ceilingMilli, 100000);
  assert.equal(rows.find((a) => a.target === 'batting.contactVsLeft')!.effectiveMilli, 120000);
  assert.equal(rows.find((a) => a.target === 'powerVsRight')!.effectiveMilli, 0);
  assert.deepEqual(
    game.fixture.players.find((p) => p.playerId === playerId)!.batting.contactVsRight,
    player.batting.contactVsRight,
  );
});

test('適用範囲：左右別能力・持ち球を別々に補正し、球速・積極性・基本上限と乱数は不変', () => {
  const world = createPerformanceWorld();
  const game = createScheduledGame(world, world.dayPlan.gameIds[0]!);
  const base = structuredClone(game.fixture),
    rng = structuredClone(game.state.rng);
  const effective = performanceFixture(game);
  assert.deepEqual(game.fixture, base);
  assert.deepEqual(game.state.rng, rng);
  assert.strictEqual(performanceFixture(game), effective);
  assert.notEqual(
    effective.players[0]!.batting.contactVsRight.valueMilli,
    base.players[0]!.batting.contactVsRight.valueMilli,
  );
  for (let i = 0; i < base.pitches.length; i++) {
    assert.deepEqual(effective.pitches[i]!.velocity, base.pitches[i]!.velocity);
    assert.equal(
      effective.pitches[i]!.acquisitionProgressMilli,
      base.pitches[i]!.acquisitionProgressMilli,
    );
  }
  for (let i = 0; i < base.players.length; i++)
    assert.equal(effective.players[i]!.swingAggressionMilli, base.players[i]!.swingAggressionMilli);
  assert.throws(() => {
    effective.players[0]!.batting.contactVsRight.valueMilli = 1;
  }, TypeError);
  const shallow = structuredClone(game);
  Object.freeze(shallow.fixture);
  Object.freeze(shallow.performance!);
  performanceFixture(shallow);
  assert.throws(() => {
    shallow.performance!.players[playerId]!.energyMilli = 0;
  }, TypeError);
  assert.throws(() => {
    shallow.fixture.players[0]!.batting.contactVsRight.valueMilli = 0;
  }, TypeError);
  const altered = structuredClone(game);
  altered.performance!.players[playerId]!.energyMilli = 0;
  assert.notDeepEqual(performanceFixture(altered), effective);
  const bad = structuredClone(game);
  delete bad.performance!.players[playerId];
  assert.throws(() => performanceFixture(bad));
});

test('実効入力：共通試合エンジンと自責点再構成へ同じ値を渡し全記録が一致', () => {
  const defs = createPerformanceDefinitions();
  defs.errorConfig.baseProbability = 0.5;
  defs.errorConfig.maximumProbability = 0.8;
  for (const squad of defs.squads)
    for (const input of squad.physicalInputs!) {
      input.energyMilli = 50000;
      input.fatigueMilli = 50000;
    }
  const world = createPerformanceWorld(20260924, undefined, defs);
  const game = createScheduledGame(world, world.dayPlan.gameIds[0]!);
  const effective = structuredClone(performanceFixture(game));
  const reference = createGame(
    game.seed,
    effective,
    'game-prototype-v10',
    game.state.config,
    game.state.errorConfig,
  );
  reference.state.gameId = game.state.gameId;
  reference.state.rng.streamId = game.state.rng.streamId;
  runToCompletion(game);
  finalizeGame(game);
  runToCompletion(reference);
  finalizeGame(reference);
  assert(game.events.some((e) => e.outcome === 'reachedOnError'));
  assert.deepEqual(game.events, reference.events);
  assert.deepEqual(game.result, reference.result);
  assert.deepEqual(game.earnedRunEvaluation, reference.earnedRunEvaluation);
  assert.throws(() => validateCompletedRecord(game), /世界保存/);
});

test('中立設定：全係数0なら旧v10の全短期試合・乱数・成績・身体状態を維持', () => {
  const defs = createPerformanceDefinitions();
  for (const rule of Object.values(defs.performanceConfig!.groups))
    Object.assign(rule, {
      conditionSwingPermille: 0,
      energyPenaltyPermille: 0,
      fatiguePenaltyPermille: 0,
    });
  let world = createPerformanceWorld(42, undefined, defs),
    old = createConditionWorld(42);
  while (worldPhase(world) !== 'scheduleComplete') {
    world = finishDay(world);
    old = completeDay(finishGames(old), old.currentDate) as typeof old;
  }
  for (const [id, game] of Object.entries(world.games)) {
    const { performance, ...rest } = game;
    assert(performance);
    assert.deepEqual(rest, old.games[id]);
  }
  assert.deepEqual(world.stats, old.stats);
  assert.deepEqual(world.physical, old.physical);
  assert.deepEqual(world.condition, old.condition);
});

test('試合前固定：分割進行と検証キャッシュで一致し、当日負荷は翌日の補正へ反映', () => {
  const base = createPerformanceWorld();
  const preview = performanceView(base);
  let one: PerformanceWorld = base,
    many: PerformanceWorld = base;
  for (let i = 0; i < 50; i++) one = advanceWorld(one, 1) as PerformanceWorld;
  for (let i = 0; i < 2; i++) many = advanceWorld(many, 25) as PerformanceWorld;
  assert.deepEqual(one, many);
  const fixed = performanceView(one).today.find((t) => t.label === '一軍')!;
  assert.equal(fixed.fixed, true);
  assert.deepEqual(fixed.players, preview.today.find((t) => t.label === '一軍')!.players);
  const finished = finishGames(one);
  const oldSnapshot = structuredClone(finished.games[fixed.gameId]!.performance);
  const validator: WorldValidator = new WorldValidator();
  validator.validate(finished);
  validator.validate(finished);
  const next = completeDay(finished, finished.currentDate) as PerformanceWorld;
  assert.deepEqual(next.games[fixed.gameId]!.performance, oldSnapshot);
  assert.deepEqual(
    performanceView(next).previous.find((t) => t.label === '一軍')!.players,
    fixed.players,
  );
  assert.notDeepEqual(
    performanceView(next).today.find((t) => t.label === '一軍')!.players,
    fixed.players,
  );
  assert.deepEqual(base.definitions.squads, finished.definitions.squads);
});

test('保存再開：試合前値・係数・原能力・実効値を再現し、改変と旧版混入を拒否', async () => {
  const world = advanceWorld(finishDay(createPerformanceWorld()), 17) as PerformanceWorld;
  const db = new WorldDatabase('performance-save');
  const storage = new DexieWorldStorage(db);
  try {
    await storage.save(world, 1, 'manual', 0);
    const loaded = (await storage.load('manual')).world as PerformanceWorld;
    assert.deepEqual(loaded, world);
    assert.deepEqual(finishDay(loaded), finishDay(world));
    const id = world.dayPlan.gameIds[0]!;
    for (const mutate of [
      (w: PerformanceWorld) => {
        w.games[id]!.performance!.players[Object.keys(w.games[id]!.performance!.players)[0]!]!
          .conditionMilli++;
      },
      (w: PerformanceWorld) => {
        w.games[id]!.performance!.config.groups.contact.conditionSwingPermille++;
      },
      (w: PerformanceWorld) => {
        w.games[id]!.fixture.players[0]!.batting.contactVsRight.valueMilli++;
      },
      (w: PerformanceWorld) => {
        delete w.games[id]!.performance;
      },
      (w: PerformanceWorld) => {
        w.games[id]!.performance!.date = '2026-09-24';
      },
    ]) {
      const bad = structuredClone(world);
      mutate(bad);
      assert.throws(() => validateWorld(bad));
    }
  } finally {
    await db.delete();
  }
});

test('旧v10固定保存：変更前ハッシュ・旧モデルのままの保存と続行', async () => {
  const bytes = readFileSync(new URL('./fixtures/world-v10-save.json.gz', import.meta.url));
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    '660a11e6809d3443e582069d600ae29bf82c8aa004fdb2574bf98a8e30a36941',
  );
  const old = JSON.parse(gunzipSync(bytes).toString()) as WorldRecord;
  validateWorld(old);
  assert(Object.values(old.games).every((g) => g.performance === undefined));
  const db = new WorldDatabase('performance-old');
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

test('編成保存失敗：補正見込みを確定せず再試行・再送で一度だけ更新', async () => {
  const db = new WorldDatabase('performance-command');
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
      kind: 'setGameStarter' as const,
      squadId: 'hoshihara-first',
      gameId: before.registrationPreview!.gameId,
      playerId: 'player-a-11',
      commandId: 'starter',
      localWorldId: 'v02-local' as const,
      expectedStateRevision: before.revision,
    };
    await assert.rejects(controller.dispatch(command));
    assert.deepEqual(controller.query().performance, before.performance);
    fail = false;
    const after = await controller.dispatch(command);
    assert.deepEqual(await controller.dispatch(command), after);
    const loaded = (await storage.load('auto')).world as PerformanceWorld;
    assert.equal(loaded.management.actions.length, 1);
    assert.deepEqual(performanceView(loaded), after.performance);
  } finally {
    await db.delete();
  }
});

test(
  '年間補正：216試合・188日を完走し、全試合の固定入力と保存復元を照合',
  { timeout: 600000 },
  async () => {
    let world = createPerformanceWorld(20260924, undefined, createPerformanceDefinitions('annual'));
    while (worldPhase(world) !== 'scheduleComplete') world = finishDay(world);
    assert.equal(world.completedDates.length, 188);
    assert.equal(Object.keys(world.games).length, 216);
    assert(Object.values(world.games).every((g) => g.performance?.gameId === g.state.gameId));
    const db = new WorldDatabase('performance-annual');
    const storage = new DexieWorldStorage(db);
    try {
      await storage.save(world, 1, 'manual', 0);
      assert.deepEqual((await storage.load('manual')).world, world);
    } finally {
      await db.delete();
    }
  },
);
