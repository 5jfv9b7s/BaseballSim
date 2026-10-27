import { setImmediate } from 'node:timers/promises';
import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDailyTrainingDefinitions } from '../src/data/world/daily-training.ts';
import {
  createDailyTrainingWorld,
  createTrainingPlanWorld,
  advanceWorld,
  completeDay,
  worldPhase,
  validateDefinitions,
  createScheduledGame,
} from '../src/world/engine.ts';
import {
  applyTrainingDay,
  trainingOpportunity,
  trainingBudget,
  chooseTrainingIntensity,
} from '../src/world/growth.ts';
import {
  growthBasis,
  growthAbilityKey,
  currentCommonAbilities,
} from '../src/world/growth-basis.ts';
import { growthView, growthComparison } from '../src/world/growth-view.ts';
import { commonTrainingRef } from '../src/world/training.ts';
import { validateWorld } from '../src/world/validation.ts';
import { DexieWorldStorage, WorldDatabase } from '../src/world/dexie-storage.ts';
import { WorldController } from '../src/world/controller.ts';
import { exportStoredPlay } from '../src/world/backup-storage.ts';
import { decodeBackup } from '../src/world/backup-package.ts';
import { canonicalJson, sha256 } from '../src/storage/codec.ts';
import type { WorldRecord } from '../src/world/types.ts';
import type { TrainingSettings } from '../src/world/training-types.ts';
import { GROWTH_CONFIG } from '../config/growth.ts';

type Current = ReturnType<typeof createDailyTrainingWorld>;
function ready<T extends WorldRecord>(world: T): T {
  while (worldPhase(world) === 'playing') world = advanceWorld(world, 25) as T;
  return world;
}
function finish<T extends WorldRecord>(world: T): T {
  world = ready(world);
  return completeDay(world, world.currentDate) as T;
}
const deterministic = createDailyTrainingDefinitions();
deterministic.growthConfig!.opportunity = { baseMilli: 100000, ambitionMilli: 0 };
const boundary = ready(createDailyTrainingWorld(31, undefined, deterministic));
const first = boundary.definitions.squads[0]!.players[0]!.playerId;
const settings: TrainingSettings = {
  target: { kind: 'ability', abilityRef: commonTrainingRef('batting.contactVsRight') },
  intensity: 'normal',
  autoAdjustForFatigue: false,
};
function directed(target: TrainingSettings['target'] = settings.target): Current {
  const world = structuredClone(boundary);
  assert.equal(world.management.version, 'club-management-v2');
  if (world.management.version !== 'club-management-v2') throw new Error('設定不足');
  for (const plan of Object.values(world.management.training.plans))
    Object.assign(plan, { ...settings, target });
  return world;
}

test('通常練習：新規v16/v21の全120人・独立乱数と成長対象を保持し、旧v20へ追加しない', () => {
  const world = createDailyTrainingWorld(7);
  assert.equal(world.version, 'world-prototype-v16');
  assert.equal(world.definitions.version, 'world-definitions-v21');
  assert.equal(world.growth.version, 'daily-training-v1');
  assert.equal(Object.keys(world.growth.state.players).length, 120);
  for (const squad of world.definitions.squads)
    for (const p of squad.players) {
      const basis = growthBasis(world.definitions, p.playerId);
      const pitches = squad.pitches.filter((v) => v.playerId === p.playerId).length;
      assert.equal(basis.length, 31 + 2 * pitches);
      assert.equal(new Set(basis.map((v) => v.key)).size, basis.length);
      assert.equal(world.growth.state.players[p.playerId]!.rng.drawCount, 0);
    }
  assert.notDeepEqual(
    world.growth.state.players[first]!.rng,
    createDailyTrainingWorld(8).growth.state.players[first]!.rng,
  );
  assert.equal('growth' in createTrainingPlanWorld(), false);
  validateWorld(world);
  for (const mutate of [
    (d: any) => delete d.growthConfig,
    (d: any) => (d.growthConfig.opportunity.baseMilli = 0),
    (d: any) => (d.growthConfig.budget.baseMilli = 1.5),
    (d: any) => (d.growthConfig.intensities.rest.energyCostMilli = 1),
    (d: any) => (d.growthConfig.extra = 1),
    (d: any) => (d.growthConfig.fatigueAdjustment.lightEnergyAtOrBelowMilli = 1),
    (d: any) => (d.growthConfig.enabled = 'true'),
  ]) {
    const d = structuredClone(world.definitions);
    mutate(d);
    assert.throws(() => validateDefinitions(d));
  }
  const old = createTrainingPlanWorld();
  old.definitions.growthConfig = GROWTH_CONFIG;
  assert.throws(() => validateDefinitions(old.definitions));
});

