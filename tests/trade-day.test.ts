import assert from 'node:assert/strict';
import test from 'node:test';
import { completeDay, nextDate } from '../src/world/engine.ts';
import { completeTradeWorldDay } from '../src/world/trade-day.ts';
import { applyTradeDayCommand } from '../src/world/trade-day-commands.ts';
import { applyTradeGameCommand } from '../src/world/trade-game-commands.ts';
import { validateTradeSavedState } from '../src/world/trade-save-validation.ts';
import { validateTradeSaveTransition } from '../src/world/trade-save-transition.ts';
import { encodeTradeSnapshot, decodeTradeSnapshot } from '../src/world/trade-snapshot-codec.ts';
import { activityKey } from '../src/world/physical.ts';
import { createTradeApplicationPort } from '../src/world/trade-application-port.ts';
import { commitAcceptedTrade } from '../src/recruitment/trade-commit.ts';
import { gameFixture, beginCommand, memoryStorage } from './helpers/trade-game-fixture.ts';
import { idleDayFixture, dayCommand } from './helpers/trade-day-fixture.ts';
import type { TradeSavedState } from '../src/world/trade-save-validation.ts';

function daily(saved: TradeSavedState, id = 'test-complete-day'): TradeSavedState {
  const result = applyTradeDayCommand(saved, dayCommand(saved, id));
  assert.equal(result.status, 'applied');
  if (result.status !== 'applied') throw new Error('日次試験が再送になりました');
  return result.snapshot;
}

test('試合なしの日次計算は既存v21と同じ成長・調子・回復を一度だけ適用する', () => {
  const f = idleDayFixture(),
    before = structuredClone(f.initial);
  const legacy = completeDay(f.source, f.source.currentDate);
  if (legacy.version !== 'world-prototype-v21') throw new Error('旧世界の版が変わりました');
  const next = daily(f.initial);
  for (const key of [
    'growth',
    'physical',
    'condition',
    'completedDates',
    'lastCompletedDate',
    'currentDate',
  ] as const)
    assert.deepEqual(next.state[key], legacy[key]);
  assert.equal(next.state.rosterAsOf.date, next.currentDate);
  assert.equal(next.state.rosterAsOf.order, 0);
  assert.deepEqual(next.state.registration, f.initial.state.registration);
  assert.deepEqual(next.state.finance, f.initial.state.finance);
  assert.deepEqual(f.initial, before);
  validateTradeSavedState(next);
});

test('休養日でも全選手を一度処理し、試合・成績・登板履歴を作らない', () => {
  const f = idleDayFixture(),
    next = daily(f.initial),
    date = f.initial.currentDate;
  const day = next.state.growth.state.days[date]!;
  assert.equal(
    new Set(day.outcomes.map((r) => r.playerId)).size,
    Object.keys(next.state.growth.state.players).length,
  );
  for (const id of Object.keys(next.state.growth.state.players))
    assert.equal(next.state.physical.recoveries[activityKey(id, date)]!.date, date);
  for (const key of [
    'games',
    'stats',
    'restControl',
    'contributions',
    'statApplicationMarkers',
  ] as const)
    assert.deepEqual(next.state[key], f.initial.state[key]);
});

test('移籍後も同じ選手IDの練習設定・成長RNGを使い、所属を初期化しない', async () => {
  const f = idleDayFixture();
  const result = await commitAcceptedTrade(
    f.command,
    createTradeApplicationPort(memoryStorage(f.initial).storage),
  );
  assert.equal(result.status, 'committed');
  if (result.status !== 'committed') return;
  const next = daily(result.snapshot),
    id = f.request.moves[1]!.playerId;
  assert.equal(
    next.state.registration.memberships.find((r) => r.playerId === id && r.until === null)!.clubId,
    f.request.moves[1]!.toClubId,
  );
  assert.deepEqual(next.state.management, result.snapshot.state.management);
  assert.ok(
    next.state.growth.state.days[result.snapshot.currentDate]!.outcomes.some(
      (r) => r.playerId === id,
    ),
  );
  assert.ok(
    next.state.growth.state.players[id]!.rng.drawCount >=
      result.snapshot.state.growth.state.players[id]!.rng.drawCount,
  );
});

