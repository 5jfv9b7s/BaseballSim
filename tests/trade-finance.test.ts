import assert from 'node:assert/strict';
import test from 'node:test';
import { createSalaryObligations } from '../src/finance/payroll.ts';
import { recordPayment } from '../src/finance/settlement.ts';
import { planTradeFinances } from '../src/recruitment/trade-finance.ts';
import type {
  TradeBudgetContext,
  TradeFinanceInput,
} from '../src/recruitment/trade-finance-types.ts';
import type { ContractYear } from '../src/finance/types.ts';

// 試験専用の10日100円契約。初期資金やゲーム内の経済係数とは無関係。
function context(clubId: string): TradeBudgetContext {
  return {
    clubId,
    seasonId: 'test-season',
    openingBalance: { balanceYen: 500, closedThrough: { date: '2026-06-05', order: 0 } },
    holds: [],
    futureSeasons: [],
  };
}

function nextContext(budget: TradeBudgetContext): TradeBudgetContext {
  return {
    ...budget,
    futureSeasons: [{ seasonId: 'test-next', guaranteedIncomeYen: 0, minimumReplenishmentYen: 0 }],
  };
}

function sample(): TradeFinanceInput {
  const year: ContractYear = {
    contractId: 'test-contract-b',
    seasonId: 'test-season',
    salaryYen: 100,
    guaranteed: true,
    applicableFrom: '2026-06-01',
    applicableUntil: '2026-06-11',
  };
  const obligations = createSalaryObligations({
    sourceId: 'test-initial-b',
    playerId: 'test-player-b',
    year,
    periods: [
      {
        payerClubId: 'test-b',
        coverageFrom: year.applicableFrom,
        coverageUntil: year.applicableUntil,
      },
    ],
    dueDate: '2026-06-10',
    modelVersion: 'salary-day-proration-v1',
  });
  const ledger = recordPayment(
    { cashEntries: [], obligations },
    {
      settlementGroupId: 'test-paid',
      sourceKey: ['test-paid', '1'],
      bookedAt: { date: '2026-06-04', order: 1 },
      seasonId: year.seasonId,
      obligationId: obligations[0]!.obligationId,
      amountYen: 20,
    },
  );
  return {
    transactionId: 'test-trade',
    seasonId: 'test-season',
    effectiveAt: { date: '2026-06-06', order: 2 },
    clubIds: ['test-a', 'test-b'],
    moves: [{ playerId: 'test-player-b', fromClubId: 'test-b', toClubId: 'test-a' }],
    contractYears: [{ playerId: 'test-player-b', year }],
    cashTransfer: { payerClubId: 'test-a', payeeClubId: 'test-b', amountYen: 40 },
    ledger,
    budgets: [context('test-a'), context('test-b')],
    salaryModelVersion: 'salary-day-proration-v1',
  };
}

test('金銭＋給与の全案で両球団を審査し、提示金銭を二重に予算から引かない', () => {
  const input = sample();
  const before = structuredClone(input);
  const result = planTradeFinances(input);
  assert.deepEqual(input, before);
  assert.equal(result.status, 'ready');
  if (result.status !== 'ready') return;
  assert.deepEqual(
    result.budgets.map(({ after }) =>
      after?.status === 'known'
        ? [after.cashYen, after.currentUnpaidYen, after.availableYen]
        : null,
    ),
    [
      [460, 50, 410],
      [540, 30, 510],
    ],
  );
  assert.equal(result.ledger.cashEntries.length, 3);
  assert.equal(
    result.ledger.obligations.find((o) => o.obligationId === result.cashObligationId)!.status,
    'settled',
  );
  assert.throws(() => planTradeFinances({ ...input, ledger: result.ledger }));
});

test('獲得側の予算不足で、適用用ledgerや部分的な更新を返さない', () => {
  const input = sample();
  input.budgets[0].openingBalance!.balanceYen = 50;
  const before = structuredClone(input);
  const result = planTradeFinances(input);
  assert.equal(result.status, 'blocked');
  assert.equal('ledger' in result, false);
  if (result.status === 'blocked')
    assert.ok(
      result.blockers.some((b) => b.code === 'insufficientBudget' && b.clubId === 'test-a'),
    );
  assert.deepEqual(input, before);
});

