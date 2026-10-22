import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import { EXPERIENCE_CONFIG } from '../config/experience.ts';
import { createDevelopmentDefinitions } from '../src/data/world/development.ts';
import { createDailyTrainingDefinitions } from '../src/data/world/daily-training.ts';
import {
  createDevelopmentWorld,
  createDailyTrainingWorld,
  advanceWorld,
  completeDay,
  worldPhase,
  createScheduledGame,
  validateDefinitions,
} from '../src/world/engine.ts';
import {
  applyDevelopmentDay,
  experienceActivities,
  experienceOpportunity,
  experienceBudget,
  experienceOpponentFactor,
  effectiveExperienceUnitsMilli,
} from '../src/world/experience.ts';
import { growthAbilityKey, growthBasis } from '../src/world/growth-basis.ts';
import { growthView } from '../src/world/growth-view.ts';
import { seasonGrowthReport } from '../src/world/season-growth.ts';
import { validateWorld } from '../src/world/validation.ts';
import { DexieWorldStorage, WorldDatabase } from '../src/world/dexie-storage.ts';
import { WorldController } from '../src/world/controller.ts';
import { exportStoredPlay } from '../src/world/backup-storage.ts';
import { decodeBackup } from '../src/world/backup-package.ts';
import { canonicalJson, sha256 } from '../src/storage/codec.ts';
import type { WorldRecord } from '../src/world/types.ts';

type Current = ReturnType<typeof createDevelopmentWorld>;
function ready<T extends WorldRecord>(w: T): T {
  while (worldPhase(w) === 'playing') w = advanceWorld(w, 25) as T;
  return w;
}
function finish<T extends WorldRecord>(w: T): T {
  w = ready(w);
  return completeDay(w, w.currentDate) as T;
}
const definitions = createDevelopmentDefinitions();
definitions.growthConfig!.enabled = false;
definitions.experienceConfig!.opportunity = { baseMilli: 100000, ambitionMilli: 0 };
const boundary = ready(createDevelopmentWorld(31, undefined, definitions));
const activities = experienceActivities(boundary);
const result = completeDay(boundary, boundary.currentDate) as Current;
const day = result.growth.state.days[boundary.currentDate]!;

// 旧モデルからの検体は変更前4ad6d23で固定し、現行計算から期待値を作らない。
const oldBytes = readFileSync(new URL('./fixtures/world-v16-in-progress.json.gz', import.meta.url));
const oldFixture = () =>
  JSON.parse(gunzipSync(oldBytes).toString('utf8')) as ReturnType<typeof createDailyTrainingWorld>;

test('経験モデル：新規v17/v22/v2のみ有効、旧定義へ追加せず係数の過不足と範囲を検査', () => {
  const w = createDevelopmentWorld(7);
  assert.equal(w.version, 'world-prototype-v17');
  assert.equal(w.definitions.version, 'world-definitions-v22');
  assert.equal(w.growth.version, 'daily-development-v2');
  assert.equal(Object.keys(w.growth.state.experienceRng).length, 120);
  validateWorld(w);
  for (const mutate of [
    (d: any) => delete d.experienceConfig,
    (d: any) => (d.experienceConfig.opportunity.baseMilli = 0),
    (d: any) => (d.experienceConfig.domains.pitching.saturationUnits = 1.5),
    (d: any) => (d.experienceConfig.opponent.spanPermille = 201),
    (d: any) => (d.experienceConfig.extra = true),
  ]) {
    const d = structuredClone(w.definitions);
    mutate(d);
    assert.throws(() => validateDefinitions(d));
  }
  const old = createDailyTrainingDefinitions();
  old.experienceConfig = EXPERIENCE_CONFIG;
  assert.throws(() => validateDefinitions(old));
  assert.throws(() => createDailyTrainingWorld(1, undefined, w.definitions));
  assert.equal('experienceRng' in oldFixture().growth.state, false);
});