test('当日未完了・日次計画の欠落がある間は日次確定しない', () => {
  const f = gameFixture(),
    before = structuredClone(f.initial);
  assert.throws(() => daily(f.initial), /全試合/);
  f.initial.state.dayPlan.cursor = f.initial.state.dayPlan.gameIds.length;
  assert.throws(() => daily(f.initial), /未完了/);
  f.initial.state.dayPlan.gameIds = [];
  f.initial.state.dayPlan.cursor = 0;
  assert.throws(() => daily(f.initial), /全試合/);
  assert.deepEqual(f.initial.state.growth, before.state.growth);
});

test('同じ日次指示の再送は履歴だけを返し、別入力と二度目の適用は拒否する', () => {
  const f = idleDayFixture(),
    command = dayCommand(f.initial),
    next = daily(f.initial),
    before = structuredClone(next);
  assert.equal(applyTradeDayCommand(next, command).status, 'replayed');
  assert.throws(
    () => applyTradeDayCommand(next, { ...command, expectedDate: next.currentDate }),
    /同じ日次指示ID/,
  );
  assert.throws(
    () =>
      applyTradeDayCommand(next, {
        ...command,
        commandId: 'repeat-date',
        expectedStateRevision: next.stateRevision,
      }),
    /対象日付/,
  );
  assert.deepEqual(next, before);
});

test('プレイ・状態版・試合指示IDの衝突を計算前に拒否する', () => {
  const f = gameFixture(),
    begin = beginCommand(f.initial);
  const result = applyTradeGameCommand(f.initial, begin);
  assert.equal(result.status, 'applied');
  if (result.status !== 'applied') return;
  assert.throws(
    () =>
      applyTradeDayCommand(result.snapshot, {
        ...dayCommand(result.snapshot),
        commandId: begin.commandId,
      }),
    /別の種類/,
  );
  assert.throws(
    () => applyTradeDayCommand(f.initial, { ...dayCommand(f.initial), worldId: 'other-world' }),
    /別プレイ/,
  );
  assert.throws(
    () => applyTradeDayCommand(f.initial, { ...dayCommand(f.initial), expectedStateRevision: 0 }),
    /古い状態/,
  );
});

test('日次保存v3の再開を挟んでも二日目の全状態・完全RNGが一致する', async () => {
  const f = idleDayFixture(),
    first = daily(f.initial),
    candidate = structuredClone(first);
  candidate.storageRevision++;
  const encoded = await encodeTradeSnapshot(candidate, null, 'dailyAuto');
  assert.equal(encoded.snapshot.versions.saveFormatVersion, 'trade-application-snapshot-v3');
  const restored = await decodeTradeSnapshot(encoded.snapshot, encoded.blocks);
  assert.deepEqual(restored, candidate);
  const continuous = daily(candidate, 'second-day'),
    resumed = daily(restored, 'second-day');
  assert.deepEqual(resumed, continuous);
  assert.equal(resumed.state.lastCompletedDate, nextDate(f.initial.currentDate));
});

test('習得完了を日次履歴へ記録し、成長対象として使う基準を翌日へ移す', () => {
  const f = idleDayFixture(),
    world = f.initial.state,
    defs = world.initialDefinitions;
  const pitch = defs.squads
    .flatMap((s) => s.pitches)
    .find((p) => p.acquisitionProgressMilli < 100000)!;
  assert.ok(pitch);
  defs.growthConfig!.opportunity = { baseMilli: 100000, ambitionMilli: 0 };
  defs.campConfig!.enabled = false;
  defs.experienceConfig!.enabled = false;
  defs.awakeningConfig!.enabled = false;
  defs.ageConfig!.enabled = false;
  world.growth.state.acquisition[pitch.pitchId] = { progressMilli: 99999, acquiredOn: null };
  assert.equal(world.management.version, 'club-management-v2');
  if (world.management.version !== 'club-management-v2') return;
  const plan = world.management.training.plans[pitch.playerId]!;
  plan.target = { kind: 'pitchAcquisition', pitchId: pitch.pitchId };
  plan.intensity = 'normal';
  plan.autoAdjustForFatigue = false;
  const next = daily(f.initial),
    progress = next.state.growth.state.acquisition[pitch.pitchId]!;
  assert.equal(progress.progressMilli, 100000);
  assert.equal(progress.acquiredOn, world.currentDate);
  assert.equal(next.state.currentDate, nextDate(world.currentDate));
  assert.ok(
    next.state.growth.state.days[world.currentDate]!.pitchLearning.some(
      (r) => r.pitchId === pitch.pitchId,
    ),
  );
});

