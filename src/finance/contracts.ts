import type {
  ContractSeason,
  ContractTerms,
  ContractYear,
  SalaryAllocation,
  SalaryPayerPeriod,
  SalaryProrationPolicy,
} from './types.ts';
import {
  dateDays,
  financeId,
  requireFinance,
  sumYen,
  uniqueFinanceIds,
  yen,
} from './validation.ts';

/** 総年俸を均等分割し、割り切れない円は最終年へ加える（データ設計7.2）。 */
export function createContractYears(
  contractId: string,
  terms: ContractTerms,
  seasons: readonly ContractSeason[],
  guaranteed: boolean,
): ContractYear[] {
  financeId(contractId);
  financeId(terms.startSeasonId);
  yen(terms.totalSalaryYen, '年俸総額');
  yen(terms.bonusYen, '契約金');
  requireFinance(
    Number.isSafeInteger(terms.years) && terms.years > 0 && terms.years === seasons.length,
    '契約年数と年度一覧が一致しません',
  );
  requireFinance(typeof guaranteed === 'boolean', '契約年俸の保証区分を指定してください');
  uniqueFinanceIds(
    seasons.map((s) => s.seasonId),
    '契約年度',
  );
  requireFinance(seasons[0]?.seasonId === terms.startSeasonId, '契約開始年度が一致しません');
  const annual = BigInt(terms.totalSalaryYen) / BigInt(terms.years);
  const remainder = BigInt(terms.totalSalaryYen) % BigInt(terms.years);
  return seasons.map((season, index) => {
    const start = dateDays(season.applicableFrom);
    const end = dateDays(season.applicableUntil);
    requireFinance(start < end, '契約年俸の適用期間が空、または逆順です');
    if (index > 0)
      requireFinance(
        dateDays(seasons[index - 1]!.applicableUntil) <= start,
        '契約年度の期間が重なっています',
      );
    return {
      ...season,
      contractId,
      guaranteed,
      salaryYen: Number(annual + (index === seasons.length - 1 ? remainder : 0n)),
    };
  });
}

/** 既存契約の給与負担期間。西暦は年度IDとは別に明示する。 */
export function salaryCoverageForYear(
  calendarYear: number,
  policy: SalaryProrationPolicy,
): Pick<ContractSeason, 'applicableFrom' | 'applicableUntil'> {
  requireFinance(policy.version === 'salary-day-proration-v1', '未対応の給与日割り版です');
  requireFinance(
    Number.isSafeInteger(calendarYear) && calendarYear >= 1 && calendarYear <= 9999,
    '給与期間の西暦が不正です',
  );
  const year = String(calendarYear).padStart(4, '0');
  const applicableFrom = `${year}-${policy.coverageFromMonthDay}`;
  const applicableUntil = `${year}-${policy.coverageUntilMonthDay}`;
  requireFinance(dateDays(applicableFrom) < dateDays(applicableUntil), '給与負担期間が不正です');
  return { applicableFrom, applicableUntil };
}

/**
 * 移籍時の日割り試作v1。年初からの累積額の差で分割し、再移籍でも端数を増減させない。
 * 区間は[開始日, 終了日)。無所属期間・重複・未記録の負担球団を勝手に補わない。
 * 契約自体・支払済み債務・現金は変更しない。途中加入の契約には別の制度設定が必要。
 */
export function allocateSalaryYear(
  year: ContractYear,
  periods: readonly SalaryPayerPeriod[],
  modelVersion: SalaryProrationPolicy['version'],
): SalaryAllocation[] {
  requireFinance(modelVersion === 'salary-day-proration-v1', '未対応の給与日割り版です');
  financeId(year.contractId);
  financeId(year.seasonId);
  yen(year.salaryYen, '契約年額');
  const start = dateDays(year.applicableFrom);
  const end = dateDays(year.applicableUntil);
  requireFinance(start < end && periods.length > 0, '給与配分の期間がありません');
  const duration = BigInt(end - start);
  const cumulative = (day: number) => (BigInt(year.salaryYen) * BigInt(day - start)) / duration;
  let next = start;
  const allocations = periods.map((period) => {
    financeId(period.payerClubId);
    const from = dateDays(period.coverageFrom);
    const until = dateDays(period.coverageUntil);
    requireFinance(
      from === next && from < until && until <= end,
      '給与負担区間に重複・空白・範囲外があります',
    );
    next = until;
    return { ...period, amountYen: Number(cumulative(until) - cumulative(from)), modelVersion };
  });
  requireFinance(next === end, '給与負担期間の末尾が不足しています');
  requireFinance(
    sumYen(allocations.map((part) => part.amountYen)) === year.salaryYen,
    '給与配分の合計が契約年額と一致しません',
  );
  return allocations;
}