test('試作式：才能は量、向上心は機会、0にも基礎効果。量は逓減し相手補正を制限', () => {
  const c = EXPERIENCE_CONFIG;
  assert.equal(experienceOpportunity(c, 0), 25000);
  assert.equal(experienceOpportunity(c, 120000), 75000);
  assert.ok(experienceBudget(c, 'batting', 0, 4, 1000) > 0);
  assert.equal(
    experienceBudget(c, 'batting', 120000, 4, 1000),
    2 * experienceBudget(c, 'batting', 0, 4, 1000),
  );
  assert.equal(effectiveExperienceUnitsMilli(c, 'batting', 6), 3000);
  assert.ok(effectiveExperienceUnitsMilli(c, 'batting', 12) < 6000);
  assert.ok(effectiveExperienceUnitsMilli(c, 'batting', 100000) < 6000);
  const low = effectiveExperienceUnitsMilli(c, 'pitching', 20),
    high = effectiveExperienceUnitsMilli(c, 'pitching', 40);
  assert.ok(high > low && high < 2 * low);
  assert.equal(experienceOpponentFactor(c, 0), 900);
  assert.equal(experienceOpponentFactor(c, 60000), 1000);
  assert.equal(experienceOpponentFactor(c, 120000), 1100);
  assert.equal(experienceOpponentFactor(c, 999999), 1100);
});

test('実出場：一軍と二軍の完了打席・実投球・実守備位置にだけ対応する', () => {
  const expected = new Map<string, number>();
  const add = (id: string, d: string) => {
    const k = id + ':' + d;
    expected.set(k, (expected.get(k) ?? 0) + 1);
  };
  for (const gameId of boundary.dayPlan.gameIds) {
    const g = boundary.games[gameId]!;
    for (const e of g.events)
      if (e.pitch) {
        add(e.pitch.pitcherId, 'pitching');
        if (e.outcome !== null) add(e.pitch.batterId, 'batting');
        for (const d of e.defensiveAlignment!) add(d.playerId, 'fielding');
      }
    for (const line of g.result!.batting)
      assert.equal(
        activities
          .find((a) => a.playerId === line.playerId && a.domain === 'batting')
          ?.sources.find((s) => s.gameId === gameId)?.units ?? 0,
        line.plateAppearances,
      );
  }
  assert.equal(activities.length, expected.size);
  for (const a of activities) {
    assert.equal(a.units, expected.get(a.playerId + ':' + a.domain));
    assert.equal(
      a.sources.reduce((s, r) => s + r.units, 0),
      a.units,
    );
    assert.equal(
      a.targets.reduce((s, r) => s + r.units, 0),
      a.units * (a.domain === 'batting' ? 3 : a.domain === 'pitching' ? 2 : 1),
    );
    for (const target of a.targets)
      assert.ok(
        growthBasis(boundary.definitions, a.playerId).some(
          (b) => b.key === growthAbilityKey(target.abilityRef),
        ),
      );
  }
  assert.ok(
    activities.some((a) =>
      a.sources.some((s) =>
        boundary.definitions.schedule.some(
          (g) =>
            g.gameId === s.gameId &&
            boundary.definitions.farm!.squads.some((f) => f.squadId === g.homeSquadId),
        ),
      ),
    ),
  );
  assert.ok(day.changes.some((c) => c.reason === 'experience' && c.abilityRef.scope === 'pitch'));
  assert.ok(
    day.changes.some((c) => c.reason === 'experience' && c.abilityRef.scope === 'position'),
  );
});

test('成否に依存しない：凡退・失点後も経験があり、同じ出場なら成績だけで経験量を変えない', () => {
  const w = structuredClone(boundary);
  const original = experienceActivities(w);
  const games = Object.values(w.games);
  assert.ok(
    games.some((g) => g.events.some((e) => e.outcome === 'strikeout' || e.outcome === 'battedOut')),
  );
  assert.ok(games.some((g) => g.result!.score.home + g.result!.score.away > 0));
  for (const g of games) for (const e of g.events) if (e.outcome !== null) e.outcome = 'homeRun';
  assert.deepEqual(experienceActivities(w), original);
});