test('未対応の自動固定入替が必要なら日次処理せず、再登録待ち期間は解除しない', () => {
  const f = idleDayFixture(),
    world = f.initial.state;
  const row = world.registration.registrations.find(
    (r) => r.until === null && r.category === 'farm',
  )!;
  const preference = world.rosterControl.preferences.find(
    (p) => p.playerId === row.playerId && p.clubId === row.clubId,
  )!;
  preference.preference = 'firstFixed';
  world.rosterControl.policies[row.clubId]!.changeMode = 'auto';
  row.nextFirstEligibleOn = null;
  const before = structuredClone(f.initial);
  assert.throws(() => daily(f.initial), /未接続/);
  assert.deepEqual(f.initial, before);
  row.nextFirstEligibleOn = nextDate(nextDate(world.currentDate));
  const next = daily(f.initial);
  assert.equal(
    next.state.registration.registrations.find((r) => r.registrationId === row.registrationId)!
      .nextFirstEligibleOn,
    row.nextFirstEligibleOn,
  );
});

test('日次履歴の欠損・回復記録欠損・別内容の保存候補を拒否する', async () => {
  const f = idleDayFixture(),
    next = daily(f.initial),
    candidate = structuredClone(next);
  candidate.storageRevision++;
  assert.equal(await validateTradeSaveTransition(f.initial, candidate), 'dayAuto');
  const missing = structuredClone(candidate),
    id = Object.keys(missing.state.growth.state.players)[0]!;
  delete missing.state.physical.recoveries[activityKey(id, f.initial.currentDate)];
  assert.throws(() => validateTradeSavedState(missing), /回復記録/);
  const broken = structuredClone(candidate);
  broken.dayReceipts![0]!.nextDate = f.initial.currentDate;
  assert.throws(() => validateTradeSavedState(broken), /日付/);
  candidate.state.physical.players[id]!.energyMilli = 1;
  await assert.rejects(validateTradeSaveTransition(f.initial, candidate), /再計算/);
});

test('単年最終日の確定で一二軍の要約を作り、それ以降は日次計算を進めない', () => {
  const f = idleDayFixture();
  let saved = f.initial;
  const end = saved.state.initialDefinitions.endDate;
  for (let i = 0; i < 367 && saved.currentDate <= end; i++) saved = daily(saved, 'close-' + i);
  assert.equal(saved.currentDate, nextDate(end));
  assert.ok(saved.state.seasonSummary);
  assert.ok(saved.state.farmSummary);
  assert.throws(() => daily(saved, 'after-season'), /終了/);
  assert.equal(saved.state.seasonSummary!.completedOn, end);
});

test('日次後も同じ定義と現在所属を保ち、次日の試合計画をID順に再作成する', () => {
  const f = idleDayFixture(),
    defs = f.initial.state.initialDefinitions;
  const tomorrow = nextDate(f.initial.currentDate);
  const rows = f.originalSchedule.filter((g) => g.date === f.initial.currentDate);
  assert.ok(rows.length > 0);
  defs.schedule = rows.map((g) => ({ ...g, date: tomorrow })).reverse();
  const next = completeTradeWorldDay(f.initial.state, f.initial.currentDate);
  assert.deepEqual(next.initialDefinitions, defs);
  assert.deepEqual(next.registration.memberships, f.initial.state.registration.memberships);
  assert.deepEqual(next.dayPlan, {
    date: tomorrow,
    gameIds: defs.schedule
      .filter((g) => g.date === tomorrow)
      .map((g) => g.gameId)
      .sort(),
    cursor: 0,
  });
});
