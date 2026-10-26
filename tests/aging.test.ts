import { encodeAgeDay, decodeAgeDay } from '../src/world/age-history-codec.ts';
import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import { AGE_CONFIG } from '../config/aging.ts';
import { createAgeDevelopmentDefinitions } from '../src/data/world/age-development.ts';
import { createDevelopmentDefinitions } from '../src/data/world/development.ts';
import {
  createAgeDevelopmentWorld,
  createDevelopmentWorld,
  advanceWorld,
  completeDay,
  worldPhase,
  validateDefinitions,
  createScheduledGame,
} from '../src/world/engine.ts';
import {
  ageAtMilli,
  ageAnnualRate,
  ageDailyChange,
  ageAbilityGroup,
  AGE_YEAR_DENOMINATOR,
} from '../src/world/aging.ts';
import { growthBasis, growthAbilityKey } from '../src/world/growth-basis.ts';
import { commonTrainingRef } from '../src/world/training.ts';
import { growthView, growthComparison } from '../src/world/growth-view.ts';
import { seasonGrowthReport } from '../src/world/season-growth.ts';
import { validateWorld } from '../src/world/validation.ts';
import { WorldController } from '../src/world/controller.ts';
import { DexieWorldStorage, WorldDatabase } from '../src/world/dexie-storage.ts';
import { decodeBackup } from '../src/world/backup-package.ts';
import { exportStoredPlay } from '../src/world/backup-storage.ts';
import { canonicalJson, sha256 } from '../src/storage/codec.ts';
import type { WorldRecord } from '../src/world/types.ts';
import type { AgeCurve } from '../src/world/age-types.ts';

type Current = ReturnType<typeof createAgeDevelopmentWorld>;
function ready<T extends WorldRecord>(w: T): T {
  while (worldPhase(w) === 'playing') w = advanceWorld(w, 25) as T;
  return w;
}
function finish<T extends WorldRecord>(w: T): T {
  w = ready(w);
  return completeDay(w, w.currentDate) as T;
}
const boundary = ready(createAgeDevelopmentWorld(31));
const result = completeDay(boundary, boundary.currentDate) as Current;
const day = result.growth.state.days[boundary.currentDate]!;
const firstId = boundary.definitions.squads[0]!.players[0]!.playerId;
const oldBytes = readFileSync(new URL('./fixtures/world-v17-in-progress.json.gz', import.meta.url));
const curve: AgeCurve = {
  growthStartAgeMilli: 16000,
  growthPeakAgeMilli: 21000,
  growthEndAgeMilli: 26000,
  declineStartAgeMilli: 30000,
  growthPermille: 1000,
  declinePermille: 1000,
};

test('年齢変化：新規v18/v23/v3の120人を保持し、旧v22へ後付けしない', () => {
  assert.equal(result.version, 'world-prototype-v18');
  assert.equal(result.definitions.version, 'world-definitions-v23');
  assert.equal(result.growth.version, 'daily-development-v3');
  assert.equal(result.definitions.ageCurves!.players.length, 120);
  assert.equal(Object.keys(result.growth.state.agingRemainders).length, 120);
  validateWorld(result);
  const old = createDevelopmentDefinitions();
  old.ageConfig = AGE_CONFIG;
  assert.throws(() => validateDefinitions(old));
});

test('年齢変化入力：曲線・対応表・係数・選手の過不足と順序を拒否する', () => {
  for (const mutate of [
    (d: any) => delete d.ageConfig,
    (d: any) => (d.ageConfig.extra = 0),
    (d: any) => (d.ageConfig.groups.physical.growthMilliPerYear = 1.2),
    (d: any) => (d.ageConfig.groups.technique.declineRampAgeMilli = 0),
    (d: any) => delete d.ageConfig.abilityGroups['running.speed'],
    (d: any) => (d.ageConfig.pitchGroups.control = 'unknown'),
    (d: any) => d.ageCurves.players.pop(),
    (d: any) => (d.ageCurves.players[0] = d.ageCurves.players[1]),
    (d: any) => delete d.ageCurves.players[0].ageCurves.judgment,
    (d: any) => (d.ageCurves.players[0].ageCurves.physical.growthPeakAgeMilli = 0),
    (d: any) => (d.ageCurves.players[0].ageCurves.technique.declineStartAgeMilli = 1),
    (d: any) => (d.ageCurves.players[0].ageCurves.technique.declinePermille = 2001),
    (d: any) => delete d.playerProfiles.players[0].birthDate,
  ]) {
    const d = structuredClone(boundary.definitions);
    mutate(d);
    assert.throws(() => validateDefinitions(d));
  }
});