test('成長の対応：経験予算を実際の対象だけへ配分し、上限を超えず控えに誤加算しない', () => {
  for (const outcome of day.experience) {
    const changes = day.changes.filter(
      (c) => c.sourceEventId === `experience-day-${day.date}-${outcome.playerId}-${outcome.domain}`,
    );
    assert.equal(
      changes.reduce((s, c) => s + c.afterValue - c.beforeValue, 0),
      outcome.appliedMilli,
    );
    assert.ok(outcome.appliedMilli <= outcome.budgetMilli);
    assert.ok(outcome.budgetMilli > 0);
    assert.ok(
      changes.every((c) =>
        outcome.targets.some(
          (t) => growthAbilityKey(t.abilityRef) === growthAbilityKey(c.abilityRef),
        ),
      ),
    );
  }
  const inactive = Object.keys(boundary.growth.state.players).filter(
    (id) => !activities.some((a) => a.playerId === id),
  );
  assert.ok(inactive.length > 0);
  for (const id of inactive) {
    assert.deepEqual(result.growth.state.players[id], boundary.growth.state.players[id]);
    assert.equal(result.growth.state.experienceRng[id]!.drawCount, 0);
  }
  for (const id of Object.keys(result.growth.state.players)) {
    assert.equal(
      result.growth.state.experienceRng[id]!.drawCount,
      activities.filter((a) => a.playerId === id).length,
    );
    for (const a of growthBasis(result.definitions, id))
      assert.ok(result.growth.state.players[id]!.values[a.key]! <= a.ceilingMilli);
  }
  const capped = structuredClone(boundary);
  for (const [id, p] of Object.entries(capped.growth.state.players))
    for (const a of growthBasis(capped.definitions, id)) p.values[a.key] = a.ceilingMilli;
  const after = applyDevelopmentDay(capped);
  assert.equal(after.growth.state.days[day.date]!.changes.length, 0);
  assert.ok(after.growth.state.days[day.date]!.experience.every((e) => e.appliedMilli === 0));
});

test('境界と独立性：途中では確定しない。通常練習と別乱数、試合後の負荷を二重に加えない', () => {
  const initial = createDevelopmentWorld(31, undefined, definitions);
  assert.throws(() => applyDevelopmentDay(initial));
  const partial = advanceWorld(initial, 17) as Current;
  assert.deepEqual(partial.growth, initial.growth);
  const before = canonicalJson(boundary);
  const preview = applyDevelopmentDay(boundary);
  assert.equal(canonicalJson(boundary), before);
  assert.deepEqual(preview.physical, boundary.physical);
  assert.deepEqual(result.games, boundary.games);
  for (const [id, p] of Object.entries(result.growth.state.players))
    assert.deepEqual(p.rng, boundary.growth.state.players[id]!.rng);
  growthView(result);
  seasonGrowthReport(result, 'firstRegular');
  assert.deepEqual(result.growth, preview.growth);
  assert.throws(() => applyDevelopmentDay({ ...boundary, growth: preview.growth }));
  const next = createScheduledGame(result, result.dayPlan.gameIds[0]!);
  assert.ok(
    next.fixture.players.some(
      (p) =>
        canonicalJson(p) !==
        canonicalJson(
          boundary.definitions.squads
            .flatMap((s) => s.players)
            .find((b) => b.playerId === p.playerId),
        ),
    ),
  );
  assert.equal(Object.isFrozen(day), true);
});

test('設定無効：旧v16と短期全試合・通常練習・身体・全試合乱数が一致する', () => {
  const d = createDevelopmentDefinitions();
  d.experienceConfig!.enabled = false;
  let w = createDevelopmentWorld(31, undefined, d),
    old = createDailyTrainingWorld(31);
  while (worldPhase(w) !== 'scheduleComplete') {
    w = finish(w);
    old = finish(old);
    const { definitions: _d, version: _v, growth: g, ...a } = w;
    const { definitions: _od, version: _ov, growth: og, ...b } = old;
    assert.deepEqual(a, b);
    assert.deepEqual(g.state.players, og.state.players);
    for (const date of w.completedDates) {
      const { experience, ...normal } = g.state.days[date]!;
      assert.deepEqual(normal, og.state.days[date]);
      assert.deepEqual(experience, []);
    }
  }
  validateWorld(w);
});

