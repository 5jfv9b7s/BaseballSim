import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createPitchLearningDefinitions } from '../src/data/world/pitch-learning.ts';
import {
  createPitchLearningWorld,
  createCampDevelopmentWorld,
  createScheduledGame,
  advanceWorld,
  completeDay,
  worldPhase,
  validateDefinitions,
} from '../src/world/engine.ts';
import { applyPitchLearningDay } from '../src/world/pitch-learning.ts';
import { applyManagement } from '../src/world/management.ts';
import { applyGrowthFixture } from '../src/world/growth-fixture.ts';
import { activeGrowthBasis, growthAbilityKey } from '../src/world/growth-basis.ts';
import { growthView, growthComparison } from '../src/world/growth-view.ts';
import { createPitchLearningHistoryCodec } from '../src/world/pitch-learning-history-codec.ts';
import { validateWorld } from '../src/world/validation.ts';
import { DexieWorldStorage, WorldDatabase } from '../src/world/dexie-storage.ts';
import { exportStoredPlay } from '../src/world/backup-storage.ts';
import { decodeBackup } from '../src/world/backup-package.ts';
import { canonicalJson, sha256 } from '../src/storage/codec.ts';
import type { WorldRecord } from '../src/world/types.ts';

type Current = ReturnType<typeof createPitchLearningWorld>;
function definitions() {
  const d = createPitchLearningDefinitions();
  d.growthConfig!.opportunity = { baseMilli: 100000, ambitionMilli: 0 };
  d.campConfig!.burst.basePpm = 0;
  d.campConfig!.burst.ambitionPpm = 0;
  return d;
}
const d = definitions(),
  own = d.squads[0]!;
const candidate = own.pitches.find((p) => p.acquisitionProgressMilli === 0)!;
const ref = { scope: 'pitch' as const, pitchId: candidate.pitchId, code: 'control' as const };
function planned(input = definitions(), intensity: 'normal' | 'rest' = 'normal'): Current {
  const w = createPitchLearningWorld(7, undefined, input);
  return applyManagement(w, 'learning-plan', {
    kind: 'setTrainingPlans',
    squadId: own.squadId,
    updates: [
      {
        playerId: candidate.playerId,
        settings: {
          target: { kind: 'pitchAcquisition', pitchId: candidate.pitchId },
          intensity,
          autoAdjustForFatigue: false,
        },
      },
    ],
  }) as Current;
}
function ready(w: Current): Current {
  while (worldPhase(w) === 'playing') w = advanceWorld(w, 25) as Current;
  return w;
}
// 純粋計算の境界試験専用。保存・試合入力の統合試験は実際の全試合を完走する。
function calculation(w: Current) {
  return applyPitchLearningDay({ ...w, dayPlan: { ...w.dayPlan, gameIds: [], cursor: 0 } });
}

test('入力：架空24候補・別進度・旧モデルに後付けしない', () => {
  const w = createPitchLearningWorld(7);
  assert.equal(w.version, 'world-prototype-v21');
  assert.equal(w.growth.version, 'daily-development-v6');
  assert.equal(Object.keys(w.growth.state.acquisition).length, 24);
  assert.ok(Object.isFrozen(w.definitions));
  assert.equal(
    createCampDevelopmentWorld(7)
      .definitions.squads.flatMap((s) => s.pitches)
      .some((p) => p.acquisitionProgressMilli < 100000),
    false,
  );
  assert.ok(!activeGrowthBasis(w, candidate.playerId).some((a) => a.key === growthAbilityKey(ref)));
});

test('検査：不正な係数・他人の球・既習得球・旧定義への後付けを拒否', () => {
  for (const value of [0, -1, 100001, 0.5, NaN]) {
    const invalid = definitions();
    invalid.pitchLearningConfig!.progressPerBudgetPermille = value;
    assert.throws(() => validateDefinitions(invalid), /換算/);
  }
  const w = planned();
  for (const pitchId of [
    own.pitches[0]!.pitchId,
    'unknown',
    d.squads[1]!.pitches.find((p) => p.acquisitionProgressMilli === 0)!.pitchId,
  ]) {
    assert.throws(
      () =>
        applyManagement(w, 'invalid-' + pitchId, {
          kind: 'setTrainingPlans',
          squadId: own.squadId,
          updates: [
            {
              playerId: candidate.playerId,
              settings: {
                target: { kind: 'pitchAcquisition', pitchId },
                intensity: 'normal',
                autoAdjustForFatigue: false,
              },
            },
          ],
        }),
      /未習得候補/,
    );
  }
  const invalid = structuredClone(createCampDevelopmentWorld().definitions);
  invalid.pitchLearningConfig = d.pitchLearningConfig;
  assert.throws(() => validateDefinitions(invalid), /旧定義/);
});