test('機会と量：向上心0/才能0にも有限の基礎効果、才能は量・向上心は機会、強度で調整', () => {
  assert.equal(trainingOpportunity(GROWTH_CONFIG, 0, 'normal'), 20000);
  assert.equal(trainingOpportunity(GROWTH_CONFIG, 120000, 'normal'), 80000);
  assert.equal(trainingBudget(GROWTH_CONFIG, 0, 'normal'), 1200);
  assert.equal(trainingBudget(GROWTH_CONFIG, 120000, 'normal'), 3600);
  assert.ok(
    trainingOpportunity(GROWTH_CONFIG, 60000, 'light') <
      trainingOpportunity(GROWTH_CONFIG, 60000, 'normal'),
  );
  assert.ok(
    trainingBudget(GROWTH_CONFIG, 60000, 'hard') > trainingBudget(GROWTH_CONFIG, 60000, 'normal'),
  );
  assert.equal(trainingOpportunity(GROWTH_CONFIG, 120000, 'rest'), 0);
  assert.equal(trainingBudget(GROWTH_CONFIG, 120000, 'rest'), 0);
});

test('日次境界：全試合完了前/同日二重処理を拒否、閲覧・開始だけでは成長や乱数を変更しない', () => {
  const world = createDailyTrainingWorld();
  const before = structuredClone(world);
  assert.throws(() => applyTrainingDay(world));
  assert.throws(() => completeDay(world, world.currentDate));
  growthView(world);
  currentCommonAbilities(world, first);
  growthBasis(world.definitions, first);
  assert.deepEqual(world, before);
  const partial = advanceWorld(world, 25) as Current;
  assert.deepEqual(partial.growth, world.growth);
  assert.deepEqual(partial.definitions, world.definitions);
  const after = completeDay(boundary, boundary.currentDate) as Current;
  assert.equal(Object.keys(after.growth.state.days).length, 1);
  assert.equal(after.growth.state.days[boundary.currentDate]!.outcomes.length, 120);
  for (const p of Object.values(after.growth.state.players)) assert.equal(p.rng.drawCount, 2);
  assert.throws(() => applyTrainingDay({ ...boundary, growth: after.growth }));
  assert.throws(() => completeDay(after, boundary.currentDate));
  validateWorld(after);
});

test('配分：群の総量を分割・指定外へ基礎練習・上限厳守・入力不変、休養でも乱数消費は一定', () => {
  const one = directed(),
    many = directed({ kind: 'group', groupId: 'contact' });
  const snapshot = structuredClone(one);
  const a = applyTrainingDay(one),
    b = applyTrainingDay(many);
  assert.deepEqual(one, snapshot);
  for (const result of [a, b]) {
    const outcome = result.growth.state.days[one.currentDate]!.outcomes.find(
      (v) => v.playerId === first,
    )!;
    assert.equal(outcome.opportunityOccurred, true);
    assert.equal(outcome.energySpentMilli, 4000);
    const changes = result.growth.state.days[one.currentDate]!.changes.filter(
      (v) => v.playerId === first,
    );
    assert.equal(
      changes.reduce((s, v) => s + v.afterValue - v.beforeValue, 0),
      outcome.budgetMilli,
    );
    assert.ok(
      changes.some(
        (v) =>
          growthAbilityKey(v.abilityRef) !==
          growthAbilityKey(
            settings.target.kind === 'ability'
              ? settings.target.abilityRef
              : commonTrainingRef('batting.contactVsRight'),
          ),
      ),
    );
  }
  assert.equal(
    a.growth.state.days[one.currentDate]!.outcomes[0]!.budgetMilli,
    b.growth.state.days[one.currentDate]!.outcomes[0]!.budgetMilli,
  );
  const capped = directed();
  for (const id of Object.keys(capped.growth.state.players))
    for (const ability of growthBasis(capped.definitions, id))
      capped.growth.state.players[id]!.values[ability.key] = ability.ceilingMilli;
  assert.equal(applyTrainingDay(capped).growth.state.days[capped.currentDate]!.changes.length, 0);
  const rest = directed();
  if (rest.management.version === 'club-management-v2')
    for (const p of Object.values(rest.management.training.plans)) p.intensity = 'rest';
  const rested = applyTrainingDay(rest);
  assert.equal(rested.growth.state.days[rest.currentDate]!.changes.length, 0);
  assert.deepEqual(rested.physical, rest.physical);
  for (const p of Object.values(rested.growth.state.players)) assert.equal(p.rng.drawCount, 2);
});

