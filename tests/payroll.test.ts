import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSalaryObligations,
  reallocateSalary,
  SalaryTransferBlocked,
} from '../src/finance/payroll.ts';
import { recordPayment } from '../src/finance/settlement.ts';
import { unpaidYen } from '../src/finance/validation.ts';
import type { ContractYear, PaymentLedger, PaymentObligation } from '../src/finance/types.ts';

// 日割りを手計算できる10日・100円の試験専用契約。ゲームの給与設定ではない。
const year: ContractYear = {
  contractId: 'test-contract',
  seasonId: 'test-season',
  salaryYen: 100,
  guaranteed: true,
  applicableFrom: '2026-06-01',
  applicableUntil: '2026-06-11',
};
function salary(): PaymentObligation[] {
  return createSalaryObligations({
    sourceId: 'test-initial',
    playerId: 'test-player',
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
}
function paid(amount: number): PaymentLedger {
  const obligations = salary();
  return recordPayment(
    { cashEntries: [], obligations },
    {
      settlementGroupId: 'test-paid',
      sourceKey: ['test-paid', '1'],
      bookedAt: { date: '2026-06-04', order: 1 },
      seasonId: year.seasonId,
      obligationId: obligations[0]!.obligationId,
      amountYen: amount,
    },
  );
}
function transfer(obligations: readonly PaymentObligation[]) {
  return reallocateSalary({
    transactionId: 'test-trade',
    playerId: 'test-player',
    fromClubId: 'test-a',
    toClubId: 'test-b',
    effectiveOn: '2026-06-06',
    year,
    obligations,
    modelVersion: 'salary-day-proration-v1',
  });
}

test('給与債務は契約年度と負担期間を持ち、明示された0円契約も記録する', () => {
  const rows = salary();
  assert.equal(rows[0]!.amountYen, 100);
  assert.deepEqual(rows[0]!.contractYearRef, {
    contractId: year.contractId,
    seasonId: year.seasonId,
  });
  assert.equal(rows[0]!.coverageUntil, '2026-06-11');
  const zero = createSalaryObligations({
    sourceId: 'test-zero',
    playerId: 'test-player',
    year: { ...year, salaryYen: 0 },
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
  assert.equal(zero.length, 1);
  assert.equal(zero[0]!.amountYen, 0);
  assert.equal(zero[0]!.status, 'settled');
});

test('既払20円を元の債務に残し、旧球団の未払30円と新球団の50円に組み替える', () => {
  const ledger = paid(20);
  const before = structuredClone(ledger);
  const result = transfer(ledger.obligations);
  assert.deepEqual(ledger, before);
  assert.equal(result.obligations[0]!.status, 'reallocated');
  assert.equal(result.obligations[0]!.settledYen, 20);
  assert.deepEqual(
    result.obligations.slice(1).map((o) => [o.payerClubId, o.amountYen, o.settledYen, o.dueDate]),
    [
      ['test-a', 30, 0, '2026-06-10'],
      ['test-b', 50, 0, '2026-06-10'],
    ],
  );
  assert.equal(
    result.obligations.reduce((total, o) => total + o.settledYen + unpaidYen(o), 0),
    100,
  );
  assert.equal(result.reallocations[0]!.preservedSettledYen, 20);
});

test('再移籍と途中支払でも既払・未払の合計と、元の現金明細を保持する', () => {
  const ledger = paid(20);
  const first = transfer(ledger.obligations);
  const incoming = first.obligations.find((o) => o.payerClubId === 'test-b')!;
  const nextPaid = recordPayment(
    { ...ledger, obligations: first.obligations },
    {
      settlementGroupId: 'test-b-paid',
      sourceKey: ['test-b-paid', '1'],
      bookedAt: { date: '2026-06-08', order: 1 },
      seasonId: year.seasonId,
      obligationId: incoming.obligationId,
      amountYen: 10,
    },
  );
  const cashBefore = structuredClone(nextPaid.cashEntries);
  const second = reallocateSalary({
    transactionId: 'test-trade-2',
    playerId: 'test-player',
    fromClubId: 'test-b',
    toClubId: 'test-a',
    effectiveOn: '2026-06-09',
    year,
    obligations: nextPaid.obligations,
    modelVersion: 'salary-day-proration-v1',
  });
  assert.deepEqual(nextPaid.cashEntries, cashBefore);
  assert.equal(
    second.obligations.reduce((total, o) => total + o.settledYen + unpaidYen(o), 0),
    100,
  );
  assert.deepEqual(
    second.obligations.slice(-2).map((o) => [o.payerClubId, o.amountYen]),
    [
      ['test-b', 20],
      ['test-a', 20],
    ],
  );
});

test('移籍前の負担額を超える前払いを、返金や債務切捨てで調整しない', () => {
  const ledger = paid(51);
  const before = structuredClone(ledger);
  assert.throws(
    () => transfer(ledger.obligations),
    (error: unknown) =>
      error instanceof SalaryTransferBlocked && error.code === 'unsupportedPrepayment',
  );
  assert.deepEqual(ledger, before);
});

test('未記録の契約対応を0円で補わず、既払＋未払が年額に合わない入力を拒否する', () => {
  assert.throws(
    () => transfer([]),
    (error: unknown) =>
      error instanceof SalaryTransferBlocked && error.code === 'missingSalaryData',
  );
  const legacy = salary().map(
    ({ contractYearRef: _reference, coverageFrom: _from, coverageUntil: _until, ...row }) => row,
  );
  assert.throws(
    () => transfer(legacy),
    (error: unknown) =>
      error instanceof SalaryTransferBlocked && error.code === 'missingSalaryData',
  );
  assert.throws(() => transfer(salary().map((o) => ({ ...o, amountYen: 99 }))));
});

test('移籍日以降の負担期間の空白・部分的な期間メタデータを拒否する', () => {
  assert.throws(() => transfer(salary().map((o) => ({ ...o, coverageUntil: '2026-06-10' }))));
  assert.throws(() => transfer(salary().map((o) => ({ ...o, coverageUntil: undefined }))));
});

test('翌年度の開始前の移籍では全未払を移し、過年度の債務は変更しない', () => {
  const obligations = salary();
  const result = reallocateSalary({
    transactionId: 'test-early',
    playerId: 'test-player',
    fromClubId: 'test-a',
    toClubId: 'test-b',
    effectiveOn: '2026-05-01',
    year,
    obligations,
    modelVersion: 'salary-day-proration-v1',
  });
  assert.equal(result.obligations.at(-1)!.amountYen, 100);
  assert.equal(result.obligations.at(-1)!.payerClubId, 'test-b');
  const past = reallocateSalary({
    transactionId: 'test-late',
    playerId: 'test-player',
    fromClubId: 'test-a',
    toClubId: 'test-b',
    effectiveOn: '2026-06-11',
    year,
    obligations,
    modelVersion: 'salary-day-proration-v1',
  });
  assert.deepEqual(past.obligations, obligations);
  assert.equal(past.reallocations.length, 0);
});

test('同じ給与組替えを重ねて適用しない', () => {
  const result = transfer(salary());
  assert.throws(() => transfer(result.obligations));
});