test('保存v018：全乱数/履歴/次日を復元し、バックアップと改変拒否、過去ブロック再利用を確認', async () => {
  const db = new WorldDatabase('experience-save');
  try {
    const storage = new DexieWorldStorage(db);
    await storage.save(result, 1, 'manual', 0);
    const snapshot = (await db.save_snapshots.toArray())[0]!;
    assert.equal(snapshot.versions.saveFormatVersion, 'v018-world-snapshot-v17');
    assert.equal(snapshot.blockRefs.filter((r) => r.kind === 'growthDay').length, 1);
    const restored = (await storage.load('manual')).world;
    assert.deepEqual(restored, result);
    const backup = await decodeBackup(await exportStoredPlay(db, storage.localWorldId, 'manual'));
    assert.deepEqual(backup.world, result);
    const second = finish(result);
    assert.deepEqual(finish(restored), second);
    await storage.save(second, 2, 'manual', 1);
    const secondSnapshot = (await db.save_snapshots.toArray()).find((s) => s.stateRevision === 2)!;
    assert.equal(
      secondSnapshot.blockRefs.find((r) => r.logicalKey === 'growth/day/' + day.date)!.blockId,
      snapshot.blockRefs.find((r) => r.logicalKey === 'growth/day/' + day.date)!.blockId,
    );
    for (const mutate of [
      (w: any) => w.growth.state.experienceRng[activities[0]!.playerId].drawCount++,
      (w: any) => w.growth.state.days[day.date].experience[0].units++,
      (w: any) => w.growth.state.days[day.date].experience[0].sources[0].units++,
      (w: any) => (w.growth.state.days[day.date].changes[0].reason = 'training'),
    ]) {
      const broken = structuredClone(result);
      mutate(broken);
      assert.throws(() => validateWorld(broken));
    }
    const corrupted = structuredClone(second);
    corrupted.growth.state.days[day.date]!.experience.pop();
    await assert.rejects(storage.save(corrupted, 3, 'manual', 2));
    assert.deepEqual((await storage.load('manual')).world, second);
  } finally {
    db.close();
    await db.delete();
  }
});

test('日次保存の失敗・再送：経験/RNGを未公開のまま保持し、再試行を一度だけ確定する', async () => {
  const db = new WorldDatabase('experience-retry');
  try {
    const storage = new DexieWorldStorage(db);
    const slots = await storage.save(boundary, 1, 'manual', 0);
    const c = WorldController.fromCommitted(storage, storage.localWorldId, 1, boundary, slots);
    const before = c.query();
    const command = {
      kind: 'completeDay' as const,
      date: before.currentDate,
      commandId: 'experience-retry',
      localWorldId: before.localWorldId,
      expectedStateRevision: before.revision,
    };
    const save = storage.save.bind(storage);
    storage.save = async () => {
      throw Error('失敗の試験');
    };
    await assert.rejects(c.dispatch(command));
    const failed = c.query();
    assert.match(failed.storageError!, /自動保存に失敗/);
    assert.deepEqual({ ...failed, storageError: before.storageError }, before);
    storage.save = save;
    const after = await c.dispatch(command);
    assert.deepEqual(await c.dispatch(command), after);
    assert.deepEqual((await storage.load('auto')).world, result);
    assert.deepEqual(after.growth, growthView(result));
  } finally {
    db.close();
    await db.delete();
  }
});

test('固定v16：変更前の途中保存を再保存/復元して続行し、0.38終了検体と全状態が一致する', async () => {
  assert.equal(
    createHash('sha256').update(oldBytes).digest('hex'),
    'aa2606f8638ee0fea3f249285a3ee1da0d5a677124e88b6a162fd2c027a5f516',
  );
  const w = oldFixture();
  assert.equal(
    await sha256(canonicalJson(w)),
    '056c94bcdd0cc32987f372457472550119e9659bca42c03e7cff924a2b8a863a',
  );
  validateWorld(w);
  const db = new WorldDatabase('experience-old-v16');
  try {
    const s = new DexieWorldStorage(db);
    await s.save(w, 1, 'manual', 0);
    let loaded = (await s.load('manual')).world;
    assert.deepEqual(loaded, w);
    assert.equal(growthView(loaded)!.latest!.experience, undefined);
    while (worldPhase(loaded) !== 'scheduleComplete') loaded = finish(loaded);
    assert.equal(
      await sha256(canonicalJson(loaded)),
      '64218a64ca155e8ed9f1b0d64bc72550fb711800504dad2924a920adf9a6e8ce',
    );
    assert.deepEqual(
      (await decodeBackup(await exportStoredPlay(db, s.localWorldId, 'manual'))).world,
      w,
    );
  } finally {
    db.close();
    await db.delete();
  }
});