test('疲労の自動調整：境界の体力・疲労・実出場負荷を使用、手動指定と軽めを強めない', () => {
  const auto = { ...settings, intensity: 'hard' as const, autoAdjustForFatigue: true };
  const a = GROWTH_CONFIG.fatigueAdjustment;
  for (const [e, f, w, expected] of [
    [100000, 0, 0, 'hard'],
    [a.lightEnergyAtOrBelowMilli, 0, 0, 'light'],
    [a.restEnergyAtOrBelowMilli, 0, 0, 'rest'],
    [100000, a.lightFatigueAtOrAboveMilli, 0, 'light'],
    [100000, a.restFatigueAtOrAboveMilli, 0, 'rest'],
    [100000, 0, a.lightWorkloadAtOrAbove, 'light'],
    [100000, 0, a.restWorkloadAtOrAbove, 'rest'],
  ] as const)
    assert.equal(chooseTrainingIntensity(auto, e, f, w, GROWTH_CONFIG).intensity, expected);
  assert.equal(
    chooseTrainingIntensity(
      { ...auto, autoAdjustForFatigue: false },
      0,
      100000,
      999999,
      GROWTH_CONFIG,
    ).intensity,
    'hard',
  );
  assert.equal(
    chooseTrainingIntensity({ ...auto, intensity: 'light' }, 100000, 0, 0, GROWTH_CONFIG).intensity,
    'light',
  );
  const loaded = structuredClone(boundary);
  loaded.definitions.growthConfig!.fatigueAdjustment.lightWorkloadAtOrAbove = 1;
  loaded.definitions.growthConfig!.fatigueAdjustment.restWorkloadAtOrAbove = 1;
  for (const body of Object.values(loaded.physical.players)) {
    body.energyMilli = 100000;
    body.fatigueMilli = 0;
  }
  const outcome = applyTrainingDay(loaded).growth.state.days[loaded.currentDate]!.outcomes;
  assert.ok(outcome.some((v) => v.adjustmentReasons.includes('出場負荷')));
});

test('次の試合入力：現在の共通能力・持ち球を使用し、初期定義と過去試合・試合乱数を不変に保つ', () => {
  const world = finish(createDailyTrainingWorld(31));
  const baseline = structuredClone(world.definitions);
  const beforeGames = structuredClone(world.games);
  const fixture = createScheduledGame(world, world.dayPlan.gameIds[0]!).fixture;
  for (const p of fixture.players) {
    const ability = currentCommonAbilities(world, p.playerId)!;
    assert.deepEqual(p.batting.contactVsRight, ability['batting.contactVsRight']);
    assert.deepEqual(p.powerVsLeft, ability['batting.powerVsLeft']);
  }
  for (const p of fixture.pitches)
    assert.equal(
      p.control.valueMilli,
      world.growth.state.players[p.playerId]!.values[
        growthAbilityKey({ scope: 'pitch', pitchId: p.pitchId, code: 'control' })
      ],
    );
  assert.deepEqual(world.definitions, baseline);
  assert.deepEqual(world.games, beforeGames);
});