test('年齢導出：誕生日・うるう日・年末もゲーム日付のみから連続して導出する', () => {
  assert.equal(ageAtMilli('2000-10-22', '2026-10-22'), 26000);
  assert.equal(ageAtMilli('2000-10-22', '2026-10-21'), 25997);
  assert.equal(ageAtMilli('2000-02-29', '2025-03-01'), 25000);
  assert.ok(ageAtMilli('2000-02-29', '2025-02-28') < 25000);
  assert.equal(ageAtMilli('2000-02-29', '2024-02-29'), 24000);
  assert.ok(ageAtMilli('2000-02-29', '2024-03-01') > 24000);
  assert.ok(ageAtMilli('2000-07-01', '2027-01-01') > ageAtMilli('2000-07-01', '2026-12-31'));
  assert.throws(() => ageAtMilli('2000-02-30', '2026-10-22'));
  assert.throws(() => ageAtMilli('2030-01-01', '2026-10-22'));
});

test('年齢曲線：成長期・全盛期・衰退期と個人差を区別し、才能0にも基礎の伸びを残す', () => {
  const c = AGE_CONFIG;
  assert.equal(ageAnnualRate(c, curve, 'physical', 16000, 0), 0);
  assert.equal(ageAnnualRate(c, curve, 'physical', 21000, 0), 900);
  assert.equal(ageAnnualRate(c, curve, 'physical', 21000, 120000), 1800);
  assert.equal(ageAnnualRate(c, curve, 'physical', 26000, 120000), 0);
  assert.equal(ageAnnualRate(c, curve, 'physical', 30000, 120000), 0);
  assert.equal(ageAnnualRate(c, curve, 'physical', 32500, 120000), -1200);
  assert.equal(ageAnnualRate(c, curve, 'physical', 35000, 0), -2400);
  assert.equal(ageAnnualRate(c, curve, 'physical', 80000, 120000), -2400);
  assert.equal(ageAnnualRate(c, { ...curve, declinePermille: 500 }, 'physical', 35000, 0), -1200);
  assert.equal(
    ageAnnualRate(
      c,
      { ...curve, growthPeakAgeMilli: 23000, growthEndAgeMilli: 28000 },
      'physical',
      26000,
      0,
    ),
    360,
  );
  assert.equal(ageAnnualRate({ ...c, enabled: false }, curve, 'physical', 21000, 120000), 0);
});

test('能力群の対応：全共通能力・守備習熟・本人の持ち球を一意に分類する', () => {
  const groups = new Set<string>();
  for (const a of growthBasis(boundary.definitions, firstId))
    groups.add(ageAbilityGroup(AGE_CONFIG, a.abilityRef));
  assert.deepEqual([...groups].sort(), ['judgment', 'physical', 'technique']);
  assert.equal(ageAbilityGroup(AGE_CONFIG, commonTrainingRef('running.speed')), 'physical');
  assert.equal(
    ageAbilityGroup(AGE_CONFIG, commonTrainingRef('batting.plateDiscipline')),
    'judgment',
  );
  assert.equal(
    ageAbilityGroup(AGE_CONFIG, { scope: 'position', positionCode: 'P', code: 'familiarity' }),
    'technique',
  );
});

test('日次端数：1内部値未満の増減も蓄積し、保存して分割した日数でも一致する', () => {
  function run(rate: number, days: number, value = 60000, remainder = 0) {
    for (let i = 0; i < days; i++) {
      const next = ageDailyChange(value, 120000, rate, remainder);
      value = next.after;
      remainder = next.remainder;
      assert.ok(Math.abs(remainder) < AGE_YEAR_DENOMINATOR);
    }
    return { value, remainder };
  }
  const first = run(10, 100);
  assert.ok(first.value > 60000);
  const restored = JSON.parse(JSON.stringify(first));
  assert.deepEqual(run(10, 265, restored.value, restored.remainder), run(10, 365));
  assert.equal(run(10, 365).value, 60009);
  assert.equal(run(-10, 365).value, 59991);
});

