import assert from 'node:assert/strict';
import test from 'node:test';
import { SALARY_PRORATION_POLICY } from '../config/finance.ts';
import { calculateBudget } from '../src/finance/budget.ts';
import {
  allocateSalaryYear,
  createContractYears,
  salaryCoverageForYear,
} from '../src/finance/contracts.ts';
import { recordPayment } from '../src/finance/settlement.ts';
import type {
  BudgetInput,
  CashEntry,
  ContractYear,
  PaymentLedger,
  PaymentObligation,
  PaymentSettlement,
} from '../src/finance/types.ts';

/** このファイルの球団・契約ID・金額は試験専用で、ゲームの初期データではない。 */
function obligation(overrides: Partial<PaymentObligation> = {}): PaymentObligation {
  return {
    obligationId: 'test-obligation',
    seasonId: 'test-season',
    payerClubId: 'test-club-a',
    payeeRef: { kind: 'club', id: 'test-club-b' },
    kind: 'trade',
    amountYen: 400,
    settledYen: 0,
    guaranteed: true,
    sourceKey: ['test-trade', 'one'],
    dueDate: '2026-06-01',
    status: 'open',
    ...overrides,
  };
}

function payment(overrides: Partial<PaymentSettlement> = {}): PaymentSettlement {
  return {
    settlementGroupId: 'test-payment-1',
    sourceKey: ['test-trade', 'one', 'settlement', '1'],
    bookedAt: { date: '2026-06-01', order: 2 },
    seasonId: 'test-season',
    obligationId: 'test-obligation',
    amountYen: 200,
    ...overrides,
  };
}

function budget(overrides: Partial<BudgetInput> = {}): BudgetInput {
  return {
    clubId: 'test-club-a',
    seasonId: 'test-season',
    openingBalance: { balanceYen: 0, closedThrough: { date: '2026-02-01', order: 2 } },
    cashEntries: [],
    obligations: [],
    holds: [],
    futureSeasons: [],
    ...overrides,
  };
}

function cash(id: string, amount: number, date: string, order: number): CashEntry {
  return {
    cashEntryId: id,
    clubId: 'test-club-a',
    bookedAt: { date, order },
    seasonId: 'test-season',
    category: 'revenue',
    signedAmountYen: amount,
    sourceKey: ['test-revenue', id],
    settlementGroupId: id,
  };
}

const leapYear: ContractYear = {
  contractId: 'test-contract',
  seasonId: 'test-leap',
  salaryYen: 10,
  guaranteed: true,
  applicableFrom: '2028-02-28',
  applicableUntil: '2028-03-02',
};

test('契約総年俸の円端数は最終年へ残し、契約金を年俸へ混ぜない', () => {
  const seasons = [2026, 2027, 2028].map((year) => ({
    seasonId: `test-${year}`,
    ...salaryCoverageForYear(year, SALARY_PRORATION_POLICY),
  }));
  const original = structuredClone(seasons);
  const years = createContractYears(
    'test-contract',
    { startSeasonId: 'test-2026', years: 3, totalSalaryYen: 100, bonusYen: 9 },
    seasons,
    true,
  );
  assert.deepEqual(
    years.map((y) => y.salaryYen),
    [33, 33, 34],
  );
  assert.deepEqual(seasons, original);
  assert.equal(years[0]!.applicableFrom, '2026-02-01');
  assert.equal(years[0]!.applicableUntil, '2026-12-01');
});

test('契約年度の重複・期間重複・存在しない日・不正金額を拒否する', () => {
  const terms = { startSeasonId: 'test-a', years: 2, totalSalaryYen: 101, bonusYen: 0 };
  const first = { seasonId: 'test-a', applicableFrom: '2026-02-01', applicableUntil: '2026-12-01' };
  assert.throws(() => createContractYears('test-c', terms, [first, first], true));
  assert.throws(() =>
    createContractYears('test-c', terms, [first, { ...first, seasonId: 'test-b' }], true),
  );
  assert.throws(() =>
    createContractYears(
      'test-c',
      { ...terms, years: 1 },
      [{ ...first, applicableFrom: '2026-02-30' }],
      true,
    ),
  );
  assert.throws(() =>
    createContractYears('test-c', { ...terms, years: 1, totalSalaryYen: 0.5 }, [first], true),
  );
});

