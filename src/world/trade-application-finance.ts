import { checkAnnualLiability } from '../finance/payroll.ts';
import {
  dateDays,
  financeId,
  requireFinance,
  uniqueFinanceIds,
  validateCashEntries,
  validateObligations,
  yen,
} from '../finance/validation.ts';
import type { TradeApplicationFinance } from './trade-application-types.ts';

/** 交換対象だけでなく、予算に含める全契約と全給与債務の欠損を止める。 */
export function validateApplicationSalaries(
  finance: TradeApplicationFinance,
  playerIds: readonly string[],
  seasonId: string,
  currentDate: string,
): void {
  validateCashEntries(finance.ledger.cashEntries);
  validateObligations(finance.ledger.obligations);
  uniqueFinanceIds(
    finance.contractYears.map(({ year }) => JSON.stringify([year.contractId, year.seasonId])),
    '契約年度',
  );
  for (const { playerId, year } of finance.contractYears) {
    requireFinance(playerIds.includes(playerId), '契約に初期資料外の選手が含まれています');
    financeId(year.contractId);
    financeId(year.seasonId);
    yen(year.salaryYen, '契約年額');
    requireFinance(
      typeof year.guaranteed === 'boolean' &&
        dateDays(year.applicableFrom) < dateDays(year.applicableUntil),
      '契約の保証区分・適用期間が不正です',
    );
    checkAnnualLiability(finance.ledger.obligations, year, playerId);
  }
  requireFinance(
    playerIds.every((playerId) =>
      finance.contractYears.some(
        (r) =>
          r.playerId === playerId &&
          r.year.seasonId === seasonId &&
          r.year.applicableFrom <= currentDate &&
          currentDate < r.year.applicableUntil,
      ),
    ),
    '全所属選手の当年度契約を明示してください',
  );
  for (const obligation of finance.ledger.obligations.filter((o) => o.kind === 'salary'))
    requireFinance(
      finance.contractYears.some(
        ({ playerId, year }) =>
          playerId === obligation.payeeRef.id &&
          year.contractId === obligation.contractYearRef?.contractId &&
          year.seasonId === obligation.contractYearRef.seasonId,
      ),
      '給与債務に対応する契約年度がありません',
    );
}
