import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import { createRookieDevelopmentDefinitions } from '../src/data/world/rookie-development.ts';
import { createAgeDevelopmentDefinitions } from '../src/data/world/age-development.ts';
import {
  createRookieDevelopmentWorld,
  createAgeDevelopmentWorld,
  advanceWorld,
  completeDay,
  worldPhase,
  validateDefinitions,
} from '../src/world/engine.ts';
import {
  isProfessionalRookie,
  applyRookieDevelopmentDay,
  rookieAwakeningChance,
  rookieAwakeningBudget,
} from '../src/world/awakening.ts';
import { growthBasis, growthAbilityKey } from '../src/world/growth-basis.ts';
import { growthView } from '../src/world/growth-view.ts';
import { validateWorld } from '../src/world/validation.ts';
import { createAwakeningHistoryCodec } from '../src/world/awakening-history-codec.ts';
import { WorldController } from '../src/world/controller.ts';
import { DexieWorldStorage, WorldDatabase } from '../src/world/dexie-storage.ts';
import { exportStoredPlay } from '../src/world/backup-storage.ts';
import { decodeBackup } from '../src/world/backup-package.ts';
import { canonicalJson, sha256 } from '../src/storage/codec.ts';
import type { WorldRecord } from '../src/world/types.ts';
import type { RookieAwakeningEvent } from '../src/world/awakening-types.ts';

type Current = ReturnType<typeof createRookieDevelopmentWorld>;
function ready<T extends WorldRecord>(w: T): T {
  while (worldPhase(w) === 'playing') w = advanceWorld(w, 25) as T;
  return w;
}
function finish<T extends WorldRecord>(w: T): T {
  w = ready(w);
  return completeDay(w, w.currentDate) as T;
}
function definitions(chance = 1000000) {
  const d = createRookieDevelopmentDefinitions();
  d.awakeningConfig!.opportunity = { basePpm: chance, ambitionPpm: 0 };
  return d;
}
const boundary = ready(createRookieDevelopmentWorld(31, undefined, definitions()));
const result = finish(boundary);
const day = result.growth.state.days[boundary.currentDate]!;
const events = day.awakening.filter((o): o is RookieAwakeningEvent => o.status === 'occurred');
const ids = Object.keys(result.growth.state.awakeningState.players).sort();
const first = ids[0]!;
const bytes = readFileSync(new URL('./fixtures/world-v18-in-progress.json.gz', import.meta.url));

