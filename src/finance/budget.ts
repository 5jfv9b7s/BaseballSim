import type { BudgetInput, BudgetResult } from './types.ts';
import {
  compareMoments,
  financeId,
  requireFinance,
  sourceKey,
  sumYen,
  uniqueFinanceIds,
  unpaidYen,
  validateCashEntries,
  validateMoment,
  validateObligations,
  yen,
} from './validation.ts';

/** 読取専用の予算計算。欠けた台帳や保証値は0円として扱わない。 */
export function calculateBudget(input: BudgetInput): BudgetResult {
  financeId(input.clubId);
  financeId(input.seasonId);
  const { openingBalance, cashEntries, obligations, holds, futureSeasons } = input;
  const missing: string[] = [];
  if (openingBalance === null) missing.push('確定残高が未記録です。');
  if (cashEntries === null) missing.push('現金明細が未取得です。');
  if (obligations === null) missing.push('債務一覧が未取得です。');
  if (holds === null) missing.push('仮確保一覧が未取得です。');
  if (futureSeasons === null) missing.push('将来年度の保証・補充余裕が未取得です。');
  if (!openingBalance || !cashEntries || !obligations || !holds || !futureSeasons)
    return { status: 'unknown', reasons: missing };

  yen(openingBalance.balanceYen, '確定残高', true);
  validateMoment(openingBalance.closedThrough);
  validateCashEntries(cashEntries);
  validateObligations(obligations);
  uniqueFinanceIds(
    futureSeasons.map((s) => s.seasonId),
    '将来年度',
  );
  requireFinance(
    futureSeasons.every((s) => s.seasonId !== input.seasonId),
    '現在年度が将来予約に混在しています',
  );
  uniqueFinanceIds(
    holds.map((hold) => hold.holdId),
    '仮確保ID',
  );
  for (const hold of holds) {
    financeId(hold.clubId);
    financeId(hold.seasonId);
    sourceKey(hold.sourceKey);
    yen(hold.amountYen, '仮確保額');
    requireFinance(
      ['active', 'replaced', 'released'].includes(hold.status),
      '仮確保の状態が不正です',
    );
    uniqueFinanceIds(hold.replacedByObligationIds, '置換先債務');
    requireFinance(
      hold.status === 'replaced'
        ? hold.replacedByObligationIds.length > 0
        : hold.replacedByObligationIds.length === 0,
      '仮確保の状態と置換先が一致しません',
    );
    requireFinance(
      hold.replacedByObligationIds.every((id) =>
        obligations.some((o) => o.obligationId === id && o.payerClubId === hold.clubId),
      ),
      '仮確保の置換先債務が見つかりません',
    );
  }

  const ownObligations = obligations.filter((o) => o.payerClubId === input.clubId);
  const coveredSeasons = new Set([input.seasonId, ...futureSeasons.map((s) => s.seasonId)]);
  if (ownObligations.some((o) => unpaidYen(o) > 0 && !coveredSeasons.has(o.seasonId)))
    missing.push('予算の対象年度に含まれない未払債務があります。');
  if (
    holds.some(
      (h) => h.clubId === input.clubId && h.status === 'active' && !coveredSeasons.has(h.seasonId),
    )
  )
    missing.push('予算の対象年度に含まれない仮確保があります。');
  for (const season of futureSeasons) {
    if (season.guaranteedIncomeYen === null || season.minimumReplenishmentYen === null)
      missing.push(`${season.seasonId}の保証収入または最低編成補充余裕が未記録です。`);
    if (season.guaranteedIncomeYen !== null) yen(season.guaranteedIncomeYen, '保証基礎収入');
    if (season.minimumReplenishmentYen !== null)
      yen(season.minimumReplenishmentYen, '最低編成補充余裕');
  }
  if (missing.length) return { status: 'unknown', reasons: missing };

  const cashYen = sumYen([
    openingBalance.balanceYen,
    ...cashEntries
      .filter(
        (e) =>
          e.clubId === input.clubId && compareMoments(e.bookedAt, openingBalance.closedThrough) > 0,
      )
      .map((e) => e.signedAmountYen),
  ]);
  const currentUnpaidYen = sumYen(
    ownObligations.filter((o) => o.seasonId === input.seasonId).map(unpaidYen),
  );
  const activeHoldsYen = sumYen(
    holds.filter((h) => h.clubId === input.clubId && h.status === 'active').map((h) => h.amountYen),
  );
  const projected = futureSeasons.map((season) => {
    const guaranteedUnpaidYen = sumYen(
      ownObligations.filter((o) => o.seasonId === season.seasonId && o.guaranteed).map(unpaidYen),
    );
    const reserveYen = Math.max(
      0,
      sumYen([guaranteedUnpaidYen, season.minimumReplenishmentYen!, -season.guaranteedIncomeYen!]),
    );
    return { seasonId: season.seasonId, guaranteedUnpaidYen, reserveYen };
  });
  const futureReserveYen = sumYen(projected.map((s) => s.reserveYen));
  return {
    status: 'known',
    cashYen,
    currentUnpaidYen,
    activeHoldsYen,
    futureReserveYen,
    availableYen: sumYen([cashYen, -currentUnpaidYen, -activeHoldsYen, -futureReserveYen]),
    futureSeasons: projected,
  };
}