test('成長集計：小数の端点切捨て、増減の内訳・除外対象・期間巻戻しと閲覧投影の分離', () => {
  const world = finish(createDailyTrainingWorld(31));
  const basis = growthBasis(world.definitions, first);
  const before = Object.fromEntries(basis.map((v) => [v.key, v.valueMilli]));
  const after = { ...before };
  before[basis[0]!.key] = 59999;
  after[basis[0]!.key] = 60001;
  before[basis[1]!.key] = 60100;
  after[basis[1]!.key] = 59999;
  const sums = growthComparison(world.definitions, first, before, after);
  assert.equal(sums.increase, 1);
  assert.equal(sums.decrease, -1);
  assert.equal(sums.net, 0);
  assert.equal(sums.rows.length, basis.length);
  assert.ok(
    sums.rows.every(
      (row) => !['aptitude', 'talent', 'ambition', 'velocity'].includes(row.abilityRef.code),
    ),
  );
  const view = growthView(world)!;
  assert.equal(view.dates.length, 1);
  assert.deepEqual(
    view.periods.lastDay.start[first],
    Object.fromEntries(basis.map((v) => [v.key, v.valueMilli])),
  );
  assert.deepEqual(view.periods.season.start, view.periods.lastDay.start);
  assert.equal('rng' in view.current[first]!, false);
  const controller = WorldController.fromCommitted({} as any, 'read-only', 0, world, {
    storageRevision: 0,
    auto: null,
    previousAuto: null,
    manual: null,
  });
  const query = controller.query();
  query.growth!.current[first]![basis[0]!.key] = 0;
  assert.notEqual(controller.query().growth!.current[first]![basis[0]!.key], 0);
});

test('保存：日別ブロックv017・現在値/全履歴/RNGの復元、改変拒否・旧v20の非補完', async () => {
  const db = new WorldDatabase('growth-save');
  try {
    const storage = new DexieWorldStorage(db);
    const world = finish(createDailyTrainingWorld(31));
    await storage.save(world, 1, 'manual', 0);
    const snapshot = (await db.save_snapshots.toArray())[0]!;
    assert.equal(snapshot.versions.saveFormatVersion, 'v017-world-snapshot-v16');
    assert.equal(snapshot.blockRefs.filter((v) => v.kind === 'growthDay').length, 1);
    assert.ok(snapshot.blockRefs.some((v) => v.logicalKey === 'growth/day/2026-09-24'));
    const loaded = (await storage.load('manual')).world;
    assert.deepEqual(loaded, world);
    assert.deepEqual(
      (await decodeBackup(await exportStoredPlay(db, storage.localWorldId, 'manual'))).world,
      world,
    );
    assert.deepEqual(finish(loaded), finish(world));
    for (const mutate of [
      (w: any) => w.growth.state.players[first].rng.drawCount++,
      (w: any) =>
        w.growth.state.players[first].values[growthBasis(world.definitions, first)[0]!.key]++,
      (w: any) => w.growth.state.days['2026-09-24'].changes[0].afterValue++,
      (w: any) => w.growth.state.days['2026-09-24'].outcomes.pop(),
      (w: any) => delete w.growth.state.days['2026-09-24'],
      (w: any) => (w.version = 'world-prototype-v15'),
      (w: any) => (w.definitions.version = 'world-definitions-v20'),
    ]) {
      const broken = structuredClone(world);
      mutate(broken);
      assert.throws(() => validateWorld(broken));
    }
    // 日次チェックポイント後も過去履歴の変更を受け入れない。
    const changed = structuredClone(world);
    changed.growth.state.days['2026-09-24']!.changes[0]!.afterValue++;
    await assert.rejects(storage.save(changed, 2, 'manual', 1));
    assert.deepEqual((await storage.load('manual')).world, world);
    const old = finish(createTrainingPlanWorld(31));
    await storage.save(old, 2, 'manual', 1);
    const oldLoaded = (await storage.load('manual')).world;
    assert.deepEqual(oldLoaded, old);
    assert.equal(growthView(oldLoaded), null);
  } finally {
    db.close();
    await db.delete();
  }
});