test('成長上限・下限：超過分と端数を貯め込まず、反対方向への変化を許す', () => {
  assert.deepEqual(ageDailyChange(59999, 60000, 12000, 3000000), { after: 60000, remainder: 0 });
  assert.deepEqual(ageDailyChange(1, 60000, -12000, -3000000), { after: 0, remainder: 0 });
  assert.ok(ageDailyChange(60000, 60000, -12000, 0).after < 60000);
  assert.ok(ageDailyChange(0, 60000, 12000, 0).after > 0);
  assert.deepEqual(ageDailyChange(60000, 120000, 0, 3000000), { after: 60000, remainder: 0 });
});

test('日次境界：全球団・一二軍・ベンチを同条件で処理し、練習/経験の後に履歴へ追加する', () => {
  assert.equal(day.aging.length, 120);
  assert.equal(new Set(day.aging.map((r) => r.playerId)).size, 120);
  assert.ok(day.changes.some((c) => c.reason === 'aging' && c.afterValue > c.beforeValue));
  assert.ok(day.changes.some((c) => c.reason === 'aging' && c.afterValue < c.beforeValue));
  assert.ok(
    day.changes.findIndex((c) => c.reason === 'aging') >
      day.changes.reduce((last, c, index) => (c.reason === 'experience' ? index : last), -1),
  );
  assert.ok(day.changes.every((c, index) => c.eventOrder === index + 1));
  for (const row of day.aging) {
    const changes = day.changes.filter((c) => c.reason === 'aging' && c.playerId === row.playerId);
    assert.equal(
      row.groups.reduce((sum, g) => sum + g.increaseMilli + g.decreaseMilli, 0),
      changes.reduce((sum, c) => sum + c.afterValue - c.beforeValue, 0),
    );
    const basis = growthBasis(result.definitions, row.playerId);
    const comparison = growthComparison(
      result.definitions,
      row.playerId,
      boundary.growth.state.players[row.playerId]!.values,
      result.growth.state.players[row.playerId]!.values,
    );
    assert.equal(day.displayDeltas[row.playerId], comparison.net);
    for (const a of basis)
      assert.ok(
        result.growth.state.players[row.playerId]!.values[a.key]! >= 0 &&
          result.growth.state.players[row.playerId]!.values[a.key]! <= a.ceilingMilli,
      );
  }
  assert.equal(growthView(result)!.latest!.aging!.length, 120);
  assert.throws(() => completeDay(result, boundary.currentDate));
});

test('試合と乱数：初日の試合・通常練習・経験の抽選は旧v17と同じで、年齢変化が追加乱数を使わない', () => {
  const old = finish(createDevelopmentWorld(31));
  assert.deepEqual(result.games, old.games);
  const previous = old.growth.state.days[day.date]!;
  assert.deepEqual(day.outcomes, previous.outcomes);
  assert.deepEqual(day.experience, previous.experience);
  for (const id of Object.keys(result.growth.state.players)) {
    assert.deepEqual(result.growth.state.players[id]!.rng, old.growth.state.players[id]!.rng);
    assert.deepEqual(result.growth.state.experienceRng[id], old.growth.state.experienceRng[id]);
  }
  assert.deepEqual(boundary.definitions.playerDevelopment, result.definitions.playerDevelopment);
});

test('休養・試合なし・無効化：年齢変化は練習と独立し、無効時は値/端数を進めない', () => {
  const d = createAgeDevelopmentDefinitions();
  for (const p of d.trainingPlans!.players) p.settings.intensity = 'rest';
  d.experienceConfig!.enabled = false;
  d.endDate = '2026-09-28';
  let w = createAgeDevelopmentWorld(31, undefined, d);
  while (w.currentDate < '2026-09-28') w = finish(w);
  assert.equal(w.dayPlan.gameIds.length, 0);
  const next = finish(w);
  const idle = next.growth.state.days[w.currentDate]!;
  assert.equal(idle.aging.length, 120);
  assert.equal(idle.experience.length, 0);
  assert.ok(idle.outcomes.every((o) => o.effectiveIntensity === 'rest'));
  assert.ok(idle.changes.some((c) => c.reason === 'aging'));
  const off = createAgeDevelopmentDefinitions();
  off.ageConfig!.enabled = false;
  const disabled = finish(createAgeDevelopmentWorld(31, undefined, off));
  assert.ok(disabled.growth.state.days[day.date]!.changes.every((c) => c.reason !== 'aging'));
  assert.ok(
    Object.values(disabled.growth.state.agingRemainders).every((v) =>
      Object.values(v).every((n) => n === 0),
    ),
  );
});