test('指定予算のみ進度へ振替：未習得能力・入力・試合乱数は不変', () => {
  const w = planned(),
    before = canonicalJson(w);
  const result = calculation(w),
    day = result.growth.state.days[w.currentDate]!;
  const o = day.pitchLearning[0]!,
    training = day.outcomes.find((o) => o.playerId === candidate.playerId)!;
  assert.equal(o.pitchId, candidate.pitchId);
  assert.ok(o.afterMilli > 0 && o.afterMilli < 100000);
  assert.equal(
    o.afterMilli,
    training.budgetMilli -
      Math.floor((training.budgetMilli * d.growthConfig!.budget.backgroundPermille) / 1000),
  );
  assert.equal(
    result.growth.state.players[candidate.playerId]!.values[growthAbilityKey(ref)],
    candidate.control.valueMilli,
  );
  assert.equal(
    day.changes.some(
      (c) => c.abilityRef.scope === 'pitch' && c.abilityRef.pitchId === candidate.pitchId,
    ),
    false,
  );
  assert.equal(result.growth.state.players[candidate.playerId]!.rng.drawCount, 2);
  assert.equal(canonicalJson(w), before);
});

test('休養・不成立・無効設定・疲労による休養では進度を増やさない', () => {
  assert.equal(
    calculation(planned(definitions(), 'rest')).growth.state.acquisition[candidate.pitchId]!
      .progressMilli,
    0,
  );
  for (const disable of ['learning', 'growth', 'opportunity'] as const) {
    const input = definitions();
    if (disable === 'learning') input.pitchLearningConfig!.enabled = false;
    if (disable === 'growth') input.growthConfig!.enabled = false;
    if (disable === 'opportunity')
      input.growthConfig!.opportunity = { baseMilli: 1, ambitionMilli: 0 };
    assert.equal(
      calculation(planned(input)).growth.state.acquisition[candidate.pitchId]!.progressMilli,
      0,
    );
  }
  const tired = structuredClone(planned());
  assert.ok(tired.management.version === 'club-management-v2');
  tired.management.training.plans[candidate.playerId]!.autoAdjustForFatigue = true;
  tired.physical.players[candidate.playerId]!.energyMilli = 0;
  const result = calculation(tired);
  assert.equal(
    result.growth.state.days[tired.currentDate]!.outcomes.find(
      (o) => o.playerId === candidate.playerId,
    )!.effectiveIntensity,
    'rest',
  );
  assert.equal(result.growth.state.acquisition[candidate.pitchId]!.progressMilli, 0);
});

test('キャンプ：専用指定と倍率を使い、爆発で進度を二重加算しない', () => {
  const w = planned(),
    period = w.definitions.campInputs!.periods[0]!;
  const adjusted = { ...w, currentDate: period.from };
  assert.equal(calculation(adjusted).growth.state.days[period.from]!.pitchLearning.length, 0);
  const camp = structuredClone(adjusted);
  camp.camp.plans[period.campId]![candidate.playerId] = {
    ...camp.camp.plans[period.campId]![candidate.playerId]!,
    target: { kind: 'pitchAcquisition', pitchId: candidate.pitchId },
    intensity: 'normal',
    autoAdjustForFatigue: false,
  };
  const day = calculation(camp).growth.state.days[period.from]!;
  const basic = calculation(w).growth.state.days[w.currentDate]!.pitchLearning[0]!.afterMilli;
  assert.equal(
    day.pitchLearning[0]!.afterMilli,
    Math.round((basic * d.campConfig!.focusAmountPermille) / 1000),
  );
  assert.equal(day.camp!.outcomes.find((o) => o.playerId === candidate.playerId)!.status, 'noRoom');
  assert.deepEqual(camp.management, w.management);
});

