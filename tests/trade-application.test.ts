import assert from 'node:assert/strict';
import test from 'node:test';
import { createTradeApplicationWorld } from '../src/world/trade-application-state.ts';
import { applyWorldTrade } from '../src/world/trade-application.ts';
import { tradeGameRoster, tradeSquadRoster } from '../src/world/trade-squad-roster.ts';
import { applicationFixture } from './helpers/trade-application-fixture.ts';

const ready = (f: ReturnType<typeof applicationFixture>) => {
  const result = applyWorldTrade(f.world, f.request);
  assert.equal(
    result.status,
    'ready',
    JSON.stringify(result.status === 'blocked' ? result.details : ''),
  );
  if (result.status !== 'ready') throw new Error('適用候補なし');
  return result.world;
};

test('所属・登録・固定希望・編成・給与・金銭を一つの分離候補へ反映する', () => {
  const f = applicationFixture(),
    before = structuredClone(f.world);
  const next = ready(f),
    incoming = f.request.moves[1]!;
  assert.deepEqual(f.world, before);
  assert.equal(
    next.registration.memberships.find((m) => m.playerId === incoming.playerId && m.until === null)!
      .clubId,
    incoming.toClubId,
  );
  assert.equal(
    next.management.idealLineups[f.ownSquadId]!.battingOrder[0]!.playerId,
    incoming.playerId,
  );
  assert.equal(
    next.rosterControl.preferences.find((r) => r.playerId === incoming.playerId)!.clubId,
    incoming.toClubId,
  );
  assert.equal(next.finance.ledger.cashEntries.filter((e) => e.category === 'trade').length, 2);
  assert.equal(next.transactions.length, 1);
  assert.equal('roster' in next.transactions[0]!, false);
  assert.equal('finance' in next.transactions[0]!, false);
});

test('個人能力・練習・成長・球種習得・調子・体力・負荷・登板履歴を保持する', () => {
  const f = applicationFixture(),
    next = ready(f);
  for (const key of [
    'growth',
    'camp',
    'condition',
    'physical',
    'stats',
    'games',
    'contributions',
    'statApplicationMarkers',
  ] as const)
    assert.deepEqual(next[key], f.world[key]);
  assert.deepEqual(next.restControl.appearances, f.world.restControl.appearances);
  assert.deepEqual(next.restControl.appliedEvents, f.world.restControl.appliedEvents);
  assert.deepEqual(next.registration.gameRosters, f.world.registration.gameRosters);
  assert.deepEqual(next.management.actions, f.world.management.actions);
  assert.equal(next.management.version, 'club-management-v2');
  if (
    next.management.version === 'club-management-v2' &&
    f.world.management.version === 'club-management-v2'
  )
    assert.deepEqual(next.management.training, f.world.management.training);
});

test('初期資料は変更せず、移籍先の候補名簿を現在所属から引き直す', () => {
  const f = applicationFixture(),
    next = ready(f),
    incoming = f.request.moves[1]!;
  assert.deepEqual(next.initialDefinitions, f.source.definitions);
  const own = tradeSquadRoster(next, f.ownSquadId),
    partner = tradeSquadRoster(next, f.partnerSquadId);
  assert.ok(own.clubPlayerIds.includes(incoming.playerId));
  assert.equal(partner.clubPlayerIds.includes(incoming.playerId), false);
  assert.equal(
    own.basePlayers.find((p) => p.playerId === incoming.playerId)!.familyName,
    f.source.definitions.squads
      .flatMap((s) => s.players)
      .find((p) => p.playerId === incoming.playerId)!.familyName,
  );
});

test('投手の個人持ち球を移籍先で参照し、旧球団の候補から除く', () => {
  const f = applicationFixture('pitcher'),
    next = ready(f),
    incoming = f.request.moves[1]!;
  const own = tradeSquadRoster(next, f.ownSquadId),
    partner = tradeSquadRoster(next, f.partnerSquadId);
  const pitches = f.source.definitions.squads
    .flatMap((s) => s.pitches)
    .filter((p) => p.playerId === incoming.playerId);
  assert.ok(pitches.length);
  assert.deepEqual(
    own.basePitches.filter((p) => p.playerId === incoming.playerId),
    pitches,
  );
  assert.equal(
    partner.basePitches.some((p) => p.playerId === incoming.playerId),
    false,
  );
  assert.equal(own.pitchers.rotationSlots[0]!.playerId, incoming.playerId);
});

