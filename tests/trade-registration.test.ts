import assert from 'node:assert/strict';
import test from 'node:test';
import { nextDate } from '../src/world/engine.ts';
import { registrationEligibleOn } from '../src/world/registration.ts';
import { tradeApplicationRosterState } from '../src/world/trade-application-state.ts';
import {
  applyTradeRosterCommand,
  parseTradeRosterCommand,
} from '../src/world/trade-roster-commands.ts';
import { applyTradeDayCommand } from '../src/world/trade-day-commands.ts';
import { applyTradeGameCommand } from '../src/world/trade-game-commands.ts';
import { validateTradeSavedState } from '../src/world/trade-save-validation.ts';
import { validateTradeSaveTransition } from '../src/world/trade-save-transition.ts';
import { encodeTradeSnapshot, decodeTradeSnapshot } from '../src/world/trade-snapshot-codec.ts';
import { idleDayFixture, dayCommand } from './helpers/trade-day-fixture.ts';
import { gameFixture, beginCommand, applied } from './helpers/trade-game-fixture.ts';
import { committedTradeSaveFixture } from './helpers/trade-save-fixture.ts';
import {
  currentClub,
  reserveBatter,
  registrationCommand,
  policyCommand,
  rosterApplied,
  rosterDayCommand,
  replacePlayer,
} from './helpers/trade-registration-fixture.ts';
import type { TradeSavedState } from '../src/world/trade-save-validation.ts';

function daily(saved: TradeSavedState, id = 'roster-day') {
  const result = applyTradeDayCommand(saved, rosterDayCommand(saved, id));
  assert.equal(result.status, 'applied');
  if (result.status !== 'applied') throw new Error('日次指示が再送になりました');
  return result.snapshot;
}

test('控えの抹消は登録期間だけ更新し、個人状態・所属・会計・初期資料を保持する', () => {
  const f = idleDayFixture(),
    before = structuredClone(f.initial),
    c = registrationCommand(f.initial);
  const next = rosterApplied(f.initial, c),
    id = c.changes[0]!.playerId;
  assert.deepEqual(f.initial, before);
  assert.equal(next.stateRevision, before.stateRevision + 1);
  assert.equal(next.storageRevision, before.storageRevision);
  const row = next.state.registration.registrations.find(
    (r) => r.playerId === id && r.until === null,
  )!;
  assert.equal(row.category, 'farm');
  assert.equal(row.nextFirstEligibleOn, registrationEligibleOn(before.currentDate, 10));
  assert.deepEqual(
    next.state.registration.registrations.find((r) => r.playerId === id && r.until !== null)!.until,
    row.from,
  );
  for (const key of [
    'initialDefinitions',
    'finance',
    'growth',
    'physical',
    'condition',
    'games',
    'stats',
    'contributions',
    'statApplicationMarkers',
    'transactions',
  ] as const)
    assert.deepEqual(next.state[key], before.state[key]);
  assert.deepEqual(next.state.registration.memberships, before.state.registration.memberships);
  validateTradeSavedState(next);
});

test('一軍再登録待ちは固定希望でも解除せず、可能日の翌日再評価で一度だけ復帰する', () => {
  const f = idleDayFixture();
  // 検査日数を短くする試験値。製品の10日規則を変更しない。
  f.initial.state.initialDefinitions.registrationRules!.reentryDays = 2;
  const c = registrationCommand(f.initial),
    id = c.changes[0]!.playerId;
  const demoted = rosterApplied(f.initial, c);
  const requested = rosterApplied(demoted, policyCommand(demoted, { [id]: 'firstFixed' }));
  assert.equal(requested.rosterReceipts!.at(-1)!.reconciliation!.status, 'pending');
  const one = daily(requested),
    two = daily(one, 'eligible-day');
  assert.equal(
    one.state.registration.registrations.find((r) => r.playerId === id && r.until === null)!
      .category,
    'farm',
  );
  const current = two.state.registration.registrations.find(
    (r) => r.playerId === id && r.until === null,
  )!;
  assert.equal(current.category, 'first');
  assert.equal(current.nextFirstEligibleOn, null);
  assert.deepEqual(current.from, { date: two.currentDate, order: 0 });
  assert.equal(
    two.state.registration.registrations.filter((r) => r.playerId === id && r.until === null)
      .length,
    1,
  );
  validateTradeSavedState(two);
});

