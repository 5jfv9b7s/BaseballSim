import type {
  BudgetInput,
  BudgetResult,
  ContractYear,
  FinanceMoment,
  PaymentLedger,
  SalaryProrationPolicy,
} from '../finance/types.ts';
import type { SalaryReallocation } from '../finance/payroll.ts';

/** 台帳の正本はledgerの一つだけ。球団別の入力に古い明細・債務を重複保持しない。 */
export type TradeBudgetContext = Omit<BudgetInput, 'cashEntries' | 'obligations'>;

export interface TradeFinanceInput {
  transactionId: string;
  seasonId: string;
  effectiveAt: FinanceMoment;
  clubIds: readonly [string, string];
  moves: readonly { playerId: string; fromClubId: string; toClubId: string }[];
  /** 移籍する全選手の、今回および将来の契約年度。未記録の契約を0で補わない。 */
  contractYears: readonly { playerId: string; year: ContractYear }[];
  cashTransfer: { payerClubId: string; payeeClubId: string; amountYen: number };
  ledger: PaymentLedger;
  budgets: readonly [TradeBudgetContext, TradeBudgetContext];
  salaryModelVersion: SalaryProrationPolicy['version'];
}

export interface TradeBudgetComparison {
  clubId: string;
  before: BudgetResult;
  /** 給与の未記録等で全案が作れなかった場合はnull。部分的な試算を出さない。 */
  after: BudgetResult | null;
}

export interface TradeFinanceBlocker {
  code:
    | 'missingSalaryData'
    | 'unsupportedPrepayment'
    | 'unsupportedContractDebt'
    | 'unknownBudget'
    | 'insufficientBudget';
  message: string;
  clubId?: string;
  playerId?: string;
}

export type TradeFinanceResult = {
  modelVersion: 'trade-finance-plan-v1';
  transactionId: string;
  budgets: TradeBudgetComparison[];
} & (
  | { status: 'blocked'; blockers: TradeFinanceBlocker[] }
  | {
      /** 会計案だけが審査通過。交渉成立・所属/登録/編成/保存の確定とは別。 */
      status: 'ready';
      ledger: PaymentLedger;
      salaryReallocations: SalaryReallocation[];
      cashObligationId: string | null;
    }
);