test('取引外の球団の設定を変更せず、関係する一二軍の編成版を一度だけ増やす', () => {
  const f = applicationFixture(),
    next = ready(f);
  for (const squad of f.world.initialDefinitions.squads.concat(
    f.world.initialDefinitions.farm!.squads.map((s) => ({
      ...f.world.initialDefinitions.squads[0]!,
      ...s,
    })),
  )) {
    const affected = f.request.clubIds.includes(squad.team.clubId);
    assert.equal(
      next.management.policyRevisions[squad.squadId],
      f.world.management.policyRevisions[squad.squadId]! + (affected ? 1 : 0),
    );
    if (!affected)
      assert.deepEqual(
        next.management.idealLineups[squad.squadId],
        f.world.management.idealLineups[squad.squadId],
      );
  }
  for (const [clubId, policy] of Object.entries(f.world.rosterControl.policies))
    assert.equal(
      next.rosterControl.policies[clubId]!.policyRevision,
      policy.policyRevision + (f.request.clubIds.includes(clubId) ? 1 : 0),
    );
});

test('旧球団の個別休養・条件別救援を解除し、受入先へ持ち込まない', () => {
  const f = applicationFixture('pitcher'),
    out = f.request.moves[0]!;
  const rest = f.world.restControl.pitcherUsagePlans[f.ownSquadId]!;
  rest.individualRest = rest.individualRest.filter((r) => r.playerId !== out.playerId);
  rest.individualRest.push({ playerId: out.playerId, mode: 'inherit' });
  const relief = f.world.reliefControl.teamPolicies[f.ownSquadId]!;
  const reliefRevision = relief.policyRevision;
  relief.reliefRoles.push({
    playerId: out.playerId,
    role: 'relief',
    priority: 1,
    conditions: {
      startInning: 1,
      endInning: 12,
      scoreStates: ['lead', 'tied', 'trailing'],
      minScoreDifference: null,
      maxScoreDifference: null,
    },
  });
  const before = f.world.restControl.teamPolicies[f.ownSquadId]!.policyRevision;
  const next = ready(f);
  assert.equal(
    next.restControl.pitcherUsagePlans[f.ownSquadId]!.individualRest.some(
      (p) => p.playerId === out.playerId,
    ),
    false,
  );
  assert.equal(
    next.restControl.pitcherUsagePlans[f.partnerSquadId]!.individualRest.some(
      (p) => p.playerId === out.playerId,
    ),
    false,
  );
  assert.equal(next.restControl.teamPolicies[f.ownSquadId]!.policyRevision, before + 1);
  assert.equal(
    next.reliefControl.teamPolicies[f.ownSquadId]!.reliefRoles.some(
      (r) => r.playerId === out.playerId,
    ),
    false,
  );
  assert.equal(next.reliefControl.teamPolicies[f.ownSquadId]!.policyRevision, reliefRevision + 1);
});

test('過去の指定を保ち、無効な未開始の打順・ベンチだけを解除する', () => {
  const f = applicationFixture();
  const game = f.world.initialDefinitions.schedule.find(
    (g) => g.date >= f.world.currentDate && [g.homeSquadId, g.awaySquadId].includes(f.ownSquadId),
  )!;
  const pastId = 'test-past-game';
  f.world.initialDefinitions.schedule.push({ ...game, gameId: pastId, date: '2026-09-01' });
  for (const id of [game.gameId, pastId]) {
    f.world.gameLineups[id] = structuredClone(f.world.management.idealLineups[f.ownSquadId]!);
    f.world.registration.benchOverrides[id] = tradeSquadRoster(
      f.world,
      f.ownSquadId,
    ).registeredPlayerIds;
  }
  const old = structuredClone(f.world.gameLineups[pastId]);
  const next = ready(f);
  assert.deepEqual(next.gameLineups[pastId], old);
  assert.equal(next.gameLineups[game.gameId], undefined);
  assert.equal(next.registration.benchOverrides[game.gameId], undefined);
  assert.ok(
    next.transactions[0]!.rosterAudit.invalidatedOverrides.some((a) => a.gameId === game.gameId),
  );
});

test('二軍移籍は二軍名簿へ反映し、再登録可能日を消さない', () => {
  const f = applicationFixture('batter', 'farm');
  const playerId = f.request.moves[1]!.playerId;
  f.world.registration.registrations.find(
    (r) => r.playerId === playerId && r.until === null,
  )!.nextFirstEligibleOn = '2026-10-04';
  const next = ready(f),
    roster = tradeSquadRoster(next, f.ownSquadId);
  assert.equal(roster.category, 'farm');
  assert.ok(roster.registeredPlayerIds.includes(playerId));
  assert.equal(
    next.registration.registrations.find((r) => r.playerId === playerId && r.until === null)!
      .nextFirstEligibleOn,
    '2026-10-04',
  );
});

test('不足予算・未記録予算では部分的な世界を返さない', () => {
  for (const missing of [false, true]) {
    const f = applicationFixture();
    const budget = f.world.finance.budgets.find((b) => b.clubId === f.request.clubIds[0])!;
    budget.openingBalance = missing ? null : { ...budget.openingBalance!, balanceYen: 0 };
    const before = structuredClone(f.world),
      result = applyWorldTrade(f.world, f.request);
    assert.equal(result.status, 'blocked');
    assert.equal('world' in result, false);
    assert.deepEqual(f.world, before);
  }
});

