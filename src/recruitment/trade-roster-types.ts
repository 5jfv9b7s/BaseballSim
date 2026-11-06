import type { ReliefRoleRule } from '../game/relief-types.ts';
import type { PlayerRegistration, RegistrationRules } from '../world/registration-types.ts';
import type { IndividualRest } from '../world/rest-types.ts';
import type { RosterControl, RosterPreference } from '../world/roster-policy-types.ts';
import type { IdealLineup, PitcherUsagePlan } from '../world/types.ts';
import type { TradeMembership, TradePlayerMove } from './trade-memberships.ts';
import type { TradeFinanceInput } from './trade-finance-types.ts';

/** 役割と資格は明示データ。主守備位置・国籍・名前から推測しない。 */
export interface TradeRosterPlayer {
  playerId: string;
  canBat: boolean;
  canPitch: boolean;
  foreignBaseStatus: 'subject' | 'exempt';
}

/** 原資料6.2の理想案では欠員をnullで表せる。既存世界の型は変更しない。 */
export type TradeLineup = Omit<IdealLineup, 'battingOrder'> & {
  battingOrder: (Omit<IdealLineup['battingOrder'][number], 'playerId'> & {
    playerId: string | null;
  })[];
};
export type TradePitcherPlan = Omit<PitcherUsagePlan, 'rotationSlots' | 'nextSlotNo'> & {
  rotationSlots: { slotNo: number; playerId: string | null }[];
  nextSlotNo: number | null;
};

export interface TradeSquadPlan {
  squadId: string;
  clubId: string;
  category: 'first' | 'farm';
  /** 一軍は既存登録規則、二軍は保存内の二軍ベンチ上限を明示する。 */
  benchLimit: number;
  lineup: TradeLineup;
  pitchers: TradePitcherPlan;
  individualRest: IndividualRest[];
  conditionalRelief: ReliefRoleRule[];
}

export interface TradeGameOverride {
  gameId: string;
  squadId: string;
  date: string;
  status: 'scheduled' | 'started' | 'completed';
  lineup: TradeLineup | null;
  starterId: string | null;
  benchIds: string[] | null;
}

export interface TradeRegistrationChoice {
  playerId: string;
  clubId: string;
  category: 'first' | 'farm';
  /** 獲得選手は必須。旧球団の固定希望を継承しない。既存選手は省略時に維持。 */
  preference?: RosterPreference;
}

export interface TradeRosterState {
  memberships: TradeMembership[];
  registrations: PlayerRegistration[];
  preferences: RosterControl['preferences'];
  squads: TradeSquadPlan[];
  overrides: TradeGameOverride[];
}

export interface TradeRosterInput extends Pick<
  TradeFinanceInput,
  'transactionId' | 'effectiveAt' | 'clubIds' | 'moves'
> {
  /** Workerが当日の全実試合/dayPlanから判定。試合別指定の有無で推測しない。 */
  dayPhase: 'beforeGames' | 'gamesStarted';
  knownClubIds: readonly string[];
  players: readonly TradeRosterPlayer[];
  rules: RegistrationRules;
  state: TradeRosterState;
  /** 全獲得選手と、人数調整等のために同時に登録を変える既存選手。 */
  choices: readonly TradeRegistrationChoice[];
  /** 欠員を解消する明示的な編成案。自動で獲得選手を空き枠へ入れない。 */
  squadReplacements: readonly TradeSquadPlan[];
}

export interface TradeRosterIssue {
  code:
    | 'registrationRequired'
    | 'preferenceRequired'
    | 'registrationCooldown'
    | 'missingPlayerData'
    | 'rosterLimit'
    | 'missingSquad'
    | 'lineupVacancy'
    | 'invalidLineup'
    | 'rotationVacancy'
    | 'invalidPitcherPlan'
    | 'playerNotEligible'
    | 'invalidOverride'
    | 'gameDayStarted';
  message: string;
  clubId?: string;
  squadId?: string;
  gameId?: string;
  playerId?: string;
  slotNo?: number;
}

export interface TradeRosterAudit {
  removedPreferences: RosterControl['preferences'];
  invalidatedOverrides: {
    gameId: string;
    squadId: string;
    fields: ('lineup' | 'starterId' | 'benchIds')[];
  }[];
}

export type TradeRosterResult = { modelVersion: 'trade-roster-plan-v1'; transactionId: string } & (
  | { status: 'blocked'; issues: TradeRosterIssue[] }
  | {
      status: 'ready';
      changes: TradeRosterState;
      playerMoves: TradePlayerMove[];
      audit: TradeRosterAudit;
    }
);
