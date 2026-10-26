import { trainingTargetAbilities } from '../src/world/training.ts';
import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import { createCampDevelopmentDefinitions } from '../src/data/world/camp-development.ts';
import { createRookieDevelopmentDefinitions } from '../src/data/world/rookie-development.ts';
import {
  createCampDevelopmentWorld,
  advanceWorld,
  completeDay,
  worldPhase,
  validateDefinitions,
} from '../src/world/engine.ts';
import {
  applyCampDevelopmentDay,
  applyCampPlans,
  campBurstChance,
  campBurstBudget,
} from '../src/world/camp.ts';
import { applyManagement } from '../src/world/management.ts';
import { calculateTrainingDay } from '../src/world/growth.ts';
import { growthBasis, growthAbilityKey } from '../src/world/growth-basis.ts';
import { growthView } from '../src/world/growth-view.ts';
import { validateWorld } from '../src/world/validation.ts';
import { createCampHistoryCodec } from '../src/world/camp-history-codec.ts';
import { WorldController } from '../src/world/controller.ts';
import { DexieWorldStorage, WorldDatabase } from '../src/world/dexie-storage.ts';
import { exportStoredPlay } from '../src/world/backup-storage.ts';
import { decodeBackup } from '../src/world/backup-package.ts';
import { canonicalJson, sha256 } from '../src/storage/codec.ts';
import type { WorldRecord } from '../src/world/types.ts';
import type { TrainingSettings } from '../src/world/training-types.ts';

type Current = ReturnType<typeof createCampDevelopmentWorld>;
function ready<T extends WorldRecord>(w: T): T {
  while (worldPhase(w) === 'playing') w = advanceWorld(w, 25) as T;
  return w;
}
function finish<T extends WorldRecord>(w: T): T {
  w = ready(w);
  return completeDay(w, w.currentDate) as T;
}
function definitions(chance = 1000000) {
  const d = createCampDevelopmentDefinitions();
  d.campConfig!.burst.basePpm = chance;
  d.campConfig!.burst.ambitionPpm = 0;
  return d;
}
function trainingOf(w: Current) {
  assert.equal(w.management.version, 'club-management-v2');
  assert.ok('training' in w.management);
  return w.management.training;
}
const start = createCampDevelopmentWorld(31, undefined, definitions());
const firstDay = finish(start);
const boundary = ready(firstDay);
const result = finish(boundary);
const campId = start.definitions.campInputs!.periods[0]!.campId;
const day = result.growth.state.days[boundary.currentDate]!;
const ids = Object.keys(start.growth.state.players).sort();
const own = start.definitions.squads[0]!;
const first = own.players[0]!.playerId,
  second = own.players[1]!.playerId;
const settings: TrainingSettings = {
  target: { kind: 'group', groupId: 'contact' },
  intensity: 'light',
  autoAdjustForFatigue: false,
};
const action = {
  kind: 'setCampPlans' as const,
  campId,
  squadId: own.squadId,
  updates: [
    { playerId: first, settings },
    { playerId: second, settings },
  ],
};

