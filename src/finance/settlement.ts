import type { CashEntry, PaymentLedger, PaymentSettlement } from './types.ts';
import {
  compareMoments,
  financeId,
  requireFinance,
  sourceKey,
  sumYen,
  unpaidYen,
  validateCashEntries,
  validateMoment,
  validateObligations,
  yen,
} from './validation.ts';

/**
 * 承認済み支払の台帳更新。入力を変更せず、債務と両球団の明細を同じ戻り値にまとめる。
 * 交渉承認・予算審査・所属変更・DB保存は担当しない。Worker側の取引境界へ組み込む部品。
 */
export function recordPayment(ledger: PaymentLedger, payment: PaymentSettlement): PaymentLedger {
  validateCashEntries(ledger.cashEntries);
  validateObligations(ledger.obligations);
  [payment.settlementGroupId, payment.seasonId, payment.obligationId].forEach(financeId);
  const key = sourceKey(payment.sourceKey);
  validateMoment(payment.bookedAt);
  yen(payment.amountYen, '今回支払額');
  requireFinance(payment.amountYen > 0, '支払額は1円以上で指定してください');
  const obligation = ledger.obligations.find((o) => o.obligationId === payment.obligationId);
  requireFinance(obligation, '支払対象の債務がありません');
  requireFinance(obligation.seasonId === payment.seasonId, '支払年度と債務年度が一致しません');
  const counterpartyClubId =
    obligation.payeeRef.kind === 'club' ? obligation.payeeRef.id : undefined;
  requireFinance(counterpartyClubId !== obligation.payerClubId, '自球団への支払は作れません');
  const common = {
    bookedAt: { ...payment.bookedAt },
    seasonId: payment.seasonId,
    category: obligation.kind,
    sourceKey: [...payment.sourceKey],
    settlementGroupId: payment.settlementGroupId,
    obligationId: obligation.obligationId,
  };
  const payer: CashEntry = {
    ...common,
    cashEntryId: JSON.stringify(['cash', payment.settlementGroupId, obligation.payerClubId]),
    clubId: obligation.payerClubId,
    signedAmountYen: -payment.amountYen,
    ...(counterpartyClubId ? { counterpartyClubId } : {}),
  };
  const entries: CashEntry[] = [payer];
  if (counterpartyClubId)
    entries.push({
      ...common,
      sourceKey: [...payment.sourceKey],
      bookedAt: { ...payment.bookedAt },
      cashEntryId: JSON.stringify(['cash', payment.settlementGroupId, counterpartyClubId]),
      clubId: counterpartyClubId,
      signedAmountYen: payment.amountYen,
      counterpartyClubId: obligation.payerClubId,
    });

  const previous = ledger.cashEntries.filter(
    (entry) => entry.settlementGroupId === payment.settlementGroupId,
  );
  if (previous.length) {
    requireFinance(
      previous.length === entries.length &&
        entries.every((expected) =>
          previous.some(
            (actual) =>
              actual.cashEntryId === expected.cashEntryId &&
              actual.clubId === expected.clubId &&
              actual.signedAmountYen === expected.signedAmountYen &&
              actual.seasonId === expected.seasonId &&
              actual.category === expected.category &&
              sourceKey(actual.sourceKey) === key &&
              compareMoments(actual.bookedAt, payment.bookedAt) === 0 &&
              actual.obligationId === expected.obligationId &&
              actual.counterpartyClubId === expected.counterpartyClubId,
          ),
        ),
      '同じ精算IDに異なる支払条件、または片側だけの明細があります',
    );
    const bookedYen = sumYen(
      ledger.cashEntries
        .filter(
          (e) => e.obligationId === obligation.obligationId && e.clubId === obligation.payerClubId,
        )
        .map((e) => -e.signedAmountYen),
    );
    requireFinance(obligation.settledYen >= bookedYen, '支払明細と債務の支払済み額が一致しません');
    return ledger;
  }

  requireFinance(payment.amountYen <= unpaidYen(obligation), '債務の未払額を超える支払です');
  const settledYen = sumYen([obligation.settledYen, payment.amountYen]);
  const next: PaymentLedger = {
    cashEntries: [...ledger.cashEntries, ...entries],
    obligations: ledger.obligations.map((entry) =>
      entry.obligationId === obligation.obligationId
        ? {
            ...entry,
            settledYen,
            status: settledYen === entry.amountYen ? 'settled' : 'partlySettled',
          }
        : entry,
    ),
  };
  validateCashEntries(next.cashEntries);
  validateObligations(next.obligations);
  return next;
}