test('保存・バックアップ：曲線・現在値・端数・履歴を復元し、改変した保存は拒否する', async () => {
  const db = new WorldDatabase('aging-save');
  try {
    const s = new DexieWorldStorage(db);
    await s.save(result, 1, 'manual', 0);
    assert.equal(
      (await db.save_snapshots.toArray())[0]!.versions.saveFormatVersion,
      'v019-world-snapshot-v18',
    );
    const restored = (await s.load('manual')).world;
    assert.deepEqual(restored, result);
    assert.deepEqual(
      (await decodeBackup(await exportStoredPlay(db, s.localWorldId, 'manual'))).world,
      result,
    );
    assert.deepEqual(finish(restored), finish(result));
    const key = growthBasis(result.definitions, firstId)[0]!.key;
    for (const mutate of [
      (w: any) => w.growth.state.agingRemainders[firstId][key]++,
      (w: any) => w.growth.state.days[day.date].aging[0].groups[0].increaseMilli++,
      (w: any) =>
        w.growth.state.days[day.date].changes.find((c: any) => c.reason === 'aging').afterValue++,
      (w: any) => w.growth.state.days[day.date].aging.pop(),
    ]) {
      const broken = structuredClone(result);
      mutate(broken);
      assert.throws(() => validateWorld(broken));
    }
    const broken = structuredClone(result);
    broken.growth.state.days[day.date]!.aging.pop();
    await assert.rejects(s.save(broken, 2, 'manual', 1));
    assert.deepEqual((await s.load('manual')).world, result);
  } finally {
    db.close();
    await db.delete();
  }
});

test('日次保存の失敗・再送：年齢変化と端数を公開せず、一度だけ確定する', async () => {
  const db = new WorldDatabase('aging-retry');
  try {
    const s = new DexieWorldStorage(db);
    const slots = await s.save(boundary, 1, 'manual', 0);
    const c = WorldController.fromCommitted(s, s.localWorldId, 1, boundary, slots);
    const before = c.query();
    const command = {
      kind: 'completeDay' as const,
      date: before.currentDate,
      commandId: 'aging-retry',
      localWorldId: before.localWorldId,
      expectedStateRevision: before.revision,
    };
    const save = s.save.bind(s);
    s.save = async () => {
      throw Error('失敗の試験');
    };
    await assert.rejects(c.dispatch(command));
    assert.deepEqual({ ...c.query(), storageError: before.storageError }, before);
    s.save = save;
    const after = await c.dispatch(command);
    assert.deepEqual(await c.dispatch(command), after);
    assert.deepEqual((await s.load('auto')).world, result);
  } finally {
    db.close();
    await db.delete();
  }
});

test('固定v17検体：旧保存の実復元・続行を行い、変更前の1日終了ハッシュと一致する', async () => {
  assert.equal(
    createHash('sha256').update(oldBytes).digest('hex'),
    '4f6ebc395545e87f3c3f68d82b1e953188a1fbd4d6ba768f0423a7064b8e79e3',
  );
  const old = JSON.parse(gunzipSync(oldBytes).toString('utf8')) as WorldRecord;
  assert.equal(
    await sha256(canonicalJson(old)),
    '060b02af676e0f690a87239293487136eb96cdce757862d17cc5c0d16d684eef',
  );
  const db = new WorldDatabase('aging-old-v17');
  try {
    const s = new DexieWorldStorage(db);
    await s.save(old, 1, 'manual', 0);
    const restored = (await s.load('manual')).world;
    assert.deepEqual(restored, old);
    assert.equal(growthView(restored)!.latest?.aging, undefined);
    const finished = finish(restored);
    assert.equal(
      await sha256(canonicalJson(finished)),
      'b26aae8f960576a418f259e491de0477f03055e35751d0e9ef75fcc333ae6727',
    );
    assert.equal(
      (await db.save_snapshots.toArray())[0]!.versions.saveFormatVersion,
      'v018-world-snapshot-v17',
    );
    assert.deepEqual(
      (await decodeBackup(await exportStoredPlay(db, s.localWorldId, 'manual'))).world,
      old,
    );
  } finally {
    db.close();
    await db.delete();
  }
});