test('放出側の予算不足も止め、成立後に解消する不足は成立前だけで拒否しない', () => {
  const input = sample();
  input.budgets[1].openingBalance!.balanceYen = 0;
  const relieved = planTradeFinances(input);
  assert.equal(relieved.status, 'ready');
  const result = planTradeFinances({
    ...input,
    cashTransfer: { ...input.cashTransfer, amountYen: 10 },
  });
  assert.equal(result.status, 'blocked');
  if (result.status === 'blocked')
    assert.ok(
      result.blockers.some((b) => b.code === 'insufficientBudget' && b.clubId === 'test-b'),
    );
});

test('未記録の残高・将来保証を0円として審査しない', () => {
  const input = sample();
  const missingBalance = planTradeFinances({
    ...input,
    budgets: [{ ...input.budgets[0], openingBalance: null }, input.budgets[1]],
  });
  assert.equal(missingBalance.status, 'blocked');
  assert.equal('ledger' in missingBalance, false);
  const missingFuture = planTradeFinances({
    ...input,
    budgets: [{ ...input.budgets[0], futureSeasons: null }, input.budgets[1]],
  });
  assert.equal(missingFuture.status, 'blocked');
  if (missingFuture.status === 'blocked')
    assert.ok(missingFuture.blockers.some((b) => b.code === 'unknownBudget'));
});

test('翌年度の給与を入力から落とした移籍案を通さない', () => {
  const input = sample();
  const year = {
    ...input.contractYears[0]!.year,
    seasonId: 'test-next',
    applicableFrom: '2027-06-01',
    applicableUntil: '2027-06-11',
  };
  const next = createSalaryObligations({
    sourceId: 'test-next-salary',
    playerId: 'test-player-b',
    year,
    periods: [
      {
        payerClubId: 'test-b',
        coverageFrom: year.applicableFrom,
        coverageUntil: year.applicableUntil,
      },
    ],
    dueDate: '2027-06-10',
    modelVersion: 'salary-day-proration-v1',
  });
  const result = planTradeFinances({
    ...input,
    ledger: { ...input.ledger, obligations: [...input.ledger.obligations, ...next] },
  });
  assert.equal(result.status, 'blocked');
  if (result.status === 'blocked')
    assert.ok(result.blockers.some((b) => b.code === 'missingSalaryData'));
});

test('将来給与の不足予約も移籍先へ移し、当季だけでは通せる案を止める', () => {
  const input = sample();
  input.budgets[0].openingBalance!.balanceYen = 100;
  const future = {
    ...input.contractYears[0]!.year,
    seasonId: 'test-next',
    applicableFrom: '2027-06-01',
    applicableUntil: '2027-06-11',
  };
  const next = createSalaryObligations({
    sourceId: 'test-next-salary',
    playerId: 'test-player-b',
    year: future,
    periods: [
      {
        payerClubId: 'test-b',
        coverageFrom: future.applicableFrom,
        coverageUntil: future.applicableUntil,
      },
    ],
    dueDate: '2027-06-10',
    modelVersion: 'salary-day-proration-v1',
  });
  const result = planTradeFinances({
    ...input,
    contractYears: [...input.contractYears, { playerId: 'test-player-b', year: future }],
    ledger: { ...input.ledger, obligations: [...input.ledger.obligations, ...next] },
    budgets: [nextContext(input.budgets[0]), nextContext(input.budgets[1])],
  });
  assert.equal(result.status, 'blocked');
  const after = result.budgets[0]!.after;
  assert.equal(after?.status, 'known');
  if (after?.status === 'known') assert.equal(after.futureReserveYen, 100);
});