test('日次統合：99.999%は使用不可、100%確定後の次試合へ反映、二重適用拒否', () => {
  const input = definitions();
  input.squads[0]!.pitches.find((p) => p.pitchId === candidate.pitchId)!.acquisitionProgressMilli =
    99999;
  const initial = planned(input);
  assert.throws(() => applyPitchLearningDay(initial), /全試合終了後/);
  const boundary = ready(initial),
    before = canonicalJson(boundary.games);
  for (const game of Object.values(boundary.games))
    assert.equal(
      game.events.some((e) => e.pitch?.pitchId === candidate.pitchId),
      false,
    );
  const next = completeDay(boundary, boundary.currentDate) as Current;
  assert.deepEqual(next.growth.state.acquisition[candidate.pitchId], {
    progressMilli: 100000,
    acquiredOn: boundary.currentDate,
  });
  const fixture = structuredClone(
    createScheduledGame(initial, initial.dayPlan.gameIds[0]!).fixture,
  );
  applyGrowthFixture(next, fixture);
  assert.equal(
    fixture.pitches.find((p) => p.pitchId === candidate.pitchId)!.acquisitionProgressMilli,
    100000,
  );
  assert.equal(canonicalJson(next.games), before);
  assert.throws(() => completeDay(next, boundary.currentDate), /日付が変わって/);
  assert.ok(
    activeGrowthBasis(next, candidate.playerId).some((a) => a.key === growthAbilityKey(ref)),
  );
  validateWorld(next);
  const growth = growthView(next)!;
  assert.equal(growth.pitchLearning!.latest[0]!.afterMilli, 100000);
  assert.equal(
    Object.hasOwn(growth.periods.season.start[candidate.playerId]!, growthAbilityKey(ref)),
    false,
  );
  assert.equal(
    growthComparison(
      next.definitions,
      candidate.playerId,
      growth.periods.season.start[candidate.playerId]!,
      growth.current[candidate.playerId]!,
    ).rows.some((a) => a.key === growthAbilityKey(ref)),
    false,
  );
  const tampered = structuredClone(next);
  tampered.growth.state.acquisition[candidate.pitchId]!.acquiredOn = null;
  assert.throws(() => validateWorld(tampered), /一致|再現/);
});

test('習得後：同じ指定で制球・再現性を練習、超過進度を能力へ足さない', () => {
  const w = structuredClone(planned());
  w.growth.state.acquisition[candidate.pitchId] = {
    progressMilli: 100000,
    acquiredOn: w.currentDate,
  };
  const result = calculation(w);
  assert.equal(result.growth.state.acquisition[candidate.pitchId]!.progressMilli, 100000);
  assert.ok(
    result.growth.state.players[candidate.playerId]!.values[growthAbilityKey(ref)]! >
      candidate.control.valueMilli,
  );
});

test('可逆履歴：往復一致、不正形式・余分項目・過大件数を拒否', () => {
  const w = planned(),
    day = calculation(w).growth.state.days[w.currentDate]!;
  const codec = createPitchLearningHistoryCodec(w.definitions),
    wire = codec.encode(day);
  assert.deepEqual(codec.decode(wire), day);
  assert.throws(() => codec.decode({ ...wire, other: 0 }), /形式/);
  assert.throws(() => codec.decode({ ...wire, historySchema: 'camp-day-v1' }), /形式/);
  assert.throws(
    () => codec.decode({ ...wire, pitchLearning: Array(121).fill(wire.pitchLearning[0]) }),
    /形式/,
  );
});

test('保存：実試合・設定・進度・完全乱数をDB/バックアップ復元、改ざん保存は拒否', async () => {
  const db = new WorldDatabase('pitch-learning-' + crypto.randomUUID());
  try {
    const storage = new DexieWorldStorage(db),
      readyWorld = ready(planned());
    const world = completeDay(readyWorld, readyWorld.currentDate) as Current;
    await storage.save(world, 1, 'auto', 0);
    assert.equal(
      (await db.save_snapshots.toArray())[0]!.versions.saveFormatVersion,
      'v022-world-snapshot-v21',
    );
    assert.deepEqual((await new DexieWorldStorage(db).load('auto')).world, world);
    assert.deepEqual(
      (await decodeBackup(await exportStoredPlay(db, 'v02-local', 'auto'))).world,
      world,
    );
    const altered = structuredClone(world);
    altered.growth.state.days[world.lastCompletedDate!]!.pitchLearning[0]!.afterMilli++;
    await assert.rejects(storage.save(altered, 2, 'manual', 1), /再現|一致/);
    assert.deepEqual((await new DexieWorldStorage(db).load('auto')).world, world);
  } finally {
    await db.delete();
  }
});