test('うるう日を含む再移籍で給与期間・総額を保存し、再分割でも以前の配分を変えない', () => {
  const before = {
    payerClubId: 'test-club-a',
    coverageFrom: '2028-02-28',
    coverageUntil: '2028-02-29',
  };
  const firstTrade = allocateSalaryYear(
    leapYear,
    [
      before,
      { payerClubId: 'test-club-b', coverageFrom: '2028-02-29', coverageUntil: '2028-03-02' },
    ],
    'salary-day-proration-v1',
  );
  const secondTrade = allocateSalaryYear(
    leapYear,
    [
      before,
      { payerClubId: 'test-club-b', coverageFrom: '2028-02-29', coverageUntil: '2028-03-01' },
      { payerClubId: 'test-club-c', coverageFrom: '2028-03-01', coverageUntil: '2028-03-02' },
    ],
    'salary-day-proration-v1',
  );
  assert.deepEqual(
    firstTrade.map((p) => p.amountYen),
    [3, 7],
  );
  assert.deepEqual(
    secondTrade.map((p) => p.amountYen),
    [3, 3, 4],
  );
  assert.equal(secondTrade[0]!.amountYen, firstTrade[0]!.amountYen);
  assert.equal(
    secondTrade.reduce((sum, p) => sum + p.amountYen, 0),
    10,
  );
});

test('給与負担期間の空白・重複・末尾不足を自動補完しない', () => {
  const part = {
    payerClubId: 'test-club-a',
    coverageFrom: '2028-02-28',
    coverageUntil: '2028-02-29',
  };
  assert.throws(() => allocateSalaryYear(leapYear, [part], 'salary-day-proration-v1'));
  assert.throws(() =>
    allocateSalaryYear(
      leapYear,
      [part, { ...part, coverageFrom: '2028-03-01', coverageUntil: '2028-03-02' }],
      'salary-day-proration-v1',
    ),
  );
  assert.throws(() =>
    allocateSalaryYear(
      leapYear,
      [part, { ...part, coverageUntil: '2028-03-02' }],
      'salary-day-proration-v1',
    ),
  );
});

test('残高確定以前の入金を再計上せず、未払・仮確保・将来不足を控除する', () => {
  const current = obligation({ amountYen: 300, settledYen: 50, status: 'partlySettled' });
  const future = obligation({
    obligationId: 'test-future',
    seasonId: 'test-next',
    amountYen: 600,
    sourceKey: ['test-contract', 'next'],
  });
  const result = calculateBudget(
    budget({
      openingBalance: { balanceYen: 1000, closedThrough: { date: '2026-02-01', order: 2 } },
      cashEntries: [
        cash('old', 900, '2026-02-01', 2),
        cash('new-out', -100, '2026-02-01', 3),
        cash('new-in', 50, '2026-02-02', 0),
      ],
      obligations: [current, future],
      holds: [
        {
          holdId: 'test-active',
          clubId: 'test-club-a',
          seasonId: 'test-season',
          sourceKey: ['test-hold', 'active'],
          amountYen: 80,
          status: 'active',
          replacedByObligationIds: [],
        },
        {
          holdId: 'test-replaced',
          clubId: 'test-club-a',
          seasonId: 'test-season',
          sourceKey: ['test-hold', 'replaced'],
          amountYen: 90,
          status: 'replaced',
          replacedByObligationIds: [current.obligationId],
        },
      ],
      futureSeasons: [
        { seasonId: 'test-next', guaranteedIncomeYen: 500, minimumReplenishmentYen: 100 },
      ],
    }),
  );
  assert.equal(result.status, 'known');
  if (result.status !== 'known') return;
  assert.deepEqual(
    [
      result.cashYen,
      result.currentUnpaidYen,
      result.activeHoldsYen,
      result.futureReserveYen,
      result.availableYen,
    ],
    [950, 250, 80, 200, 420],
  );
});