test('日次の保存失敗：成長・身体・履歴を未公開のまま保持し、同じ指示の再試行を一度だけ確定', async () => {
  const db = new WorldDatabase('growth-fail');
  try {
    const storage = new DexieWorldStorage(db);
    const slots = await storage.save(boundary, 1, 'manual', 0);
    const controller = WorldController.fromCommitted(
      storage,
      storage.localWorldId,
      1,
      boundary,
      slots,
    );
    const before = controller.query();
    const command = {
      kind: 'completeDay' as const,
      date: before.currentDate,
      commandId: 'retry-growth',
      localWorldId: before.localWorldId,
      expectedStateRevision: before.revision,
    };
    const save = storage.save.bind(storage);
    storage.save = async () => {
      throw new Error('保存失敗の試験');
    };
    await assert.rejects(controller.dispatch(command));
    const failed = controller.query();
    assert.deepEqual(failed.growth, before.growth);
    assert.deepEqual(failed.physical, before.physical);
    assert.equal(failed.revision, before.revision);
    assert.equal(failed.currentDate, before.currentDate);
    storage.save = save;
    const next = await controller.dispatch(command);
    assert.equal(next.growth!.dates.length, 1);
    assert.equal(next.currentDate, '2026-09-25');
    assert.deepEqual(await controller.dispatch(command), next);
    const stored = (await storage.load('auto')).world;
    assert.ok('growth' in stored);
    assert.equal(stored.growth.state.players[first]!.rng.drawCount, 2);
  } finally {
    db.close();
    await db.delete();
  }
});

test('モデル無効時の互換：旧v20と全短期試合・身体・成績・試合乱数が一致', () => {
  const definitions = createDailyTrainingDefinitions();
  definitions.growthConfig!.enabled = false;
  let current: WorldRecord = createDailyTrainingWorld(72, undefined, definitions),
    old: WorldRecord = createTrainingPlanWorld(72);
  while (worldPhase(current) !== 'scheduleComplete') {
    current = finish(current);
    old = finish(old);
    const { definitions: _d, version: _v, growth: _g, ...a } = current as Current;
    const { definitions: _od, version: _ov, ...b } = old;
    assert.deepEqual(a, b);
  }
  const final = current as Current;
  for (const p of Object.values(final.growth.state.players)) assert.equal(p.rng.drawCount, 0);
  validateWorld(final);
});

test('個別練習の保存：JSONの項目順を変えても能力・持ち球・守備習熟の実績を再現する', async () => {
  const definitions = createDailyTrainingDefinitions();
  definitions.growthConfig!.opportunity = { baseMilli: 100000, ambitionMilli: 0 };
  for (const [index, row] of definitions.trainingPlans!.players.entries()) {
    const pitch = definitions.squads
      .flatMap((s) => s.pitches)
      .find((p) => p.playerId === row.playerId);
    row.settings = {
      ...settings,
      target: pitch
        ? {
            kind: 'ability',
            abilityRef: { scope: 'pitch', pitchId: pitch.pitchId, code: 'control' },
          }
        : index % 2
          ? {
              kind: 'ability',
              abilityRef: { scope: 'position', positionCode: 'C', code: 'familiarity' },
            }
          : settings.target,
    };
  }
  const source = finish(createDailyTrainingWorld(31, undefined, definitions));
  const reordered = finish(
    createDailyTrainingWorld(31, undefined, JSON.parse(canonicalJson(definitions))),
  );
  assert.equal(await sha256(canonicalJson(source)), await sha256(canonicalJson(reordered)));
  const db = new WorldDatabase('growth-reference-order');
  try {
    const storage = new DexieWorldStorage(db);
    await storage.save(source, 1, 'manual', 0);
    const restored = (await storage.load('manual')).world;
    assert.deepEqual(restored, source);
    assert.deepEqual(
      (await decodeBackup(await exportStoredPlay(db, storage.localWorldId, 'manual'))).world,
      source,
    );
    assert.deepEqual(finish(restored), finish(source));
  } finally {
    db.close();
    await db.delete();
  }
});