test('旧v20固定入力：変更前SHAと旧ファクトリが一致、習得モデルを後付けしない', async () => {
  const world = JSON.parse(
    gunzipSync(
      readFileSync(new URL('./fixtures/world-v20-initial.json.gz', import.meta.url)),
    ).toString('utf8'),
  ) as WorldRecord;
  assert.equal(
    await sha256(canonicalJson(world)),
    '86daf2d96b05c169de87d9c072778d53cc765c1988a5e742b4a172c9b430c5d4',
  );
  assert.deepEqual(createCampDevelopmentWorld(7), world);
  validateWorld(world);
});

test('習得途中を含む期間：表示端点とグラフの増減合計が一致する', () => {
  const w = planned();
  const basis = structuredClone(w);
  basis.growth.state.acquisition[candidate.pitchId] = {
    progressMilli: 100000,
    acquiredOn: w.currentDate,
  };
  const result = calculation(basis);
  const after: Current = {
    ...basis,
    ...result,
    currentDate: '2026-09-25',
    completedDates: [w.currentDate],
    lastCompletedDate: w.currentDate,
  };
  const view = growthView(after)!;
  for (const period of Object.values(view.periods)) {
    const comparison = growthComparison(
      after.definitions,
      candidate.playerId,
      period.start[candidate.playerId]!,
      view.current[candidate.playerId]!,
    );
    assert.equal(
      period.dailyDeltas![candidate.playerId]!.reduce((sum, n) => sum + n, 0),
      comparison.net,
    );
  }
});

test('旧v20続行：0.44.0独立実行と通常日・キャンプ日の全world SHAが一致', async () => {
  const initial = JSON.parse(
    gunzipSync(
      readFileSync(new URL('./fixtures/world-v20-initial.json.gz', import.meta.url)),
    ).toString('utf8'),
  ) as WorldRecord;
  let world = initial;
  while (worldPhase(world) === 'playing') world = advanceWorld(world, 25);
  world = completeDay(world, world.currentDate);
  assert.equal(
    await sha256(canonicalJson(world)),
    '5d7a0c4f83df81622f120b6afd5a945f2699de27e40610484f8a4c9aab9a90c4',
  );
  while (worldPhase(world) === 'playing') world = advanceWorld(world, 25);
  world = completeDay(world, world.currentDate);
  assert.equal(
    await sha256(canonicalJson(world)),
    '93af616b09a69dd3eac6f5067050efe19d9b01cda57fe3c8f3607d3d21a44c36',
  );
});

test('実投球：習得後の新球種が配球に現れ、習得前と当日中は使用しない', () => {
  const input = definitions();
  const candidates = input.squads
    .flatMap((s) => s.pitches)
    .filter((p) => p.acquisitionProgressMilli < 100000);
  // 境界の実投球を検査するための入力。既定の候補・係数は変更しない。
  for (const pitch of candidates) {
    pitch.acquisitionProgressMilli = 99999;
    input.trainingPlans!.players.find((p) => p.playerId === pitch.playerId)!.settings = {
      target: { kind: 'pitchAcquisition', pitchId: pitch.pitchId },
      intensity: 'normal',
      autoAdjustForFatigue: false,
    };
  }
  let world = createPitchLearningWorld(7, undefined, input);
  while (worldPhase(world) !== 'scheduleComplete') {
    world = ready(world);
    world = completeDay(world, world.currentDate) as Current;
  }
  const thrown = new Set<string>();
  for (const game of Object.values(world.games)) {
    const date = world.definitions.schedule.find((s) => s.gameId === game.state.gameId)!.date;
    for (const event of game.events) {
      const pitchId = event.pitch?.pitchId;
      if (!pitchId || !world.growth.state.acquisition[pitchId]) continue;
      const acquired = world.growth.state.acquisition[pitchId]!;
      assert.equal(acquired.progressMilli, 100000);
      assert.ok(acquired.acquiredOn && acquired.acquiredOn < date);
      thrown.add(pitchId);
    }
  }
  assert.ok(thrown.size > 0, '習得状態の記録だけでなく、新球種の実投球を検査する');
});