test('先発野手の昇降格は一二軍の明示打順と同時に審査し、欠員のまま適用しない', () => {
  const f = idleDayFixture(),
    c = registrationCommand(f.initial);
  const squads = tradeApplicationRosterState(f.initial.state).squads.filter(
    (s) => s.clubId === c.clubId,
  );
  const first = squads.find((s) => s.category === 'first')!,
    farm = squads.find((s) => s.category === 'farm')!;
  const a = first.lineup.battingOrder[0]!.playerId!,
    b = farm.lineup.battingOrder[0]!.playerId!;
  c.changes = [
    { playerId: a, category: 'farm' },
    { playerId: b, category: 'first' },
  ];
  assert.equal(applyTradeRosterCommand(f.initial, c).status, 'blocked');
  c.squadReplacements = [replacePlayer(first, a, b), replacePlayer(farm, b, a)];
  const next = rosterApplied(f.initial, c);
  assert.equal(next.state.management.idealLineups[first.squadId]!.battingOrder[0]!.playerId, b);
  assert.equal(next.state.management.idealLineups[farm.squadId]!.battingOrder[0]!.playerId, a);
  assert.equal(
    next.state.management.policyRevisions[first.squadId],
    f.initial.state.management.policyRevisions[first.squadId]! + 1,
  );
  validateTradeSavedState(next);
});

test('投手の登録移動は先発・救援・個別休養・条件別救援を一緒に指定する', () => {
  const f = idleDayFixture(),
    c = registrationCommand(f.initial);
  const squads = tradeApplicationRosterState(f.initial.state).squads.filter(
    (s) => s.clubId === c.clubId,
  );
  const first = squads.find((s) => s.category === 'first')!,
    farm = squads.find((s) => s.category === 'farm')!;
  const a = first.pitchers.rotationSlots[0]!.playerId!,
    b = farm.pitchers.rotationSlots[0]!.playerId!;
  c.changes = [
    { playerId: a, category: 'farm' },
    { playerId: b, category: 'first' },
  ];
  assert.equal(applyTradeRosterCommand(f.initial, c).status, 'blocked');
  c.squadReplacements = [replacePlayer(first, a, b), replacePlayer(farm, b, a)];
  const next = rosterApplied(f.initial, c);
  assert.equal(
    next.state.management.pitcherUsagePlans[first.squadId]!.rotationSlots[0]!.playerId,
    b,
  );
  assert.deepEqual(next.state.restControl.appearances, f.initial.state.restControl.appearances);
  validateTradeSavedState(next);
});

test('外国人登録上限を超える昇格は、他選手の抹消・状態更新もまとめて取り消す', () => {
  const f = idleDayFixture(),
    c = registrationCommand(f.initial),
    promoted = reserveBatter(f.initial, 'farm');
  f.initial.state.playerFacts.find((p) => p.playerId === promoted)!.foreignBaseStatus = 'subject';
  f.initial.state.initialDefinitions.registrationRules!.foreignFirstLimit = 0;
  f.initial.state.initialDefinitions.registrationRules!.foreignBenchLimit = 0;
  c.changes.push({ playerId: promoted, category: 'first' });
  const before = structuredClone(f.initial),
    result = applyTradeRosterCommand(f.initial, c);
  assert.equal(result.status, 'blocked');
  if (result.status !== 'blocked') return;
  assert.ok(result.issues.some((i) => i.code === 'rosterLimit'));
  assert.deepEqual(f.initial, before);
});