test('キャンプ入力：新規v20/v25/v5、全120人の別メニューと固定期間を検査', () => {
  assert.equal(start.version, 'world-prototype-v20');
  assert.equal(start.definitions.version, 'world-definitions-v25');
  assert.equal(start.growth.version, 'daily-development-v5');
  assert.equal(Object.keys(start.camp.plans[campId]!).length, 120);
  assert.deepEqual(firstDay.growth.state.days['2026-09-24']!.camp, null);
  validateWorld(result);
  const old = createRookieDevelopmentDefinitions();
  old.campConfig = start.definitions.campConfig;
  assert.throws(() => validateDefinitions(old));
});
test('キャンプ入力：欠落・未知項目・期間重複・不正日付・選手参照を拒否', () => {
  for (const mutate of [
    (d: any) => delete d.campConfig,
    (d: any) => (d.campConfig.extra = 0),
    (d: any) => (d.campConfig.focusAmountPermille = 3001),
    (d: any) => (d.campConfig.burst.basePpm = 0.5),
    (d: any) => (d.campConfig.burst.ambitionPpm = -1),
    (d: any) => (d.campConfig.burst.baseMilli = 0),
    (d: any) => (d.campConfig.burst.talentMilli = 24001),
    (d: any) => d.campInputs.periods.push(structuredClone(d.campInputs.periods[0])),
    (d: any) => (d.campInputs.periods[0].from = '2026-02-30'),
    (d: any) => (d.campInputs.periods[0].through = '2027-01-01'),
    (d: any) => (d.campInputs.periods[0].from = '2026-09-27'),
    (d: any) => d.campInputs.periods[0].players.pop(),
    (d: any) => (d.campInputs.periods[0].players[0].playerId = 'missing'),
    (d: any) =>
      (d.campInputs.periods[0].players[0].settings.target = { kind: 'group', groupId: 'missing' }),
  ]) {
    const d = definitions();
    mutate(d);
    assert.throws(() => validateDefinitions(d));
  }
  assert.equal(campBurstChance(start.definitions.campConfig!, 0), 1000000);
  assert.equal(campBurstBudget(start.definitions.campConfig!, 0), 6000);
  assert.equal(campBurstBudget(start.definitions.campConfig!, 120000), 12000);
});
test('編集：個別・一括指定は通常メニューを変えず、再送は一回だけ、他球団混入は原子的に拒否', () => {
  const before = canonicalJson(start);
  const edited = applyManagement(start, 'camp-edit', action) as Current;
  assert.equal(edited.camp.revision, 1);
  assert.deepEqual(trainingOf(edited), trainingOf(start));
  for (const id of [first, second])
    assert.deepEqual(
      {
        ...edited.camp.plans[campId]![id]!,
        playerId: undefined,
        planKind: undefined,
        effectiveFrom: undefined,
        effectiveUntil: undefined,
      },
      {
        ...settings,
        playerId: undefined,
        planKind: undefined,
        effectiveFrom: undefined,
        effectiveUntil: undefined,
      },
    );
  assert.equal(applyManagement(edited, 'camp-edit', action), edited);
  assert.throws(() =>
    applyManagement(start, 'camp-bad', {
      ...action,
      updates: [
        action.updates[0]!,
        { playerId: ids.find((id) => !own.players.some((p) => p.playerId === id))!, settings },
      ],
    }),
  );
  assert.throws(() => applyManagement(advanceWorld(start, 1), 'camp-started', action));
  assert.equal(canonicalJson(start), before);
  validateWorld(edited);
});
test('期間の両端：開始前は通常、開始日と終了日は専用、翌日は保存済みの通常に復帰', () => {
  const lastCamp = finish(result),
    after = finish(lastCamp);
  assert.equal(day.camp!.campId, campId);
  assert.equal(lastCamp.growth.state.days['2026-09-26']!.camp!.campId, campId);
  assert.equal(after.growth.state.days['2026-09-27']!.camp, null);
  for (const row of day.outcomes) assert.equal(row.campId, campId);
  for (const row of after.growth.state.days['2026-09-27']!.outcomes)
    assert.deepEqual(
      row.settings,
      trainingOf(start).plans[row.playerId] && {
        target: trainingOf(start).plans[row.playerId]!.target,
        intensity: trainingOf(start).plans[row.playerId]!.intensity,
        autoAdjustForFatigue: trainingOf(start).plans[row.playerId]!.autoAdjustForFatigue,
      },
    );
  assert.deepEqual(trainingOf(after), trainingOf(start));
  assert.throws(() => applyCampPlans(lastCamp, action));
});
test('指定対象だけ補正：同じ抽選と指定外配分を保ち、群全体の予算を対象数倍しない', () => {
  const base = { campId, focusAmountPermille: 1000, plans: boundary.camp.plans[campId]! };
  const a = calculateTrainingDay(boundary, base),
    b = calculateTrainingDay(boundary, { ...base, focusAmountPermille: 1500 });
  assert.deepEqual(a.physical, b.physical);
  let compared = 0;
  for (const id of ids) {
    assert.deepEqual(a.players[id]!.rng, b.players[id]!.rng);
    // 辞書から対象を求める。身体グループの数値名に依存しない。
    const target = boundary.definitions.trainingPlans!.catalog.groups.find(
      (g) => g.groupId === 'physical',
    )!;
    const refs = new Set(
      trainingTargetAbilities(boundary.definitions, id, {
        kind: 'group',
        groupId: target.groupId,
      }).map((a) => growthAbilityKey(a.abilityRef)),
    );
    const changesA = a.day.changes.filter((c) => c.playerId === id),
      changesB = b.day.changes.filter((c) => c.playerId === id);
    for (const ability of growthBasis(boundary.definitions, id))
      if (!refs.has(ability.key as any))
        assert.equal(a.players[id]!.values[ability.key], b.players[id]!.values[ability.key]);
    const oa = a.day.outcomes.find((o) => o.playerId === id)!,
      ob = b.day.outcomes.find((o) => o.playerId === id)!;
    assert.equal(oa.opportunityOccurred, ob.opportunityOccurred);
    if (oa.budgetMilli > 0) {
      compared++;
      const outside = Math.floor(
        (oa.budgetMilli * boundary.definitions.growthConfig!.budget.backgroundPermille) / 1000,
      );
      assert.equal(ob.budgetMilli, Math.round((oa.budgetMilli - outside) * 1.5) + outside);
    }
    assert.ok(
      changesA.every((c) => c.reason === 'campTraining') &&
        changesB.every((c) => c.reason === 'campTraining'),
    );
  }
  assert.ok(compared > 0);
});
test('爆発：全選手・一二軍で指定対象だけ増加、1人1キャンプ1抽選、翌日の再抽選なし', () => {
  assert.equal(day.camp!.outcomes.filter((o) => o.status === 'occurred').length, 120);
  const next = finish(result).growth.state;
  for (const id of ids) {
    const state = result.growth.state.campBursts[campId]![id]!;
    assert.equal(state.rng.drawCount, 1);
    assert.equal(state.checkedOn, boundary.currentDate);
    assert.ok(state.appliedEventId);
    assert.deepEqual(next.campBursts[campId]![id], state);
    const changes = day.changes.filter((c) => c.playerId === id && c.reason === 'campBurst');
    const selected = new Set(
      trainingTargetAbilities(boundary.definitions, id, { kind: 'group', groupId: 'physical' }).map(
        (a) => growthAbilityKey(a.abilityRef),
      ),
    );
    assert.ok(
      changes.length > 0 &&
        changes.every((c) => selected.has(growthAbilityKey(c.abilityRef) as any)),
    );
    const outcome = day.camp!.outcomes.find((o) => o.playerId === id)!;
    assert.equal(
      changes.reduce((n, c) => n + c.afterValue - c.beforeValue, 0),
      outcome.appliedMilli,
    );
    assert.ok(outcome.appliedMilli <= outcome.budgetMilli);
  }
  assert.deepEqual(result.definitions, start.definitions);
});
test('爆発なし・休養・伸び代なし：失敗は抽選済み、休養と上限は抽選を消費しない', () => {
  const missed = structuredClone(boundary);
  missed.definitions.campConfig!.burst.basePpm = 0;
  const m = applyCampDevelopmentDay(missed);
  assert.ok(
    m.growth.state.days[boundary.currentDate]!.camp!.outcomes.every((o) => o.status === 'missed'),
  );
  const resting = structuredClone(boundary);
  resting.camp.plans[campId]![first]!.intensity = 'rest';
  const r = applyCampDevelopmentDay(resting);
  assert.equal(r.growth.state.campBursts[campId]![first]!.rng.drawCount, 0);
  const full = structuredClone(boundary);
  for (const a of growthBasis(full.definitions, first))
    full.growth.state.players[first]!.values[a.key] = a.ceilingMilli;
  full.definitions.ageConfig!.enabled = false;
  const f = applyCampDevelopmentDay(full);
  assert.equal(f.growth.state.campBursts[campId]![first]!.rng.drawCount, 0);
  assert.equal(
    f.growth.state.days[boundary.currentDate]!.camp!.outcomes.find((o) => o.playerId === first)!
      .status,
    'noRoom',
  );
});
test('上限と独立期間：爆発の超過分を捨て、固定特性を変えず別キャンプの乱数を分離', () => {
  const w = structuredClone(boundary);
  w.definitions.growthConfig!.opportunity = { baseMilli: 0, ambitionMilli: 0 };
  w.definitions.experienceConfig!.enabled = false;
  w.definitions.ageConfig!.enabled = false;
  w.definitions.awakeningConfig!.enabled = false;
  const ability = growthBasis(w.definitions, first)[0]!;
  w.camp.plans[campId]![first]!.target = { kind: 'ability', abilityRef: ability.abilityRef };
  w.camp.plans[campId]![first]!.autoAdjustForFatigue = false;
  w.growth.state.players[first]!.values[ability.key] = ability.ceilingMilli - 1;
  const before = canonicalJson(w.definitions);
  const a = applyCampDevelopmentDay(w),
    outcome = a.growth.state.days[w.currentDate]!.camp!.outcomes.find((o) => o.playerId === first)!;
  assert.equal(outcome.status, 'occurred');
  assert.equal(outcome.appliedMilli, 1);
  assert.ok(outcome.budgetMilli > 1);
  assert.equal(a.growth.state.players[first]!.values[ability.key], ability.ceilingMilli);
  assert.equal(canonicalJson(w.definitions), before);
  const d = definitions();
  d.campInputs!.periods.push({
    ...structuredClone(d.campInputs!.periods[0]!),
    campId: 'camp-second',
    from: '2026-09-27',
    through: '2026-09-27',
  });
  const multiple = createCampDevelopmentWorld(31, undefined, d);
  assert.notDeepEqual(
    multiple.growth.state.campBursts[campId]![first]!.rng,
    multiple.growth.state.campBursts['camp-second']![first]!.rng,
  );
  assert.equal(multiple.growth.state.campBursts['camp-second']![first]!.checkedOn, null);
  // x-asagiri + player-h-01 と x + asagiri-player-h-01 の連結衝突を防ぐ。
  const collision = definitions();
  const p1 = collision.campInputs!.periods[0]!;
  p1.campId = 'x-asagiri';
  p1.from = '2026-09-25';
  p1.through = '2026-09-25';
  for (const row of p1.players) row.settings.autoAdjustForFatigue = false;
  collision.campInputs!.periods.push({
    ...structuredClone(p1),
    campId: 'x',
    from: '2026-09-26',
    through: '2026-09-26',
  });
  let unique = createCampDevelopmentWorld(31, undefined, collision);
  const streams = Object.values(unique.growth.state.campBursts).flatMap((c) =>
    Object.values(c).map((s) => s.rng.streamId),
  );
  assert.equal(new Set(streams).size, streams.length);
  unique = finish(finish(finish(unique)));
  const events = growthView(unique)!.campBursts!;
  assert.ok(events.length > 120);
  assert.equal(new Set(events.map((e) => e.outcome.eventId)).size, events.length);
});