test('覚醒入力：新規v19/v24/v4の架空新人8人、旧プロフィールと旧v18は変更しない', () => {
  assert.equal(result.version, 'world-prototype-v19');
  assert.equal(result.definitions.version, 'world-definitions-v24');
  assert.equal(result.growth.version, 'daily-development-v4');
  assert.equal(ids.length, 8);
  assert.equal(
    createAgeDevelopmentDefinitions().playerProfiles!.players.filter((p) => p.firstProYear === 2026)
      .length,
    0,
  );
  validateWorld(result);
  const old = createAgeDevelopmentDefinitions();
  old.awakeningConfig = result.definitions.awakeningConfig;
  assert.throws(() => validateDefinitions(old));
});
test('係数検査：不足・未知・非整数・確率と成長量の境界を拒否する', () => {
  const config = createRookieDevelopmentDefinitions().awakeningConfig!;
  assert.equal(rookieAwakeningChance(config, 0), 500);
  assert.equal(rookieAwakeningChance(config, 120000), 1000);
  assert.equal(rookieAwakeningBudget(config, 0), 3000);
  assert.equal(rookieAwakeningBudget(config, 120000), 6000);
  for (const mutate of [
    (d: any) => delete d.awakeningConfig,
    (d: any) => (d.awakeningConfig.extra = 0),
    (d: any) => (d.awakeningConfig.version = 'unknown'),
    (d: any) => (d.awakeningConfig.enabled = 1),
    (d: any) => (d.awakeningConfig.opportunity.basePpm = -1),
    (d: any) => (d.awakeningConfig.opportunity.basePpm = 1000001),
    (d: any) => (d.awakeningConfig.opportunity.basePpm = 0.5),
    (d: any) => (d.awakeningConfig.amount.baseMilli = 0),
    (d: any) => (d.awakeningConfig.amount.talentMilli = 12001),
    (d: any) => (d.awakeningConfig.amount.extra = 0),
  ]) {
    const d = definitions();
    mutate(d);
    assert.throws(() => validateDefinitions(d));
  }
});
test('対象判定：年齢・日本初年度では判定せず、プロ入り年不明と年跨ぎを区別', () => {
  assert.equal(isProfessionalRookie(2026, '2026-01-01'), true);
  assert.equal(isProfessionalRookie(2026, '2026-12-31'), true);
  assert.equal(isProfessionalRookie(2026, '2027-01-01'), false);
  assert.equal(isProfessionalRookie(null, '2026-09-24'), false);
  const d = definitions();
  d.playerProfiles!.players.find((p) => p.playerId === first)!.firstProYear = null;
  const veteran = d.playerProfiles!.players.find((p) => !ids.includes(p.playerId))!;
  veteran.firstJapanSeasonId = 'season-2026';
  const w = createRookieDevelopmentWorld(31, undefined, d);
  assert.equal(Object.hasOwn(w.growth.state.awakeningState.players, first), false);
  assert.equal(Object.hasOwn(w.growth.state.awakeningState.players, veteran.playerId), false);
});
test('実反映：全球団・一二軍に同じ条件、1能力だけ増加し初期値/上限/固定特性を変更しない', () => {
  assert.equal(events.length, 8);
  assert.equal(new Set(events.map((e) => e.playerId)).size, 8);
  for (const e of events) {
    const changes = day.changes.filter(
      (c) => c.reason === 'rookieAwakening' && c.playerId === e.playerId,
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0]!.sourceEventId, e.eventId);
    const a = growthBasis(result.definitions, e.playerId).find(
      (a) => a.key === growthAbilityKey(e.abilityRef),
    )!;
    assert.ok(e.afterValue > e.beforeValue && e.afterValue <= a.ceilingMilli);
    assert.equal(
      e.afterValue - e.beforeValue,
      Math.min(e.budgetMilli, a.ceilingMilli - e.beforeValue),
    );
    assert.equal(result.growth.state.players[e.playerId]!.values[a.key], e.afterValue);
  }
  assert.equal(
    events.filter((e) =>
      ['player-a-24', 'player-h-24', 'kohaku-player-a-23', 'asagiri-player-h-23'].includes(
        e.playerId,
      ),
    ).length,
    4,
  );
  assert.deepEqual(result.definitions, boundary.definitions);
});
test('独立乱数：初日の試合/通常練習/経験/年齢端数は従来v18と一致する', () => {
  const old = finish(createAgeDevelopmentWorld(31));
  assert.deepEqual(result.games, old.games);
  assert.deepEqual(day.outcomes, old.growth.state.days[day.date]!.outcomes);
  assert.deepEqual(day.experience, old.growth.state.days[day.date]!.experience);
  assert.deepEqual(result.growth.state.experienceRng, old.growth.state.experienceRng);
  assert.deepEqual(result.growth.state.agingRemainders, old.growth.state.agingRemainders);
  for (const id of Object.keys(result.growth.state.players))
    assert.deepEqual(result.growth.state.players[id]!.rng, old.growth.state.players[id]!.rng);
});
test('不成立/無効：確率0も正規に抽選し、無効化は値と覚醒乱数を進めない', () => {
  const missed = finish(createRookieDevelopmentWorld(31, undefined, definitions(0)));
  assert.ok(missed.growth.state.days[day.date]!.awakening.every((o) => o.status === 'missed'));
  for (const p of Object.values(missed.growth.state.awakeningState.players))
    assert.equal(p.rng.drawCount, 2);
  const d = definitions();
  d.awakeningConfig!.enabled = false;
  const source = createRookieDevelopmentWorld(31, undefined, d),
    disabled = finish(source);
  assert.deepEqual(disabled.growth.state.awakeningState, source.growth.state.awakeningState);
  const old = finish(createAgeDevelopmentWorld(31));
  assert.deepEqual(disabled.growth.state.players, old.growth.state.players);
  assert.equal(disabled.growth.state.days[day.date]!.awakening.length, 0);
});
test('上限境界：余地なしは抽選せず、1内部値の余地へ超過分を貯め込まない', () => {
  const d = definitions();
  d.growthConfig!.enabled = false;
  d.experienceConfig!.enabled = false;
  d.ageConfig!.enabled = false;
  const w = ready(createRookieDevelopmentWorld(31, undefined, d));
  const basis = growthBasis(w.definitions, first);
  for (const a of basis) w.growth.state.players[first]!.values[a.key] = a.ceilingMilli;
  const noRoom = applyRookieDevelopmentDay(w);
  assert.equal(
    noRoom.growth.state.days[day.date]!.awakening.find((o) => o.playerId === first)!.status,
    'noRoom',
  );
  assert.equal(noRoom.growth.state.awakeningState.players[first]!.rng.drawCount, 0);
  const a = basis[0]!;
  w.growth.state.players[first]!.values[a.key] = a.ceilingMilli - 1;
  const gained = applyRookieDevelopmentDay(w);
  assert.equal(gained.growth.state.players[first]!.values[a.key], a.ceilingMilli);
  const e = gained.growth.state.days[day.date]!.awakening.find(
    (o) => o.playerId === first,
  ) as RookieAwakeningEvent;
  assert.equal(e.afterValue - e.beforeValue, 1);
  assert.ok(e.budgetMilli > 1);
});
test('適用済み：翌日は重複せず、休養・未出場も同じ機会とし閲覧で抽選しない', () => {
  const next = finish(result);
  assert.equal(next.growth.state.days[result.currentDate]!.awakening.length, 0);
  for (const id of ids) {
    assert.equal(next.growth.state.awakeningState.players[id]!.rng.drawCount, 2);
    assert.equal(next.growth.state.awakeningState.players[id]!.appliedOn, day.date);
  }
  assert.throws(() => completeDay(result, day.date));
  const nextBefore = canonicalJson(next);
  const view = growthView(next)!;
  assert.equal(view.rookieAwakening!.events.length, 8);
  const count = view.rookieAwakening!.events.length;
  view.rookieAwakening!.events[0]!.afterValue++;
  assert.equal(growthView(result)!.rookieAwakening!.events.length, count);
  assert.equal(result.growth.state.days[day.date]!.awakening[0]!.status, 'occurred');
  assert.equal(canonicalJson(next), nextBefore);
});
test('保存v020：実DB/バックアップ/翌日を復元し、適用済み/乱数/期間/能力履歴の改変を拒否', async () => {
  const db = new WorldDatabase('rookie-save');
  try {
    const s = new DexieWorldStorage(db);
    await s.save(result, 1, 'manual', 0);
    assert.equal(
      (await db.save_snapshots.toArray())[0]!.versions.saveFormatVersion,
      'v020-world-snapshot-v19',
    );
    const loaded = (await s.load('manual')).world;
    assert.deepEqual(loaded, result);
    assert.deepEqual(
      (await decodeBackup(await exportStoredPlay(db, s.localWorldId, 'manual'))).world,
      result,
    );
    assert.deepEqual(finish(loaded), finish(result));
    for (const mutate of [
      (w: any) => (w.growth.state.awakeningState.players[first].appliedEventId = null),
      (w: any) => w.growth.state.awakeningState.players[first].rng.fullState.word++,
      (w: any) => (w.growth.state.awakeningState.players[first].eligibleThrough = '2027-01-01'),
      (w: any) => w.growth.state.days[day.date].awakening.pop(),
      (w: any) =>
        w.growth.state.days[day.date].changes.find((c: any) => c.reason === 'rookieAwakening')
          .afterValue++,
    ]) {
      const broken = structuredClone(result);
      mutate(broken);
      assert.throws(() => validateWorld(broken));
    }
  } finally {
    db.close();
    await db.delete();
  }
});
test('日次失敗・再送：覚醒と抽選を公開せず、再試行は同じ8件を一回だけ確定', async () => {
  const db = new WorldDatabase('rookie-retry');
  try {
    const s = new DexieWorldStorage(db);
    const slots = await s.save(boundary, 1, 'manual', 0);
    const c = WorldController.fromCommitted(s, s.localWorldId, 1, boundary, slots),
      before = c.query();
    const command = {
      kind: 'completeDay' as const,
      date: before.currentDate,
      commandId: 'rookie-retry',
      localWorldId: before.localWorldId,
      expectedStateRevision: before.revision,
    };
    const save = s.save.bind(s);
    s.save = async () => {
      throw Error('保存失敗の試験');
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
test('固定v18：0.41.0の実保存/復元/続行を行い、変更前の終了ハッシュに一致する', async () => {
  const hash = (v: string | Uint8Array) => createHash('sha256').update(v).digest('hex');
  assert.equal(hash(bytes), '7d706e6c27fdb3307a5aad9902ffbfe1c2ac503664ee0d9da00f2dc0e68242f4');
  const old = JSON.parse(gunzipSync(bytes).toString('utf8')) as WorldRecord;
  assert.equal(
    hash(canonicalJson(old)),
    '5e43e8cf65ff531b725211ddff407a9c11fa262b5ca68f4dc55454e6b2dc82e8',
  );
  const db = new WorldDatabase('rookie-old-v18');
  try {
    const s = new DexieWorldStorage(db);
    await s.save(old, 1, 'manual', 0);
    const loaded = (await s.load('manual')).world;
    assert.deepEqual(loaded, old);
    assert.equal(growthView(loaded)!.rookieAwakening, undefined);
    assert.equal(
      hash(canonicalJson(finish(loaded))),
      '976068daf1fd36fedddc11ae07eaff40ee338b1082948209e9e8f2289cb0ec2e',
    );
    assert.deepEqual(
      (await decodeBackup(await exportStoredPlay(db, s.localWorldId, 'manual'))).world,
      old,
    );
    assert.equal(
      (await db.save_snapshots.toArray())[0]!.versions.saveFormatVersion,
      'v019-world-snapshot-v18',
    );
  } finally {
    db.close();
    await db.delete();
  }
});
test('履歴表現：年齢の圧縮と覚醒の詳細を順序も含め完全復元し、混在と未知形式を拒否', () => {
  const codec = createAwakeningHistoryCodec(result.definitions),
    wire = codec.encode(day);
  assert.deepEqual(codec.decode(JSON.parse(canonicalJson(wire))), day);
  assert.equal(codec.encode(day), wire);
  for (const mutate of [
    (w: any) => (w.historySchema = 'unknown'),
    (w: any) => (w.awakeningChanges[0].reason = 'aging'),
    (w: any) => (w.extra = 0),
  ]) {
    const bad = structuredClone(wire);
    mutate(bad);
    assert.throws(() => codec.decode(bad));
  }
});
test('参照順：JSONのキー順を変えても同じ日次結果になり、閲覧は正本を変えない', async () => {
  const a = definitions(),
    b = JSON.parse(canonicalJson(a));
  assert.deepEqual(
    finish(createRookieDevelopmentWorld(31, undefined, a)),
    finish(createRookieDevelopmentWorld(31, undefined, b)),
  );
  const before = await sha256(canonicalJson(result));
  growthView(result);
  assert.equal(await sha256(canonicalJson(result)), before);
});
async function hashes(w: WorldRecord) {
  assert.ok('growth' in w);
  const { games, growth, ...core } = w;
  const { days, ...state } = growth.state;
  const gameHashes: Record<string, string> = {},
    dayHashes: Record<string, string> = {};
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
test('[annual-rookie] 覚醒付き年間：188日216試合、発生の一意性・上限・v020の完全保存復元', async () => {
  let w: Current | null = createRookieDevelopmentWorld(
    20260924,
    undefined,
    createRookieDevelopmentDefinitions('annual'),
  );
  while (worldPhase(w) !== 'scheduleComplete') {
    w = finish(w);
    if (w.completedDates.length % 30 === 0) {
      console.log(`覚醒の年間検証：${w.completedDates.length} / 188日`);
      await setImmediate();
    }
  }
  assert.equal(w.completedDates.length, 188);
  assert.equal(Object.keys(w.games).length, 216);
  const all = growthView(w)!.rookieAwakening!.events;
  assert.equal(new Set(all.map((e) => e.playerId)).size, all.length);
  assert.ok(all.length <= 8);
  for (const id of Object.keys(w.growth.state.players))
    for (const a of growthBasis(w.definitions, id))
      assert.ok(w.growth.state.players[id]!.values[a.key]! <= a.ceilingMilli);
  const expected = await hashes(w);
  const db = new WorldDatabase('rookie-annual');
  try {
    const save = async (world: Current) => {
      const s = new DexieWorldStorage(db);
      await s.save(world, 1, 'manual', 0);
      return s.localWorldId;
    };
    console.log('覚醒の年間検証：完走、保存');
    const local = await save(w);
    w = null;
    const snap = (await db.save_snapshots.toArray())[0]!;
    console.log(
      '覚醒の保存容量（展開bytes）:',
      snap.blockRefs.reduce((n, r) => n + r.rawBytes, 0),
    );
    assert.equal(snap.blockRefs.length, 407);
    assert.ok(snap.blockRefs.every((r) => r.rawBytes <= 16 * 1024 * 1024));
    assert.ok(snap.blockRefs.reduce((n, r) => n + r.rawBytes, 0) <= 512 * 1024 * 1024);
    console.log('覚醒の年間検証：DB復元');
    assert.deepEqual(
      await hashes((await new DexieWorldStorage(db).load('manual')).world),
      expected,
    );
    console.log('覚醒の年間検証：バックアップ復元');
    assert.deepEqual(
      await hashes((await decodeBackup(await exportStoredPlay(db, local, 'manual'))).world),
      expected,
    );
  } finally {
    db.close();
    await db.delete();
  }
});