test('固定希望は球団単位で一式保留し、希望の設定自体と保留理由は保持する', () => {
  const f = idleDayFixture(),
    clubId = currentClub(f.initial),
    reserve = reserveBatter(f.initial);
  const farm = tradeApplicationRosterState(f.initial.state).squads.find(
    (s) => s.clubId === clubId && s.category === 'farm',
  )!;
  const starter = farm.lineup.battingOrder[0]!.playerId!;
  const next = rosterApplied(
    f.initial,
    policyCommand(f.initial, { [reserve]: 'farmFixed', [starter]: 'firstFixed' }),
  );
  const report = next.rosterReceipts![0]!.reconciliation!;
  assert.equal(report.status, 'pending');
  assert.equal(report.requestedPlayerIds.length, 2);
  assert.deepEqual(
    next.state.registration.registrations,
    f.initial.state.registration.registrations,
  );
  assert.equal(
    next.state.rosterControl.preferences.find((p) => p.playerId === reserve)!.preference,
    'farmFixed',
  );
  validateTradeSavedState(next);
});

test('移籍後の固定希望は現在所属全員で編集し、旧球団の全員一覧を受理しない', async () => {
  const f = await committedTradeSaveFixture(),
    saved: TradeSavedState = f.candidate;
  const command = policyCommand(saved, {}, 'manual');
  const next = rosterApplied(saved, command);
  assert.deepEqual(next.state.registration.memberships, saved.state.registration.memberships);
  const outgoing = f.request.moves.find((m) => m.fromClubId === command.clubId)!.playerId;
  command.preferences[0]!.playerId = outgoing;
  assert.throws(() => applyTradeRosterCommand(saved, command), /現在所属|重複/);
  validateTradeSavedState(next);
});

test('手動モードは希望と実登録を分離し、おまかせ選手を勝手に昇降格しない', () => {
  const f = idleDayFixture(),
    id = reserveBatter(f.initial);
  const next = rosterApplied(f.initial, policyCommand(f.initial, { [id]: 'farmFixed' }, 'manual'));
  assert.deepEqual(
    next.state.registration.registrations,
    f.initial.state.registration.registrations,
  );
  assert.equal(next.rosterReceipts![0]!.reconciliation, null);
  const tomorrow = daily(next);
  assert.deepEqual(
    tomorrow.state.registration.registrations,
    next.state.registration.registrations,
  );
  const automatic = rosterApplied(f.initial, policyCommand(f.initial, {}, 'auto'));
  assert.throws(
    () => applyTradeRosterCommand(automatic, registrationCommand(automatic)),
    /入替モードを手動/,
  );
});

test('担当球団・状態版・日付・重複選手・余分な入力項目を検査する', () => {
  const f = idleDayFixture(),
    c = registrationCommand(f.initial);
  assert.throws(
    () => applyTradeRosterCommand(f.initial, { ...c, clubId: f.request.clubIds[1] }),
    /担当球団/,
  );
  assert.throws(
    () =>
      applyTradeRosterCommand(f.initial, {
        ...c,
        expectedStateRevision: c.expectedStateRevision - 1,
      }),
    /古い/,
  );
  assert.throws(
    () => applyTradeRosterCommand(f.initial, { ...c, expectedDate: nextDate(c.expectedDate) }),
    /古い/,
  );
  assert.throws(
    () => parseTradeRosterCommand({ ...c, changes: [...c.changes, ...c.changes] }),
    /重複/,
  );
  assert.throws(() => parseTradeRosterCommand({ ...c, force: true }), /キー|項目/);
});

test('当日いずれかの試合が始まったら登録・固定希望の更新を拒否する', () => {
  const f = gameFixture(),
    next = applied(f.initial, beginCommand(f.initial));
  assert.throws(() => applyTradeRosterCommand(next, registrationCommand(next)), /試合開始後/);
  assert.throws(() => applyTradeRosterCommand(next, policyCommand(next)), /試合開始後/);
});