test('金銭0の選手交換では金銭債務と現金明細を追加しない', () => {
  const input = sample();
  const year = { ...input.contractYears[0]!.year, contractId: 'test-contract-a' };
  const outgoing = createSalaryObligations({
    sourceId: 'test-initial-a',
    playerId: 'test-player-a',
    year,
    periods: [
      {
        payerClubId: 'test-a',
        coverageFrom: year.applicableFrom,
        coverageUntil: year.applicableUntil,
      },
    ],
    dueDate: '2026-06-10',
    modelVersion: 'salary-day-proration-v1',
  });
  const result = planTradeFinances({
    ...input,
    moves: [
      ...input.moves,
      { playerId: 'test-player-a', fromClubId: 'test-a', toClubId: 'test-b' },
    ],
    contractYears: [...input.contractYears, { playerId: 'test-player-a', year }],
    cashTransfer: { ...input.cashTransfer, amountYen: 0 },
    ledger: { ...input.ledger, obligations: [...input.ledger.obligations, ...outgoing] },
  });
  assert.equal(result.status, 'ready');
  if (result.status === 'ready') {
    assert.equal(result.cashObligationId, null);
    assert.deepEqual(result.ledger.cashEntries, input.ledger.cashEntries);
  }
});

test('残高確定以前の取引や、未来の入金を利用する取引案を拒否する', () => {
  const input = sample();
  assert.throws(() =>
    planTradeFinances({ ...input, effectiveAt: input.budgets[0].openingBalance!.closedThrough }),
  );
  const entry = { ...input.ledger.cashEntries[0]!, bookedAt: { date: '2026-06-07', order: 0 } };
  assert.throws(() =>
    planTradeFinances({ ...input, ledger: { ...input.ledger, cashEntries: [entry] } }),
  );
});

test('未払契約金を切り捨てたり、移籍後の負担球団を無断で決めたりしない', () => {
  const input = sample();
  const bonus = {
    obligationId: 'test-bonus',
    sourceKey: ['test-bonus'],
    payerClubId: 'test-b',
    payeeRef: { kind: 'player' as const, id: 'test-player-b' },
    kind: 'signingBonus' as const,
    amountYen: 10,
    settledYen: 0,
    status: 'open' as const,
    guaranteed: true,
    dueDate: '2026-06-10',
    seasonId: 'test-season',
  };
  const result = planTradeFinances({
    ...input,
    ledger: { ...input.ledger, obligations: [...input.ledger.obligations, bonus] },
  });
  assert.equal(result.status, 'blocked');
  assert.equal('ledger' in result, false);
  if (result.status === 'blocked')
    assert.ok(result.blockers.some((b) => b.code === 'unsupportedContractDebt'));
});

test('二人目の給与で止まった場合も、一人目の組替えを部分適用しない', () => {
  const input = sample();
  const year = { ...input.contractYears[0]!.year, contractId: 'test-contract-a' };
  const outgoing = createSalaryObligations({
    sourceId: 'test-initial-a',
    playerId: 'test-player-a',
    year,
    periods: [
      {
        payerClubId: 'test-a',
        coverageFrom: year.applicableFrom,
        coverageUntil: year.applicableUntil,
      },
    ],
    dueDate: '2026-06-10',
    modelVersion: 'salary-day-proration-v1',
  });
  const ledger = recordPayment(
    { ...input.ledger, obligations: [...input.ledger.obligations, ...outgoing] },
    {
      settlementGroupId: 'test-a-prepaid',
      sourceKey: ['test-a-prepaid', '1'],
      bookedAt: { date: '2026-06-04', order: 2 },
      seasonId: year.seasonId,
      obligationId: outgoing[0]!.obligationId,
      amountYen: 51,
    },
  );
  const proposal: TradeFinanceInput = {
    ...input,
    ledger,
    moves: [
      ...input.moves,
      { playerId: 'test-player-a', fromClubId: 'test-a', toClubId: 'test-b' },
    ],
    contractYears: [...input.contractYears, { playerId: 'test-player-a', year }],
  };
  const before = structuredClone(proposal);
  const result = planTradeFinances(proposal);
  assert.equal(result.status, 'blocked');
  assert.equal('ledger' in result, false);
  assert.ok(result.budgets.every((b) => b.after === null));
  if (result.status === 'blocked')
    assert.ok(
      result.blockers.some(
        (b) => b.code === 'unsupportedPrepayment' && b.playerId === 'test-player-a',
      ),
    );
  assert.deepEqual(proposal, before);
});