test('連続日次保存：確定履歴ブロックを再利用し、過去日の未検証な差替えを拒否する', async () => {
  const db = new WorldDatabase('growth-consecutive');
  try {
    const storage = new DexieWorldStorage(db);
    const firstDay = finish(createDailyTrainingWorld(31));
    await storage.save(firstDay, 1, 'auto', 0);
    const oldSlot = (await storage.listSlots()).auto!;
    const initial = (await db.save_snapshots.get(oldSlot.snapshotId))!;
    const firstRef = initial.blockRefs.find((row) => row.kind === 'growthDay')!;
    const nextDay = finish(firstDay);
    await storage.save(nextDay, 2, 'auto', 1);
    const slots = await storage.listSlots();
    const latest = (await db.save_snapshots.get(slots.auto!.snapshotId))!;
    assert.equal(
      latest.blockRefs.find((row) => row.logicalKey === firstRef.logicalKey)!.blockId,
      firstRef.blockId,
    );
    assert.equal(latest.blockRefs.filter((row) => row.kind === 'growthDay').length, 2);
    assert.equal(Object.isFrozen(firstDay.growth.state.days[firstDay.lastCompletedDate!]), true);
    assert.deepEqual((await storage.load('auto')).world, nextDay);
    const broken = structuredClone(nextDay);
    broken.growth.state.days[firstDay.lastCompletedDate!]!.outcomes[0]!.budgetMilli++;
    await assert.rejects(storage.save(broken, 3, 'manual', 2));
    assert.deepEqual((await storage.load('auto')).world, nextDay);
  } finally {
    db.close();
    await db.delete();
  }
});

/** 全項目を比較するが、元世界と復元世界・188日分の巨大文字列を同時に保持しない。 */
async function annualTrainingHashes(world: WorldRecord) {
  assert.ok('growth' in world);
  const { games, growth, ...core } = world;
  const { days, ...state } = growth.state;
  const gameHashes: Record<string, string> = {};
  const dayHashes: Record<string, string> = {};
  for (const id of Object.keys(games).sort())
    gameHashes[id] = await sha256(canonicalJson(games[id]));
  for (const date of Object.keys(days).sort())
    dayHashes[date] = await sha256(canonicalJson(days[date]));
  return {
    core: await sha256(canonicalJson(core)),
    growth: await sha256(canonicalJson({ ...growth, state })),
    games: gameHashes,
    days: dayHashes,
  };
}

test('成長付き年間：188日216試合を完走し、日別履歴を分割して保存・バックアップを再現', async () => {
  let world: Current | null = createDailyTrainingWorld(
    20260924,
    undefined,
    createDailyTrainingDefinitions('annual'),
  );
  while (worldPhase(world) !== 'scheduleComplete') {
    world = finish(world);
    if (world.completedDates.length % 30 === 0) {
      console.log(`通常練習の年間検証：${world.completedDates.length} / 188日`);
      await setImmediate();
    }
  }
  assert.equal(world.completedDates.length, 188);
  assert.equal(Object.keys(world.games).length, 216);
  assert.equal(Object.keys(world.growth.state.days).length, 188);
  assert.equal(world.currentDate, '2026-10-01');
  for (const p of Object.values(world.growth.state.players)) assert.equal(p.rng.drawCount, 376);
  for (const id of Object.keys(world.growth.state.players))
    for (const a of growthBasis(world.definitions, id))
      assert.ok(world.growth.state.players[id]!.values[a.key]! <= a.ceilingMilli);
  const expected = await annualTrainingHashes(world);
  const db = new WorldDatabase('growth-annual');
  try {
    // StorageAdapterが保持する検証済み世界の参照も、保存後は残さない。
    const save = async (value: Current) => {
      const storage = new DexieWorldStorage(db);
      await storage.save(value, 1, 'manual', 0);
      return storage.localWorldId;
    };
    console.log('通常練習の年間検証：完走、保存');
    const localWorldId = await save(world);
    world = null;
    const snapshot = (await db.save_snapshots.toArray())[0]!;
    assert.equal(snapshot.blockRefs.length, 407);
    assert.equal(snapshot.blockRefs.filter((v) => v.kind === 'growthDay').length, 188);
    assert.ok(snapshot.blockRefs.every((v) => v.rawBytes <= 16 * 1024 * 1024));
    console.log('通常練習の年間検証：DB復元');
    assert.deepEqual(
      await annualTrainingHashes((await new DexieWorldStorage(db).load('manual')).world),
      expected,
    );
    console.log('通常練習の年間検証：バックアップ復元');
    assert.deepEqual(
      await annualTrainingHashes(
        (await decodeBackup(await exportStoredPlay(db, localWorldId, 'manual'))).world,
      ),
      expected,
    );
  } finally {
    db.close();
    await db.delete();
  }
});