test('登録外になる未来の当日指定だけ解除し、有効な先発指定は保持する', () => {
  const f = gameFixture(),
    c = registrationCommand(f.initial),
    world = f.initial.state,
    id = c.changes[0]!.playerId;
  const scheduled = world.initialDefinitions.schedule.find((g) =>
    [g.homeSquadId, g.awaySquadId].includes(world.management.controlledSquadId),
  )!;
  const squad = tradeApplicationRosterState(world).squads.find(
    (s) => s.squadId === world.management.controlledSquadId,
  )!;
  const starter = squad.pitchers.rotationSlots[0]!.playerId!;
  const oldId = squad.lineup.battingOrder[0]!.playerId!;
  world.gameLineups[scheduled.gameId] = replacePlayer(squad, oldId, id).lineup;
  world.management.starterOverrides[scheduled.gameId] = starter;
  world.registration.benchOverrides[scheduled.gameId] = [
    ...squad.lineup.battingOrder.map((s) => s.playerId!),
    starter,
    id,
  ];
  const farm = tradeApplicationRosterState(world).squads.find(
    (s) => s.clubId === c.clubId && s.category === 'farm',
  )!;
  const farmGame = world.initialDefinitions.schedule.find((g) =>
    [g.homeSquadId, g.awaySquadId].includes(farm.squadId),
  )!;
  const farmReserve = reserveBatter(f.initial, 'farm'),
    farmStarter = farm.pitchers.rotationSlots[0]!.playerId!;
  c.changes.push({ playerId: farmReserve, category: 'first' });
  world.gameLineups[farmGame.gameId] = replacePlayer(
    farm,
    farm.lineup.battingOrder[0]!.playerId!,
    farmReserve,
  ).lineup;
  world.registration.benchOverrides[farmGame.gameId] = [
    ...farm.lineup.battingOrder.map((s) => s.playerId!),
    farmStarter,
    farmReserve,
  ];
  const next = rosterApplied(f.initial, c);
  assert.equal(next.state.gameLineups[farmGame.gameId], undefined);
  assert.equal(next.state.registration.benchOverrides[farmGame.gameId], undefined);
  assert.equal(next.state.gameLineups[scheduled.gameId], undefined);
  assert.equal(next.state.registration.benchOverrides[scheduled.gameId], undefined);
  assert.equal(next.state.management.starterOverrides[scheduled.gameId], starter);
  assert.deepEqual(next.rosterReceipts![0]!.audit.invalidatedOverrides, [
    { gameId: scheduled.gameId, fields: ['lineup', 'benchIds'] },
    { gameId: farmGame.gameId, fields: ['lineup', 'benchIds'] },
  ]);
  validateTradeSavedState(next);
  assert.deepEqual(next.state.registration.gameRosters, world.registration.gameRosters);
});

test('同じ指示の再送は状態を変えず、別種類とのID衝突や内容変更は拒否する', () => {
  const f = gameFixture(),
    c = registrationCommand(f.initial),
    next = rosterApplied(f.initial, c);
  assert.equal(applyTradeRosterCommand(next, c).status, 'replayed');
  assert.throws(
    () =>
      applyTradeRosterCommand(next, { ...c, changes: [{ ...c.changes[0]!, category: 'first' }] }),
    /内容が異なり/,
  );
  assert.throws(() => applyTradeGameCommand(next, beginCommand(next, c.commandId)), /編成指示/);
  assert.throws(
    () => applyTradeDayCommand(next, { ...dayCommand(next), commandId: c.commandId }),
    /再使用/,
  );
  validateTradeSavedState(next);
});

test('候補v4の復元と保存再計算は同じ状態を返し、旧v1〜v3も読み取る', async () => {
  const f = idleDayFixture(),
    next = rosterApplied(f.initial, registrationCommand(f.initial));
  next.storageRevision++;
  assert.equal(await validateTradeSaveTransition(f.initial, next), 'rosterAuto');
  const encoded = await encodeTradeSnapshot(next, null);
  assert.equal(encoded.snapshot.versions.saveFormatVersion, 'trade-application-snapshot-v4');
  assert.deepEqual(await decodeTradeSnapshot(encoded.snapshot, encoded.blocks), next);
  const oldDaily = applyTradeDayCommand(f.initial, dayCommand(f.initial));
  assert.equal(oldDaily.status, 'applied');
  if (oldDaily.status !== 'applied') return;
  for (const old of [f.initial, { ...f.initial, gameReceipts: [] }, oldDaily.snapshot]) {
    const result = await encodeTradeSnapshot(old, null);
    assert.notEqual(result.snapshot.versions.saveFormatVersion, 'trade-application-snapshot-v4');
    assert.deepEqual(await decodeTradeSnapshot(result.snapshot, result.blocks), old);
  }
});