test('項目順と休養指定：JSON順序によらず再現し、休養日の実出場にも経験を記録する', async () => {
  const d = createDevelopmentDefinitions();
  for (const p of d.trainingPlans!.players) p.settings.intensity = 'rest';
  const a = finish(createDevelopmentWorld(31, undefined, d));
  const b = finish(createDevelopmentWorld(31, undefined, JSON.parse(canonicalJson(d))));
  assert.equal(await sha256(canonicalJson(a)), await sha256(canonicalJson(b)));
  assert.ok(
    a.growth.state.days[a.lastCompletedDate!]!.outcomes.every(
      (o) => o.effectiveIntensity === 'rest',
    ),
  );
  assert.ok(a.growth.state.days[a.lastCompletedDate!]!.experience.some((o) => o.appliedMilli > 0));
});

/** 年間全体の巨大なJSONを一度に作らず、全区画を正規化ハッシュで照合する。 */
async function annualHashes(world: WorldRecord) {
  assert.ok('growth' in world);
  const { games, growth, ...core } = world;
  const hashes: Record<string, string> = {};
  for (const id of Object.keys(games).sort()) hashes[id] = await sha256(canonicalJson(games[id]));
  return {
    core: await sha256(canonicalJson(core)),
    growth: await sha256(canonicalJson(growth)),
    games: hashes,
  };
}

test('実戦経験付き年間：188日216試合、総括・実v018保存/読込/バックアップと容量制限を確認', async () => {
  let w: Current | null = createDevelopmentWorld(
    20260924,
    undefined,
    createDevelopmentDefinitions('annual'),
  );
  while (worldPhase(w) !== 'scheduleComplete') {
    w = finish(w);
    if (w.completedDates.length % 30 === 0) {
      console.log(`実戦経験の年間検証：${w.completedDates.length} / 188日`);
      await setImmediate();
    }
  }
  assert.equal(w.completedDates.length, 188);
  assert.equal(Object.keys(w.games).length, 216);
  assert.equal(Object.keys(w.growth.state.days).length, 188);
  for (const id of Object.keys(w.growth.state.players)) {
    assert.equal(w.growth.state.players[id]!.rng.drawCount, 376);
    assert.equal(
      w.growth.state.experienceRng[id]!.drawCount,
      Object.values(w.growth.state.days).reduce(
        (sum, d) => sum + d.experience.filter((e) => e.playerId === id).length,
        0,
      ),
    );
  }
  assert.equal(seasonGrowthReport(w, 'firstRegular')!.rows.length, 120);
  const db = new WorldDatabase('experience-annual');
  try {
    console.log('実戦経験の年間検証：完走、全状態の基準ハッシュと保存を確認');
    const expected = await annualHashes(w);
    // 検査用の原本・復元・バックアップを同時に保持しない。
    // Storageの私有チェックポイントも、この補助関数を出たら解放可能にする。
    const save = async (world: Current) => {
      const storage = new DexieWorldStorage(db);
      await storage.save(world, 1, 'manual', 0);
      return storage.localWorldId;
    };
    const localWorldId = await save(w);
    w = null;
    const snapshot = (await db.save_snapshots.toArray())[0]!;
    assert.equal(snapshot.blockRefs.length, 407);
    assert.ok(snapshot.blockRefs.every((r) => r.rawBytes <= 16 * 1024 * 1024));
    assert.ok(snapshot.blockRefs.reduce((sum, r) => sum + r.rawBytes, 0) <= 512 * 1024 * 1024);
    console.log('実戦経験の年間検証：DBの復元と全区画の照合');
    const load = async () => (await new DexieWorldStorage(db).load('manual')).world;
    assert.deepEqual(await annualHashes(await load()), expected);
    console.log('実戦経験の年間検証：バックアップの復元と全区画の照合');
    assert.deepEqual(
      await annualHashes(
        (await decodeBackup(await exportStoredPlay(db, localWorldId, 'manual'))).world,
      ),
      expected,
    );
  } finally {
    db.close();
    await db.delete();
  }
});
