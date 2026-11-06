import { allocateSalaryYear } from './contracts.ts';
import type {
  ContractYear,
  PaymentObligation,
  SalaryPayerPeriod,
  SalaryProrationPolicy,
} from './types.ts';
import {
  dateDays,
  financeId,
  requireFinance,
  sumYen,
  unpaidYen,
  validateObligations,
} from './validation.ts';

export interface SalaryObligation extends PaymentObligation {
  kind: 'salary';
  contractYearRef: { contractId: string; seasonId: string };
  coverageFrom: string;
  coverageUntil: string;
}

export type SalaryTransferBlockCode = 'missingSalaryData' | 'unsupportedPrepayment';

/** 不正な入力とは別に、未記録や未対応の前払いを上位の提出理由へ返す。 */
export class SalaryTransferBlocked extends Error {
  readonly code: SalaryTransferBlockCode;

  constructor(code: SalaryTransferBlockCode, message: string) {
    super(message);
    this.name = 'SalaryTransferBlocked';
    this.code = code;
  }
}

export interface SalaryReallocation {
  sourceObligationId: string;
  replacementObligationIds: string[];
  preservedSettledYen: number;
  retainedUnpaidYen: number;
  transferredUnpaidYen: number;
}

export interface SalaryTransferInput {
  transactionId: string;
  playerId: string;
  fromClubId: string;
  toClubId: string;
  effectiveOn: string;
  year: ContractYear;
  obligations: readonly PaymentObligation[];
  modelVersion: SalaryProrationPolicy['version'];
}

/** 全期間の給与債務を明示データから作る。呼び出し元が重複・予算・保存を管理する。 */
export function createSalaryObligations(input: {
  sourceId: string;
  playerId: string;
  year: ContractYear;
  periods: readonly SalaryPayerPeriod[];
  dueDate: string;
  modelVersion: SalaryProrationPolicy['version'];
}): SalaryObligation[] {
  financeId(input.sourceId);
  financeId(input.playerId);
  dateDays(input.dueDate);
  requireFinance(typeof input.year.guaranteed === 'boolean', '給与の保証区分が未記録です');
  const allocations = allocateSalaryYear(input.year, input.periods, input.modelVersion);
  const obligations: SalaryObligation[] = allocations.map((allocation) => {
    const key = [
      'salary-obligation-v1',
      input.sourceId,
      input.year.contractId,
      input.year.seasonId,
      allocation.payerClubId,
      allocation.coverageFrom,
      allocation.coverageUntil,
    ];
    return {
      obligationId: JSON.stringify(key),
      sourceKey: key,
      contractYearRef: { contractId: input.year.contractId, seasonId: input.year.seasonId },
      seasonId: input.year.seasonId,
      payerClubId: allocation.payerClubId,
      payeeRef: { kind: 'player', id: input.playerId },
      kind: 'salary',
      coverageFrom: allocation.coverageFrom,
      coverageUntil: allocation.coverageUntil,
      amountYen: allocation.amountYen,
      settledYen: 0,
      guaranteed: input.year.guaranteed,
      dueDate: input.dueDate,
      status: allocation.amountYen === 0 ? 'settled' : 'open',
    };
  });
  validateObligations(obligations);
  return obligations;
}

function sameYear(obligation: PaymentObligation, year: ContractYear): boolean {
  return (
    obligation.contractYearRef?.contractId === year.contractId &&
    obligation.contractYearRef.seasonId === year.seasonId
  );
}

/** 旧reallocated行の既払も残し、「実際の既払＋現在の未払＝契約年額」を検査する。 */
function checkAnnualLiability(
  obligations: readonly PaymentObligation[],
  year: ContractYear,
  playerId: string,
): void {
  const rows = obligations.filter((o) => sameYear(o, year));
  if (!rows.length)
    throw new SalaryTransferBlocked(
      'missingSalaryData',
      '契約年度に対応する給与債務が未記録です。',
    );
  requireFinance(
    rows.every(
      (o) =>
        o.kind === 'salary' &&
        o.payeeRef.kind === 'player' &&
        o.payeeRef.id === playerId &&
        o.guaranteed === year.guaranteed,
    ),
    '契約年度の給与債務と選手・保証区分が一致しません',
  );
  requireFinance(
    sumYen(rows.flatMap((o) => [o.settledYen, unpaidYen(o)])) === year.salaryYen,
    '給与の既払と現在の未払の合計が契約年額と一致しません',
  );
}

/**
 * 未払の負担先だけを組み替える案。旧債務・既払・現金明細を消さない。
 * 有効日から獲得側負担とする試作境界。元のdueDateを継承し、支払日を再設定しない。
 * 前払いの返金・相殺は未決定のため、旧球団の既払が旧負担額を超える場合は止める。
 */
