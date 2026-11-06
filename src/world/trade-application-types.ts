import type { FinanceMoment, PaymentLedger } from '../finance/types.ts';
import type { TradeBudgetContext, TradeFinanceInput } from '../recruitment/trade-finance-types.ts';
import type { TradeMembership } from '../recruitment/trade-memberships.ts';
import type {
  TradeLineup,
  TradePitcherPlan,
  TradeRosterInput,
  TradeRosterPlayer,
} from '../recruitment/trade-roster-types.ts';
import type { TradeChangeSetResult } from '../recruitment/trade-change-set.ts';
import type { WorldRecord, WorldDefinitions, ClubManagement } from './types.ts';
import type { RegistrationState } from './registration-types.ts';
import type { GameFixture, Team } from '../game/types.ts';

export type TradeSourceWorld = Extract<WorldRecord, { version: 'world-prototype-v21' }>;

export interface TradeApplicationFinance {
  ledger: PaymentLedger;
  contractYears: TradeFinanceInput['contractYears'];
  budgets: TradeBudgetContext[];
  salaryModelVersion: TradeFinanceInput['salaryModelVersion'];
}

/** 取引の差分と監査だけを残し、毎回の全名簿・全台帳を履歴へ複製しない。 */
export interface AppliedWorldTrade {
  models: {
    application: 'trade-application-world-v1';
    roster: 'trade-roster-plan-v1';
    finance: 'trade-finance-plan-v1';
  };
  transactionId: string;
  appliedAt: FinanceMoment;
  playerMoves: Extract<TradeChangeSetResult, { status: 'ready' }>['roster']['playerMoves'];
  rosterAudit: Extract<TradeChangeSetResult, { status: 'ready' }>['roster']['audit'];
  salaryReallocations: Extract<
    TradeChangeSetResult,
    { status: 'ready' }
  >['finance']['salaryReallocations'];
  cashObligationId: string | null;
}

/** 交渉結果そのものではなく、上位が正当性を確認して記録する内部適用承認。 */
export interface TradeApplicationApproval {
  approvalId: string;
  acceptedStateRevision: number;
  approvedForClubId: string;
  acceptedAt: FinanceMoment;
  validThrough: FinanceMoment;
  request: WorldTradeRequest;
  appliedTransactionId: string | null;
}

type ApplicationManagement<T> = T extends ClubManagement
  ? Omit<T, 'idealLineups' | 'pitcherUsagePlans'> & {
      idealLineups: Record<string, TradeLineup>;
      pitcherUsagePlans: Record<string, TradePitcherPlan>;
    }
  : never;

/**
 * 新世界用の適用候補。現行Worker/serializerは受け付けない。
 * initialDefinitionsは変更しない初期資料。現在の所属はregistrationだけが正本。
 * 個人状態・試合・集計は元世界から一つずつ保持し、別の可変な旧世界を内包しない。
 */
export type TradeApplicationWorld = Omit<
  TradeSourceWorld,
  'version' | 'definitions' | 'registration' | 'management' | 'gameLineups'
> & {
  version: 'trade-application-world-v1';
  initialDefinitions: WorldDefinitions;
  rosterAsOf: FinanceMoment;
  playerFacts: TradeRosterPlayer[];
  finance: TradeApplicationFinance;
  management: ApplicationManagement<ClubManagement>;
  gameLineups: Record<string, TradeLineup>;
  registration: Omit<RegistrationState, 'memberships'> & { memberships: TradeMembership[] };
  transactions: AppliedWorldTrade[];
  tradeApprovals: TradeApplicationApproval[];
};

/** 台帳・資格・現在編成は受け取らず、現在世界から組み立てる。承認は上位の責務。 */
export interface WorldTradeRequest {
  transactionId: string;
  effectiveAt: FinanceMoment;
  clubIds: TradeFinanceInput['clubIds'];
  moves: TradeFinanceInput['moves'];
  cashTransfer: TradeFinanceInput['cashTransfer'];
  choices: TradeRosterInput['choices'];
  squadReplacements: TradeRosterInput['squadReplacements'];
}

export type TradeApplicationResult =
  | { status: 'blocked'; details: Extract<TradeChangeSetResult, { status: 'blocked' }> }
  | { status: 'ready'; world: TradeApplicationWorld; transactionId: string };

/** 現在所属から作る候補名簿。base値と成長後の現在値を混同しない。 */
export interface TradeSquadRoster {
  modelVersion: 'trade-squad-roster-v1';
  squadId: string;
  clubId: string;
  category: 'first' | 'farm';
  benchLimit: number;
  clubPlayerIds: string[];
  registeredPlayerIds: string[];
  lineup: Team['lineup'];
  pitchers: TradePitcherPlan;
  reserveBatterIds: string[];
  basePlayers: GameFixture['players'];
  basePitches: GameFixture['pitches'];
}
