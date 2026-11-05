import type { CashEntry, FinanceMoment, PaymentObligation } from './types.ts';

export function requireFinance(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function financeId(value: string): void {
  requireFinance(typeof value === 'string' && value.trim().length > 0, '会計のIDが空です');
}

export function yen(value: number, name: string, signed = false): void {
  requireFinance(
    Number.isSafeInteger(value) && (signed || value >= 0),
    `${name}は円単位の安全な整数が必要です`,
  );
}

/** 集計途中の丸めを避け、JSONへ戻せる安全な整数だけを返す。 */
export function sumYen(values: readonly number[]): number {
  let total = 0n;
  for (const value of values) {
    yen(value, '集計金額', true);
    total += BigInt(value);
  }
  requireFinance(
    total >= BigInt(Number.MIN_SAFE_INTEGER) && total <= BigInt(Number.MAX_SAFE_INTEGER),
    '円の集計結果が安全な整数範囲を超えます',
  );
  return Number(total);
}

export function dateDays(date: string): number {
  requireFinance(
    typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date),
    '会計の日付形式が不正です',
  );
  const milliseconds = Date.parse(`${date}T00:00:00.000Z`);
  requireFinance(
    Number.isFinite(milliseconds) && new Date(milliseconds).toISOString().slice(0, 10) === date,
    '会計の日付が存在しません',
  );
  return milliseconds / 86_400_000;
}

export function validateMoment(moment: FinanceMoment): void {
  dateDays(moment.date);
  requireFinance(
    Number.isSafeInteger(moment.order) && moment.order >= 0,
    '会計のイベント順が不正です',
  );
}

export function compareMoments(left: FinanceMoment, right: FinanceMoment): number {
  return (
    (left.date < right.date ? -1 : left.date > right.date ? 1 : 0) ||
    Math.sign(left.order - right.order)
  );
}

export function sourceKey(parts: readonly string[]): string {
  requireFinance(Array.isArray(parts) && parts.length > 0, '会計の発生元キーがありません');
  parts.forEach(financeId);
  return JSON.stringify(parts);
}

export function uniqueFinanceIds(values: readonly string[], name: string): void {
  values.forEach(financeId);
  requireFinance(new Set(values).size === values.length, `${name}が重複しています`);
}

export function validateObligations(obligations: readonly PaymentObligation[]): void {
  uniqueFinanceIds(
    obligations.map((o) => o.obligationId),
    '債務ID',
  );
  uniqueFinanceIds(
    obligations.map((o) => JSON.stringify([o.payerClubId, sourceKey(o.sourceKey)])),
    '債務の発生元',
  );
  for (const obligation of obligations) {
    [obligation.seasonId, obligation.payerClubId, obligation.payeeRef.id].forEach(financeId);
    requireFinance(['player', 'club'].includes(obligation.payeeRef.kind), '債務の受取先が不正です');
    requireFinance(
      ['salary', 'signingBonus', 'trade'].includes(obligation.kind),
      '債務の種類が不正です',
    );
    requireFinance(typeof obligation.guaranteed === 'boolean', '債務の保証区分が未記録です');
    dateDays(obligation.dueDate);
    yen(obligation.amountYen, '債務額');
    yen(obligation.settledYen, '支払済み額');
    requireFinance(obligation.settledYen <= obligation.amountYen, '支払済み額が債務額を超えます');
    const { status, amountYen, settledYen } = obligation;
    requireFinance(
      (status === 'open' && settledYen === 0) ||
        (status === 'partlySettled' && settledYen > 0 && settledYen < amountYen) ||
        (status === 'settled' && settledYen === amountYen) ||
        status === 'waived' ||
        status === 'reallocated',
      '債務の状態と支払済み額が一致しません',
    );
  }
}

export function unpaidYen(obligation: PaymentObligation): number {
  return obligation.status === 'open' || obligation.status === 'partlySettled'
    ? obligation.amountYen - obligation.settledYen
    : 0;
}

export function validateCashEntries(entries: readonly CashEntry[]): void {
  uniqueFinanceIds(
    entries.map((entry) => entry.cashEntryId),
    '現金明細ID',
  );
  uniqueFinanceIds(
    entries.map((entry) => JSON.stringify([entry.clubId, sourceKey(entry.sourceKey)])),
    '球団ごとの精算キー',
  );
  for (const entry of entries) {
    [entry.clubId, entry.seasonId, entry.settlementGroupId].forEach(financeId);
    if (entry.obligationId !== undefined) financeId(entry.obligationId);
    if (entry.counterpartyClubId !== undefined) {
      financeId(entry.counterpartyClubId);
      requireFinance(entry.counterpartyClubId !== entry.clubId, '自球団への現金移動です');
    }
    requireFinance(
      ['salary', 'signingBonus', 'trade', 'revenue', 'guarantee'].includes(entry.category),
      '現金明細の種類が不正です',
    );
    validateMoment(entry.bookedAt);
    yen(entry.signedAmountYen, '入出金額', true);
  }
}