export function reallocateSalary(input: SalaryTransferInput): {
  obligations: PaymentObligation[];
  reallocations: SalaryReallocation[];
} {
  [input.transactionId, input.playerId, input.fromClubId, input.toClubId].forEach(financeId);
  requireFinance(input.fromClubId !== input.toClubId, '給与負担の移籍元と移籍先が同じです');
  const cut = dateDays(input.effectiveOn);
  validateObligations(input.obligations);
  // 年額・期間・版も既存の配分関数と同じ境界で検査する。
  allocateSalaryYear(
    input.year,
    [
      {
        payerClubId: input.fromClubId,
        coverageFrom: input.year.applicableFrom,
        coverageUntil: input.year.applicableUntil,
      },
    ],
    input.modelVersion,
  );
  if (
    input.obligations.some(
      (o) =>
        o.kind === 'salary' &&
        o.payeeRef.kind === 'player' &&
        o.payeeRef.id === input.playerId &&
        o.seasonId === input.year.seasonId &&
        !o.contractYearRef,
    )
  ) {
    throw new SalaryTransferBlocked(
      'missingSalaryData',
      '選手の給与に契約年度・負担期間が未記録の債務があります。',
    );
  }
  checkAnnualLiability(input.obligations, input.year, input.playerId);
  const start = dateDays(input.year.applicableFrom);
  const end = dateDays(input.year.applicableUntil);
  if (cut >= end) return { obligations: [...input.obligations], reallocations: [] };

  const rows = input.obligations
    .filter(
      (o) =>
        sameYear(o, input.year) &&
        o.status !== 'waived' &&
        o.status !== 'reallocated' &&
        dateDays(o.coverageUntil!) > cut,
    )
    .sort((a, b) => dateDays(a.coverageFrom!) - dateDays(b.coverageFrom!));
  let next = Math.max(start, cut);
  for (const row of rows) {
    requireFinance(
      row.coverageFrom !== undefined && row.coverageUntil !== undefined,
      '給与の負担期間がありません',
    );
    requireFinance(
      dateDays(row.coverageFrom) >= start && dateDays(row.coverageUntil) <= end,
      '給与の負担期間が契約年度の範囲外です',
    );
    requireFinance(
      Math.max(cut, dateDays(row.coverageFrom)) === next,
      '移籍日以降の給与債務に重複または空白があります',
    );
    requireFinance(
      row.payerClubId === input.fromClubId,
      '移籍日以降の給与負担球団が移籍元と一致しません',
    );
    next = dateDays(row.coverageUntil);
  }
  if (next !== end)
    throw new SalaryTransferBlocked(
      'missingSalaryData',
      '移籍日以降の給与負担期間が不足しています。',
    );

  const totalDays = BigInt(end - start);
  const cumulative = (day: number) =>
    (BigInt(input.year.salaryYen) * BigInt(day - start)) / totalDays;
  const replacements = new Map<string, PaymentObligation>();
  const additions: SalaryObligation[] = [];
  const reallocations: SalaryReallocation[] = [];
  for (const row of rows) {
    const from = dateDays(row.coverageFrom!);
    const until = dateDays(row.coverageUntil!);
    const split = Math.max(from, cut);
    const retainedAllocation = Number(cumulative(split) - cumulative(from));
    requireFinance(
      row.amountYen === Number(cumulative(until) - cumulative(from)),
      '移籍対象の給与額と負担期間の配分が一致しません',
    );
    if (row.settledYen > retainedAllocation)
      throw new SalaryTransferBlocked(
        'unsupportedPrepayment',
        '旧球団の前払いが移籍前の負担額を超えています。返金・相殺の規則は未対応です。',
      );
    const retainedUnpaidYen = retainedAllocation - row.settledYen;
    const transferredUnpaidYen = row.amountYen - retainedAllocation;
    const replacementObligationIds: string[] = [];
    const add = (
      part: 'retained' | 'transferred',
      payerClubId: string,
      coverageFrom: string,
      coverageUntil: string,
      amountYen: number,
    ) => {
      // 元債務との対応はreallocationsへ保持。IDへ以前のIDを埋め込み続けない。
      const key = [
        'salary-transfer-v1',
        input.transactionId,
        input.year.contractId,
        input.year.seasonId,
        input.playerId,
        row.payerClubId,
        row.coverageFrom!,
        row.coverageUntil!,
        part,
      ];
      const obligationId = JSON.stringify(key);
      requireFinance(
        !input.obligations.some((o) => o.obligationId === obligationId),
        '給与負担の組替えは反映済みです',
      );
      additions.push({
        ...row,
        obligationId,
        sourceKey: key,
        kind: 'salary',
        contractYearRef: { contractId: input.year.contractId, seasonId: input.year.seasonId },
        payerClubId,
        payeeRef: { ...row.payeeRef },
        coverageFrom,
        coverageUntil,
        amountYen,
        settledYen: 0,
        status: amountYen === 0 ? 'settled' : 'open',
      });
      replacementObligationIds.push(obligationId);
    };
    if (from < split)
      add('retained', input.fromClubId, row.coverageFrom!, input.effectiveOn, retainedUnpaidYen);
    add(
      'transferred',
      input.toClubId,
      cut <= from ? row.coverageFrom! : input.effectiveOn,
      row.coverageUntil!,
      transferredUnpaidYen,
    );
    replacements.set(row.obligationId, { ...row, status: 'reallocated' });
    reallocations.push({
      sourceObligationId: row.obligationId,
      replacementObligationIds,
      preservedSettledYen: row.settledYen,
      retainedUnpaidYen,
      transferredUnpaidYen,
    });
  }
  const obligations = [
    ...input.obligations.map((o) => replacements.get(o.obligationId) ?? o),
    ...additions,
  ];
  validateObligations(obligations);
  checkAnnualLiability(obligations, input.year, input.playerId);
  return { obligations, reallocations };
}