test('未記録の予算と記録済み0円を区別し、対象外年度の未払を見落とさない', () => {
  assert.equal(calculateBudget(budget()).status, 'known');
  assert.equal(calculateBudget(budget({ openingBalance: null })).status, 'unknown');
  assert.equal(calculateBudget(budget({ obligations: null })).status, 'unknown');
  assert.equal(
    calculateBudget(
      budget({
        futureSeasons: [
          { seasonId: 'test-next', guaranteedIncomeYen: null, minimumReplenishmentYen: 0 },
        ],
      }),
    ).status,
    'unknown',
  );
  assert.equal(
    calculateBudget(budget({ obligations: [obligation({ seasonId: 'uncovered-season' })] })).status,
    'unknown',
  );
  assert.equal(calculateBudget(budget({ obligations: [obligation()] })).status, 'known');
  const insufficient = calculateBudget(budget({ obligations: [obligation()] }));
  if (insufficient.status === 'known') assert.equal(insufficient.availableYen, -400);
});

test('円の安全な整数範囲を超える集計を丸めて保存しない', () => {
  assert.throws(() =>
    calculateBudget(
      budget({
        openingBalance: {
          balanceYen: Number.MAX_SAFE_INTEGER,
          closedThrough: { date: '2026-02-01', order: 0 },
        },
        cashEntries: [cash('overflow', 1, '2026-02-02', 0)],
      }),
    ),
  );
});

test('球団間の分割支払は両明細と債務を一緒に返し、再送で二重計上しない', () => {
  const original: PaymentLedger = { cashEntries: [], obligations: [obligation()] };
  const snapshot = structuredClone(original);
  const once = recordPayment(original, payment());
  assert.deepEqual(original, snapshot);
  assert.equal(once.cashEntries.length, 2);
  assert.deepEqual(
    once.cashEntries.map((e) => e.signedAmountYen),
    [-200, 200],
  );
  assert.equal(once.obligations[0]!.status, 'partlySettled');
  assert.strictEqual(recordPayment(once, payment()), once);
  const twice = recordPayment(
    once,
    payment({
      settlementGroupId: 'test-payment-2',
      sourceKey: ['test-trade', 'one', 'settlement', '2'],
    }),
  );
  assert.equal(twice.obligations[0]!.settledYen, 400);
  assert.equal(twice.obligations[0]!.status, 'settled');
  assert.equal(
    twice.cashEntries.reduce((sum, e) => sum + e.signedAmountYen, 0),
    0,
  );
  assert.strictEqual(recordPayment(twice, payment()), twice);
});

test('同じ精算IDの条件変更・発生元再利用・片側明細を拒否し、入力を部分更新しない', () => {
  const once = recordPayment({ cashEntries: [], obligations: [obligation()] }, payment());
  const snapshot = structuredClone(once);
  assert.throws(() => recordPayment(once, payment({ amountYen: 100 })));
  assert.throws(() => recordPayment(once, payment({ settlementGroupId: 'other-group' })));
  assert.throws(() =>
    recordPayment({ ...once, cashEntries: once.cashEntries.slice(0, 1) }, payment()),
  );
  assert.throws(() =>
    recordPayment(
      once,
      payment({ settlementGroupId: 'overpay', sourceKey: ['overpay'], amountYen: 201 }),
    ),
  );
  assert.deepEqual(once, snapshot);
});

test('選手宛ての年俸は球団の支出だけを記録し、相手球団の入金を捏造しない', () => {
  const result = recordPayment(
    {
      cashEntries: [],
      obligations: [
        obligation({ payeeRef: { kind: 'player', id: 'test-player' }, kind: 'salary' }),
      ],
    },
    payment(),
  );
  assert.equal(result.cashEntries.length, 1);
  assert.equal(result.cashEntries[0]!.signedAmountYen, -200);
  assert.equal(result.cashEntries[0]!.counterpartyClubId, undefined);
});