test('無効化：専用設定と爆発を使わず通常練習を維持、旧v4の実装に追加しない', () => {
  const w = structuredClone(boundary);
  w.definitions.campConfig!.enabled = false;
  const a = applyCampDevelopmentDay(w),
    normal = calculateTrainingDay(w);
  assert.equal(a.growth.state.days[w.currentDate]!.camp, null);
  assert.deepEqual(a.growth.state.days[w.currentDate]!.outcomes, normal.day.outcomes);
  assert.ok(Object.values(a.growth.state.campBursts[campId]!).every((s) => s.rng.drawCount === 0));
});
test('履歴：通常/経験/年齢/覚醒/爆発の順序を可逆保存、混在形式を拒否', () => {
  const codec = createCampHistoryCodec(result.definitions),
    wire = codec.encode(day);
  assert.deepEqual(codec.decode(JSON.parse(canonicalJson(wire))), day);
  for (const mutate of [
    (v: any) => (v.historySchema = 'unknown'),
    (v: any) => (v.burstChanges[0].reason = 'aging'),
    (v: any) => (v.extra = 0),
  ]) {
    const v = structuredClone(wire);
    mutate(v);
    assert.throws(() => codec.decode(v));
  }
  const bad = structuredClone(result);
  bad.growth.state.campBursts[campId]![first]!.rng.drawCount++;
  assert.throws(() => validateWorld(bad));
});
test('実保存v021：専用メニュー・抽選・履歴をDB/バックアップから復元し同じ翌日へ続行', async () => {
  const db = new WorldDatabase('camp-save');
  try {
    const s = new DexieWorldStorage(db);
    await s.save(result, 1, 'manual', 0);
    const restored = (await s.load('manual')).world;
    assert.deepEqual(restored, result);
    assert.equal(
      (await db.save_snapshots.toArray())[0]!.versions.saveFormatVersion,
      'v021-world-snapshot-v20',
    );
    const backup = (await decodeBackup(await exportStoredPlay(db, s.localWorldId, 'manual'))).world;
    assert.deepEqual(backup, result);
    assert.deepEqual(finish(restored), finish(result));
  } finally {
    db.close();
    await db.delete();
  }
});
test('保存失敗：一括メニューを公開せず下書き再送可能、成功した再送は一度だけ', async () => {
  const db = new WorldDatabase('camp-retry');
  try {
    const s = new DexieWorldStorage(db),
      slots = await s.save(start, 1, 'manual', 0);
    const c = WorldController.fromCommitted(s, s.localWorldId, 1, start, slots),
      before = c.query();
    const command = {
      ...action,
      commandId: 'camp-retry',
      localWorldId: before.localWorldId,
      expectedStateRevision: before.revision,
    };
    const save = s.save.bind(s);
    s.save = async () => {
      throw Error('camp save failure');
    };
    await assert.rejects(c.dispatch(command));
    assert.deepEqual({ ...c.query(), storageError: before.storageError }, before);
    s.save = save;
    const after = await c.dispatch(command);
    assert.deepEqual(await c.dispatch(command), after);
    assert.equal(after.camp!.revision, 1);
    assert.deepEqual(after.training, before.training);
  } finally {
    db.close();
    await db.delete();
  }
});
test('固定旧v19：0.42.0のgzip・復元・継続ハッシュとv020を維持', async () => {
  const hash = (v: string | Uint8Array) => createHash('sha256').update(v).digest('hex');
  const bytes = readFileSync(new URL('./fixtures/world-v19-in-progress.json.gz', import.meta.url));
  assert.equal(hash(bytes), '48c8138be6117e7279ae58a861c4d81886099d454c14c2ccf1364b4eddfc619f');
  const old = JSON.parse(gunzipSync(bytes).toString('utf8')) as WorldRecord;
  assert.equal(
    hash(canonicalJson(old)),
    'd5d3ffb05563f11e039dbea7c5625673a73341a94deeaae2741ad6e7b815a823',
  );
  const db = new WorldDatabase('camp-old-v19');
  try {
    const s = new DexieWorldStorage(db);
    await s.save(old, 1, 'manual', 0);
    const loaded = (await s.load('manual')).world;
    assert.deepEqual(loaded, old);
    assert.equal(
      hash(canonicalJson(finish(loaded))),
      '82da14a894766886e523f9ab355843173aa1bb0e515c723225695516c180695c',
    );
    assert.equal(growthView(loaded)!.campBursts, undefined);
    assert.deepEqual(
      (await decodeBackup(await exportStoredPlay(db, s.localWorldId, 'manual'))).world,
      old,
    );
    assert.equal(
      (await db.save_snapshots.toArray())[0]!.versions.saveFormatVersion,
      'v020-world-snapshot-v19',
    );
  } finally {
    db.close();
    await db.delete();
  }
});
test('閲覧：履歴や集計を参照しても抽選・正本を変更しない', () => {
  const before = canonicalJson(result);
  assert.equal(growthView(result)!.campBursts!.length, 120);
  growthView(result);
  assert.equal(canonicalJson(result), before);
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
test('[annual-camp] キャンプ付き年間：188日216試合、発生の一意性・上限・v021の完全保存復元', async () => {
  let w: Current | null = createCampDevelopmentWorld(
    20260924,
    undefined,
    createCampDevelopmentDefinitions('annual'),
  );
  while (worldPhase(w) !== 'scheduleComplete') {
    w = finish(w);
    if (w.completedDates.length % 30 === 0) {
      console.log(`キャンプの年間検証：${w.completedDates.length} / 188日`);
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
  const bursts = growthView(w)!.campBursts!;
  assert.equal(new Set(bursts.map((e) => e.campId + ':' + e.outcome.playerId)).size, bursts.length);
  assert.ok(bursts.length <= 120);
  assert.equal(Object.values(w.growth.state.days).filter((d) => d.camp !== null).length, 7);
  const expected = await hashes(w);
  const db = new WorldDatabase('camp-annual');
  try {
    const save = async (world: Current) => {
      const s = new DexieWorldStorage(db);
      await s.save(world, 1, 'manual', 0);
      return s.localWorldId;
    };
    console.log('キャンプの年間検証：完走、保存');
    const local = await save(w);
    w = null;
    const snap = (await db.save_snapshots.toArray())[0]!;
    console.log(
      'キャンプの保存容量（展開bytes）:',
      snap.blockRefs.reduce((n, r) => n + r.rawBytes, 0),
    );
    assert.equal(snap.blockRefs.length, 407);
    assert.ok(snap.blockRefs.every((r) => r.rawBytes <= 16 * 1024 * 1024));
    assert.ok(snap.blockRefs.reduce((n, r) => n + r.rawBytes, 0) <= 512 * 1024 * 1024);
    console.log('キャンプの年間検証：DB復元');
    assert.deepEqual(
      await hashes((await new DexieWorldStorage(db).load('manual')).world),
      expected,
    );
    console.log('キャンプの年間検証：バックアップ復元');
    assert.deepEqual(
      await hashes((await decodeBackup(await exportStoredPlay(db, local, 'manual'))).world),
      expected,
    );
  } finally {
    db.close();
    await db.delete();
  }
});