test('監査の登録発生元・種類を跨ぐ状態版重複・保存候補の改変を拒否する', async () => {
  const f = idleDayFixture(),
    next = rosterApplied(f.initial, registrationCommand(f.initial));
  next.storageRevision++;
  const broken = structuredClone(next);
  broken.state.registration.registrations.at(-1)!.sourceId = 'forged';
  assert.throws(() => validateTradeSavedState(broken), /発生元/);
  const collision = daily(next);
  collision.rosterReceipts![0]!.committedStateRevision =
    collision.dayReceipts![0]!.committedStateRevision;
  assert.throws(() => validateTradeSavedState(collision), /版|不一致/);
  next.state.physical.players[registrationCommand(f.initial).changes[0]!.playerId]!.energyMilli = 1;
  await assert.rejects(validateTradeSaveTransition(f.initial, next), /再計算/);
});

test('旧日次指示の停止を維持し、新日次指示では編成不足の保留理由を保存する', () => {
  const f = idleDayFixture(),
    clubId = currentClub(f.initial);
  const starter = tradeApplicationRosterState(f.initial.state).squads.find(
    (s) => s.clubId === clubId && s.category === 'first',
  )!.lineup.battingOrder[0]!.playerId!;
  const saved = rosterApplied(f.initial, policyCommand(f.initial, { [starter]: 'farmFixed' }));
  assert.throws(() => applyTradeDayCommand(saved, dayCommand(saved)), /未接続/);
  const next = daily(saved),
    receipt = next.dayReceipts![0]!;
  assert.equal(receipt.modelVersion, 'trade-day-commands-v2');
  if (receipt.modelVersion !== 'trade-day-commands-v2') return;
  assert.equal(receipt.rosterResults.find((r) => r.clubId === clubId)!.status, 'pending');
  assert.equal(next.currentDate, nextDate(saved.currentDate));
  assert.deepEqual(next.state.registration.registrations, saved.state.registration.registrations);
  validateTradeSavedState(next);
});

test('一球団の固定希望保留で他球団の適用や翌日進行を止めない', () => {
  const f = idleDayFixture(),
    world = f.initial.state,
    own = currentClub(f.initial),
    partner = f.request.clubIds[1];
  const starter = tradeApplicationRosterState(world).squads.find(
    (s) => s.clubId === own && s.category === 'first',
  )!.lineup.battingOrder[0]!.playerId!;
  const reserve = reserveBatter(f.initial, 'first', partner);
  for (const [clubId, id] of [
    [own, starter],
    [partner, reserve],
  ]) {
    world.rosterControl.policies[clubId!]!.changeMode = 'auto';
    world.rosterControl.preferences.find(
      (p) => p.playerId === id && p.clubId === clubId,
    )!.preference = 'farmFixed';
  }
  const next = daily(f.initial),
    receipt = next.dayReceipts![0]!;
  assert.equal(receipt.modelVersion, 'trade-day-commands-v2');
  if (receipt.modelVersion !== 'trade-day-commands-v2') return;
  assert.equal(receipt.rosterResults.find((r) => r.clubId === own)!.status, 'pending');
  assert.equal(receipt.rosterResults.find((r) => r.clubId === partner)!.status, 'applied');
  assert.equal(
    next.state.registration.registrations.find((r) => r.playerId === reserve && r.until === null)!
      .category,
    'farm',
  );
  validateTradeSavedState(next);
});

test('固定希望なしの日次v2は既存v6の日次成長・RNGと同じ計算結果を保つ', () => {
  const f = idleDayFixture(),
    legacy = applyTradeDayCommand(f.initial, dayCommand(f.initial));
  assert.equal(legacy.status, 'applied');
  if (legacy.status !== 'applied') return;
  const next = daily(f.initial);
  assert.deepEqual(next.state, legacy.snapshot.state);
  const once = applyTradeDayCommand(next, rosterDayCommand(f.initial, 'roster-day'));
  assert.equal(once.status, 'replayed');
});