test('当日の試合開始後は、指定がなくても適用候補を作らない', () => {
  const f = applicationFixture();
  f.world.dayPlan.cursor = 1;
  assert.equal(applyWorldTrade(f.world, f.request).status, 'blocked');
});

test('方針版の上限で止まる場合も元世界と台帳を保つ', () => {
  const f = applicationFixture();
  f.world.management.policyRevisions[f.ownSquadId] = Number.MAX_SAFE_INTEGER;
  const before = structuredClone(f.world);
  assert.throws(() => applyWorldTrade(f.world, f.request), /方針版/);
  assert.deepEqual(f.world, before);
});

test('同じ取引の再適用と、所属基準以前の時点を拒否する', () => {
  const f = applicationFixture(),
    next = ready(f);
  assert.throws(
    () =>
      applyWorldTrade(next, { ...f.request, effectiveAt: { ...f.request.effectiveAt, order: 2 } }),
    /適用済み/,
  );
  assert.throws(
    () => applyWorldTrade(f.world, { ...f.request, effectiveAt: { ...f.world.rosterAsOf } }),
    /所属基準/,
  );
});

test('欠けた全選手資格・契約を生成せず、候補の初期化を拒否する', () => {
  const f = applicationFixture();
  const data = {
    asOf: f.world.rosterAsOf,
    playerFacts: f.world.playerFacts,
    finance: f.world.finance,
    approvals: [],
  };
  assert.throws(
    () =>
      createTradeApplicationWorld(f.source, { ...data, playerFacts: data.playerFacts.slice(1) }),
    /全選手/,
  );
  assert.throws(
    () =>
      createTradeApplicationWorld(f.source, {
        ...data,
        finance: { ...data.finance, contractYears: [] },
      }),
    /全所属選手/,
  );
});

test('試合ベンチは明示選択だけを使い、移籍済み選手・重複・先発不足を拒否する', () => {
  const f = applicationFixture(),
    next = ready(f),
    roster = tradeSquadRoster(next, f.ownSquadId);
  const starter = roster.pitchers.rotationSlots[0]!.playerId!;
  const benchIds = [...roster.lineup.map((p) => p.playerId), starter];
  const game = tradeGameRoster(next, {
    squadId: f.ownSquadId,
    benchIds,
    startingPitcherId: starter,
  });
  assert.deepEqual(game.benchIds, benchIds);
  assert.equal(game.basePlayers.length, benchIds.length);
  for (const invalid of [
    [...benchIds, benchIds[0]!],
    benchIds.slice(1),
    [...benchIds, f.request.moves[0]!.playerId],
  ])
    assert.throws(() =>
      tradeGameRoster(next, {
        squadId: f.ownSquadId,
        benchIds: invalid,
        startingPitcherId: starter,
      }),
    );
});

test('外国人ベンチ枠を現在の明示資格で検査し、名簿の出力を変更しても正本へ波及しない', () => {
  const f = applicationFixture(),
    next = ready(f),
    roster = tradeSquadRoster(next, f.ownSquadId);
  const starter = roster.pitchers.rotationSlots[0]!.playerId!;
  const benchIds = [...roster.lineup.map((p) => p.playerId), starter];
  next.initialDefinitions.registrationRules!.foreignBenchLimit = 0;
  next.playerFacts.find((p) => p.playerId === benchIds[0])!.foreignBaseStatus = 'subject';
  assert.throws(
    () => tradeGameRoster(next, { squadId: f.ownSquadId, benchIds, startingPitcherId: starter }),
    /外国人ベンチ/,
  );
  const before = structuredClone(next);
  roster.basePlayers[0]!.familyName = '出力だけの変更';
  roster.clubPlayerIds.length = 0;
  assert.deepEqual(next, before);
});

test('交換対象以外の給与債務の欠損も予算審査の前に拒否する', () => {
  const f = applicationFixture();
  const outside = f.world.playerFacts.find(
    (p) => !f.request.moves.some((m) => m.playerId === p.playerId),
  )!;
  f.world.finance.ledger.obligations = f.world.finance.ledger.obligations.filter(
    (o) => o.payeeRef.id !== outside.playerId,
  );
  const before = structuredClone(f.world);
  assert.throws(() => applyWorldTrade(f.world, f.request), /給与債務が未記録/);
  assert.deepEqual(f.world, before);
});

test('投手の持ち球が欠ける場合、初期球種や能力を生成して名簿を完成させない', () => {
  const f = applicationFixture('pitcher'),
    next = ready(f),
    incoming = f.request.moves[1]!.playerId;
  for (const squad of next.initialDefinitions.squads)
    squad.pitches = squad.pitches.filter((p) => p.playerId !== incoming);
  assert.throws(() => tradeSquadRoster(next, f.ownSquadId), /持ち球資料/);
  for (const squad of f.world.initialDefinitions.squads)
    squad.pitches = squad.pitches.filter((p) => p.playerId !== incoming);
  assert.throws(() => applyWorldTrade(f.world, f.request), /持ち球資料/);
});
