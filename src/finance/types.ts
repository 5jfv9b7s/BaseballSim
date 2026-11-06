/** データ設計書7.2・7.3の会計基盤。現在の世界・保存にはまだ接続しない。 */
export interface FinanceMoment {
  date: string;
  order: number;
}

export interface ContractTerms {
  startSeasonId: string;
  years: number;
  totalSalaryYen: number;
  bonusYen: number;
}

/** 年度IDから西暦を推測しない。期間は開始日を含み、終了日を含まない。 */
export interface ContractSeason {
  seasonId: string;
  applicableFrom: string;
  applicableUntil: string;
}

export interface ContractYear extends ContractSeason {
  contractId: string;
  salaryYen: number;
  guaranteed: boolean;
}

export interface SalaryProrationPolicy {
  version: 'salary-day-proration-v1';
  coverageFromMonthDay: string;
  coverageUntilMonthDay: string;
}

export interface SalaryPayerPeriod {
  payerClubId: string;
  coverageFrom: string;
  coverageUntil: string;
}

export interface SalaryAllocation extends SalaryPayerPeriod {
  amountYen: number;
  modelVersion: SalaryProrationPolicy['version'];
}

export interface PaymentObligation {
  /** 給与負担の組替えに使う。3項目をまとめて記録し、未記録を推測しない。 */
  contractYearRef?: { contractId: string; seasonId: string };
  coverageFrom?: string;
  coverageUntil?: string;
  obligationId: string;
  seasonId: string;
  payerClubId: string;
  payeeRef: { kind: 'player' | 'club'; id: string };
  kind: 'salary' | 'signingBonus' | 'trade';
  amountYen: number;
  settledYen: number;
  guaranteed: boolean;
  sourceKey: string[];
  dueDate: string;
  status: 'open' | 'partlySettled' | 'settled' | 'waived' | 'reallocated';
}

export interface CashEntry {
  cashEntryId: string;
  clubId: string;
  bookedAt: FinanceMoment;
  seasonId: string;
  category: PaymentObligation['kind'] | 'revenue' | 'guarantee';
  signedAmountYen: number;
  sourceKey: string[];
  settlementGroupId: string;
  obligationId?: string;
  counterpartyClubId?: string;
}

export interface BudgetHold {
  holdId: string;
  clubId: string;
  seasonId: string;
  sourceKey: string[];
  amountYen: number;
  status: 'active' | 'replaced' | 'released';
  replacedByObligationIds: string[];
}

export interface FutureBudgetSeason {
  seasonId: string;
  /** 未記録はnull。保証値・補充余裕の決め方はE-01の未決定事項。 */
  /** これから入金される保証基礎収入。入金済みの金額を再び含めない。 */
  guaranteedIncomeYen: number | null;
  minimumReplenishmentYen: number | null;
}

/** nullは未取得・未記録、空配列は取得済みで対象なし。部分取得を渡さない。 */
export interface BudgetInput {
  clubId: string;
  seasonId: string;
  openingBalance: { balanceYen: number; closedThrough: FinanceMoment } | null;
  cashEntries: readonly CashEntry[] | null;
  obligations: readonly PaymentObligation[] | null;
  holds: readonly BudgetHold[] | null;
  futureSeasons: readonly FutureBudgetSeason[] | null;
}

export type BudgetResult =
  | { status: 'unknown'; reasons: string[] }
  | {
      status: 'known';
      cashYen: number;
      currentUnpaidYen: number;
      activeHoldsYen: number;
      futureReserveYen: number;
      availableYen: number;
      futureSeasons: { seasonId: string; guaranteedUnpaidYen: number; reserveYen: number }[];
    };

export interface PaymentLedger {
  cashEntries: CashEntry[];
  obligations: PaymentObligation[];
}

/** 分割支払ではsourceKeyに精算番号を含め、支払ごとに別groupIdを指定する。 */
export interface PaymentSettlement {
  settlementGroupId: string;
  sourceKey: string[];
  bookedAt: FinanceMoment;
  seasonId: string;
  obligationId: string;
  amountYen: number;
}
