import { calculateBudget } from '../finance/budget.ts';
import { reallocateSalary, SalaryTransferBlocked } from '../finance/payroll.ts';
import type { SalaryReallocation } from '../finance/payroll.ts';
import { recordPayment } from '../finance/settlement.ts';
import type { PaymentLedger, PaymentObligation } from '../finance/types.ts';
import {
  compareMoments,
  dateDays,
  financeId,
  requireFinance,
  uniqueFinanceIds,
  unpaidYen,
  validateCashEntries,
  validateMoment,
  validateObligations,
  yen,
} from '../finance/validation.ts';
import type {
  TradeFinanceBlocker,
  TradeFinanceInput,
  TradeFinanceResult,
} from './trade-finance-types.ts';

/**
 * 複数選手の給与と提示金銭を一つの会計案にし、両球団の成立後予算で審査する。
 * 入力・現行世界・DBは変更しない。blockedには適用可能なledgerを返さない。
 * 交渉承認、所属・登録・編成、保存と指示の再送制御は今後のWorker境界でまとめる。
 */
export function planTradeFinances(input: TradeFinanceInput): TradeFinanceResult {
  financeId(input.transactionId);
  financeId(input.seasonId);
  validateMoment(input.effectiveAt);
  uniqueFinanceIds(input.clubIds, '取引の球団ID');
  requireFinance(input.clubIds.length === 2, '取引の球団は2球団必要です');
  uniqueFinanceIds(
    input.moves.map((move) => move.playerId),
    '取引の選手ID',
  );
  requireFinance(input.moves.length > 0, '取引する選手がいません');
  const clubs = new Set(input.clubIds);
  for (const move of input.moves)
    requireFinance(
      clubs.has(move.fromClubId) && clubs.has(move.toClubId) && move.fromClubId !== move.toClubId,
      '移籍元・移籍先の球団が不正です',
    );
  const cash = input.cashTransfer;
  yen(cash.amountYen, '提示金銭');
  requireFinance(
    clubs.has(cash.payerClubId) &&
      clubs.has(cash.payeeClubId) &&
      cash.payerClubId !== cash.payeeClubId,
    '提示金銭の支払先が不正です',
  );
  const isExchange =
    input.moves.some((move) => move.fromClubId === input.clubIds[0]) &&
    input.moves.some((move) => move.fromClubId === input.clubIds[1]);
  requireFinance(
    isExchange ||
      (cash.amountYen > 0 &&
        input.moves.every(
          (move) => move.fromClubId === cash.payeeClubId && move.toClubId === cash.payerClubId,
        )),
    '選手交換、または獲得側から金銭を提示する取引が必要です',
  );

  validateCashEntries(input.ledger.cashEntries);
  validateObligations(input.ledger.obligations);
  requireFinance(
    input.ledger.cashEntries.every(
      (entry) => compareMoments(entry.bookedAt, input.effectiveAt) <= 0,
    ),
    '取引時点より未来の現金明細が含まれています',
  );
  requireFinance(
    !input.ledger.obligations.some(
      (o) =>
        ['trade-finance-v1', 'salary-transfer-v1'].includes(o.sourceKey[0]!) &&
        o.sourceKey[1] === input.transactionId,
    ),
    'この取引の会計記録は反映済みです',
  );
  uniqueFinanceIds(
    input.budgets.map((budget) => budget.clubId),
    '予算の球団ID',
  );
  requireFinance(
    input.budgets.length === 2 &&
      input.budgets.every(
        (budget) => clubs.has(budget.clubId) && budget.seasonId === input.seasonId,
      ),
    '両球団の同じ年度の予算情報が必要です',
  );
  for (const budget of input.budgets) {
    if (budget.openingBalance !== null) {
      validateMoment(budget.openingBalance.closedThrough);
      requireFinance(
        compareMoments(budget.openingBalance.closedThrough, input.effectiveAt) < 0,
        '残高確定時点より後の取引順を指定してください',
      );
    }
  }
  uniqueFinanceIds(
    input.contractYears.map(({ year }) => JSON.stringify([year.contractId, year.seasonId])),
    '移籍契約年度',
  );
  for (const { playerId, year } of input.contractYears) {
    financeId(playerId);
    requireFinance(
      input.moves.some((move) => move.playerId === playerId),
      '取引にない選手の契約年度が含まれています',
    );
    dateDays(year.applicableFrom);
    dateDays(year.applicableUntil);
  }

  const budgets = input.budgets.map((context) => ({
    clubId: context.clubId,
    before: calculateBudget({ ...context, ...input.ledger }),
    after: null,
  }));
  const base = {
    modelVersion: 'trade-finance-plan-v1' as const,
    transactionId: input.transactionId,
  };
  let draft: PaymentLedger = {
    cashEntries: [...input.ledger.cashEntries],
    obligations: [...input.ledger.obligations],
  };
  const salaryReallocations: SalaryReallocation[] = [];
  for (const move of input.moves) {
    if (
      input.ledger.obligations.some(
        (o) =>
          o.payeeRef.kind === 'player' &&
          o.payeeRef.id === move.playerId &&
          o.kind !== 'salary' &&
          unpaidYen(o) > 0,
      )
    ) {
      return {
        ...base,
        status: 'blocked',
        budgets,
        blockers: [
          {
            code: 'unsupportedContractDebt',
            playerId: move.playerId,
            message: '未払契約金など給与以外の債務があります。移籍時の負担規則が未対応です。',
          },
        ],
      };
    }
    const years = input.contractYears.filter((entry) => entry.playerId === move.playerId);
    const activeYears = years.filter(({ year }) => year.applicableUntil > input.effectiveAt.date);
    if (!activeYears.length)
      return {
        ...base,
        status: 'blocked',
        budgets,
        blockers: [
          {
            code: 'missingSalaryData',
            playerId: move.playerId,
            message: '移籍する選手の現在・将来の契約年度が未記録です。',
          },
        ],
      };
    const ordered = [...activeYears].sort(
      (a, b) => dateDays(a.year.applicableFrom) - dateDays(b.year.applicableFrom),
    );
    for (let index = 1; index < ordered.length; index += 1)
      requireFinance(
        ordered[index - 1]!.year.applicableUntil <= ordered[index]!.year.applicableFrom,
        '選手の契約年度の負担期間が重複しています',
      );
    const salaryRows = input.ledger.obligations.filter(
      (o) =>
        o.kind === 'salary' &&
        o.payeeRef.kind === 'player' &&
        o.payeeRef.id === move.playerId &&
        o.status !== 'waived' &&
        o.status !== 'reallocated',
    );
    if (
      salaryRows.some(
        (o) =>
          !o.contractYearRef ||
          !o.coverageUntil ||
          (o.coverageUntil > input.effectiveAt.date &&
            !activeYears.some(
              ({ year }) =>
                year.contractId === o.contractYearRef!.contractId &&
                year.seasonId === o.contractYearRef!.seasonId,
            )),
      )
    ) {
      return {
        ...base,
        status: 'blocked',
        budgets,
        blockers: [
          {
            code: 'missingSalaryData',
            playerId: move.playerId,
            message: '給与の契約年度・負担期間、または移すべき将来年度の情報が不足しています。',
          },
        ],
      };
    }
    try {
      for (const { year } of activeYears) {
        const result = reallocateSalary({
          transactionId: input.transactionId,
          playerId: move.playerId,
          fromClubId: move.fromClubId,
          toClubId: move.toClubId,
          effectiveOn: input.effectiveAt.date,
          year,
          obligations: draft.obligations,
          modelVersion: input.salaryModelVersion,
        });
        draft = { ...draft, obligations: result.obligations };
        salaryReallocations.push(...result.reallocations);
      }
    } catch (error) {
      if (!(error instanceof SalaryTransferBlocked)) throw error;
      return {
        ...base,
        status: 'blocked',
        budgets,
        blockers: [{ code: error.code, playerId: move.playerId, message: error.message }],
      };
    }
  }

  let cashObligationId: string | null = null;
  if (cash.amountYen > 0) {
    const sourceKey = ['trade-finance-v1', input.transactionId, 'cash-obligation'];
    cashObligationId = JSON.stringify(sourceKey);
    const obligation: PaymentObligation = {
      obligationId: cashObligationId,
      sourceKey,
      seasonId: input.seasonId,
      payerClubId: cash.payerClubId,
      payeeRef: { kind: 'club', id: cash.payeeClubId },
      kind: 'trade',
      amountYen: cash.amountYen,
      settledYen: 0,
      guaranteed: true,
      dueDate: input.effectiveAt.date,
      status: 'open',
    };
    draft = recordPayment(
      { ...draft, obligations: [...draft.obligations, obligation] },
      {
        settlementGroupId: JSON.stringify([
          'trade-finance-v1',
          input.transactionId,
          'cash-settlement',
        ]),
        sourceKey: ['trade-finance-v1', input.transactionId, 'cash-settlement', '1'],
        bookedAt: input.effectiveAt,
        seasonId: input.seasonId,
        obligationId: cashObligationId,
        amountYen: cash.amountYen,
      },
    );
  }
  const compared = input.budgets.map((context, index) => ({
    ...budgets[index]!,
    after: calculateBudget({ ...context, ...draft }),
  }));
  const blockers: TradeFinanceBlocker[] = compared.flatMap<TradeFinanceBlocker>(
    ({ clubId, after }) => {
      if (after.status === 'unknown')
        return after.reasons.map((message) => ({
          code: 'unknownBudget' as const,
          clubId,
          message,
        }));
      return after.availableYen < 0
        ? [
            {
              code: 'insufficientBudget' as const,
              clubId,
              message: `成立後の利用可能予算が${after.availableYen}円で不足しています。`,
            },
          ]
        : [];
    },
  );
  if (blockers.length) return { ...base, status: 'blocked', budgets: compared, blockers };
  return {
    ...base,
    status: 'ready',
    budgets: compared,
    ledger: draft,
    salaryReallocations,
    cashObligationId,
  };
}