test('JSON順と次試合：保存した現在値が次の入力へ入り、閲覧で正本を変更しない', async () => {
  const a = createAgeDevelopmentDefinitions();
  const b = JSON.parse(canonicalJson(a));
  assert.deepEqual(
    finish(createAgeDevelopmentWorld(31, undefined, a)),
    finish(createAgeDevelopmentWorld(31, undefined, b)),
  );
  const before = await sha256(canonicalJson(result));
  growthView(result);
  seasonGrowthReport(result, 'firstRegular');
  assert.equal(await sha256(canonicalJson(result)), before);
  const g = createScheduledGame(result, result.dayPlan.gameIds[0]!);
  const p = g.fixture.players[0]!;
  const key = growthAbilityKey(commonTrainingRef('running.speed'));
  assert.equal(p.runningSpeed.valueMilli, result.growth.state.players[p.playerId]!.values[key]);
});

async function hashes(w: WorldRecord) {
  assert.ok('growth' in w);
  const { games, growth, ...core } = w;
  const gamesHash: Record<string, string> = {};
  for (const id of Object.keys(games).sort())
    gamesHash[id] = await sha256(canonicalJson(games[id]));
  const { days, ...growthState } = growth.state;
  const dayHashes: Record<string, string> = {};
  for (const date of Object.keys(days).sort())
    dayHashes[date] = await sha256(canonicalJson(days[date]));
  return {
    core: await sha256(canonicalJson(core)),
    growth: await sha256(canonicalJson({ ...growth, state: growthState })),
    days: dayHashes,
    games: gamesHash,
  };
}

test('v019履歴表現：冗長な年齢変更を参照へ置換し、全詳細を損失なく戻して不正参照を拒否する', () => {
  const wire = encodeAgeDay(day, result.definitions);
  assert.deepEqual(decodeAgeDay(JSON.parse(canonicalJson(wire)), result.definitions), day);
  assert.ok(canonicalJson(wire).length < canonicalJson(day).length * 0.75);
  assert.equal(encodeAgeDay(day, result.definitions), wire);
  for (const mutate of [
    (w: any) => w.agingChanges[0].push(0),
    (w: any) => (w.agingChanges[0][0] = 999999),
    (w: any) => (w.agingChanges[0][1] = -1),
    (w: any) => (w.agingChanges[0][2] = 120001),
    (w: any) => (w.historySchema = 'unknown'),
  ]) {
    const broken = structuredClone(wire);
    mutate(broken);
    assert.throws(() => decodeAgeDay(broken, result.definitions));
  }
});

test('[annual-aging] 年齢変化付き年間：188日216試合、総括とv019保存/読込/バックアップの完全復元', async () => {
  let w: Current | null = createAgeDevelopmentWorld(
    20260924,
    undefined,
    createAgeDevelopmentDefinitions('annual'),
  );
  while (worldPhase(w) !== 'scheduleComplete') {
    w = finish(w);
    if (w.completedDates.length % 30 === 0) {
      console.log(`年齢変化の年間検証：${w.completedDates.length} / 188日`);
      await setImmediate();
    }
  }
  assert.equal(w.completedDates.length, 188);
  assert.equal(Object.keys(w.games).length, 216);
  assert.equal(Object.keys(w.growth.state.days).length, 188);
  assert.equal(seasonGrowthReport(w, 'firstRegular')!.rows.length, 120);
  assert.ok(Object.values(w.growth.state.days).every((d) => d.aging.length === 120));
  const db = new WorldDatabase('aging-annual');
  try {
    const expected = await hashes(w);
    const save = async (world: Current) => {
      const s = new DexieWorldStorage(db);
      await s.save(world, 1, 'manual', 0);
      return s.localWorldId;
    };
    console.log('年齢変化の年間検証：完走、全区画のハッシュ照合基準を作成、保存');
    const localWorldId = await save(w);
    w = null;
    const snapshot = (await db.save_snapshots.toArray())[0]!;
    console.log(
      '年齢変化の保存容量（展開bytes）:',
      snapshot.blockRefs.reduce((sum, r) => sum + r.rawBytes, 0),
    );
    assert.equal(snapshot.blockRefs.length, 407);
    assert.ok(snapshot.blockRefs.every((r) => r.rawBytes <= 16 * 1024 * 1024));
    assert.ok(snapshot.blockRefs.reduce((sum, r) => sum + r.rawBytes, 0) <= 512 * 1024 * 1024);
    console.log('年齢変化の年間検証：DB復元');
    assert.deepEqual(
      await hashes((await new DexieWorldStorage(db).load('manual')).world),
      expected,
    );
    console.log('年齢変化の年間検証：バックアップ復元');
    assert.deepEqual(
      await hashes((await decodeBackup(await exportStoredPlay(db, localWorldId, 'manual'))).world),
      expected,
    );
  } finally {
    db.close();
    await db.delete();
  }
});
