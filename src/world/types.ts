import type { MatchConfig } from '../game/config.ts';
import type { ErrorConfig } from '../game/error-config.ts';
import type {
  BattingLine,
  PitchingLine,
  FieldingLine,
  GameFixture,
  GameRecord,
  Team,
} from '../game/types.ts';

/** 段階別の世界定義。契約・育成など未実装のモデルを空データで補わない。 */
export interface WorldSquad {
  squadId: string;
  conditionInputs?: import('./condition-types.ts').ConditionInput[];
  physicalInputs?: import('./physical-types.ts').PhysicalInput[];
  /** v5定義の入れ替え方針・全選手の固定希望。 */
  rosterPolicyInput?: import('./roster-policy-types.ts').RosterPolicyInput;
  /** v4以降の定義の初期登録・資格。 */
  registrationInputs?: import('./registration-types.ts').RegistrationInput[];
  /** v3以降の定義。野手候補の区分で、登録・ベンチ入りとは別に保持する。 */
  reserveBatterIds?: string[];
  team: Omit<Team, 'side'>;
  players: GameFixture['players'];
  pitches: GameFixture['pitches'];
}

export interface ScheduledGame {
  gameId: string;
  date: string;
  awaySquadId: string;
  homeSquadId: string;
}

export interface WorldDefinitions {
  version:
    | 'world-definitions-v1'
    | 'world-definitions-v2'
    | 'world-definitions-v3'
    | 'world-definitions-v4'
    | 'world-definitions-v5'
    | 'world-definitions-v6'
    | 'world-definitions-v7'
    | 'world-definitions-v8'
    | 'world-definitions-v9'
    | 'world-definitions-v10'
    | 'world-definitions-v11'
    | 'world-definitions-v12'
    | 'world-definitions-v13';
  bullpenConfig?: import('../game/bullpen-types.ts').BullpenConfig;
  bullpenInputs?: import('./bullpen.ts').BullpenInput[];
  reliefConfig?: import('../game/relief-types.ts').ReliefConfig;
  reliefPolicyInputs?: import('./relief-types.ts').ReliefPolicyInput[];
  fielderRestModelVersion?: 'fielder-rest-v1';
  fielderRestInputs?: import('./fielder-rest-types.ts').FielderRestInput[];
  performanceConfig?: import('../game/performance-types.ts').PerformanceConfig;
  conditionConfig?: import('./condition-types.ts').ConditionConfig;
  restModelVersion?: 'pitcher-rest-v1';
  restPolicyInputs?: import('./rest-types.ts').RestPolicyInput[];
  physicalConfig?: import('./physical-types.ts').PhysicalConfig;
  farm?: import('./farm-types.ts').FarmCompetition;
  registrationRules?: import('./registration-types.ts').RegistrationRules;
  seasonId: string;
  competitionId: string;
  statScope: 'firstRegular';
  name: string;
  startDate: string;
  endDate: string;
  squads: WorldSquad[];
  schedule: ScheduledGame[];
  matchConfig: MatchConfig;
  errorConfig: ErrorConfig;
  standingsRule: 'win-percentage-shared-rank-v1';
  seedRule: 'game-id-fnv1a32-v1';
}

export interface StatKey {
  seasonId: string;
  competitionId: string;
  statScope: 'firstRegular' | 'farmRegular';
  squadId: string;
}

export interface TeamCounters {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  runsFor: number;
  runsAgainst: number;
}

export type TeamStats = StatKey & TeamCounters;
export type MatchupStats = TeamStats & { opponentSquadId: string };
export type SeasonBatting = StatKey & BattingLine;
export type SeasonPitching = StatKey & PitchingLine;
export type SeasonFielding = StatKey & FieldingLine;

export interface SeasonStats {
  teams: TeamStats[];
  matchups: MatchupStats[];
  batting: SeasonBatting[];
  pitching: SeasonPitching[];
  fielding: SeasonFielding[];
}

export interface GameContribution {
  gameId: string;
  attemptNo: 1;
  resultRevision: 1;
  stats: SeasonStats;
}

export interface StatApplicationMarker {
  attemptNo: 1;
  resultRevision: 1;
  /** 正規化した寄与のFNV識別子。保存完全性のSHA-256とは用途を分ける。 */
  contributionHash: string;
}

export interface WorldState {
  worldId: string;
  seed: number;
  definitions: WorldDefinitions;
  currentDate: string;
  dayPlan: { date: string; gameIds: string[]; cursor: number };
  completedDates: string[];
  lastCompletedDate: string | null;
  games: Record<string, GameRecord>;
  contributions: Record<string, GameContribution>;
  statApplicationMarkers: Record<string, StatApplicationMarker>;
  stats: SeasonStats;
}

export type WorldPhase = 'playing' | 'readyToComplete' | 'scheduleComplete' | 'aborted';

/** データ設計書6.2のうち、DH制の起用設定に使う射影。 */
export interface IdealLineup {
  battingOrder: {
    slotNo: number;
    playerId: string;
    battingRole: Team['lineup'][number]['position'];
  }[];
  defense: {
    positionCode: import('../game/types.ts').DefensivePosition;
    playerId: string | null;
  }[];
  dhEnabled: true;
}

export interface PitcherUsagePlan {
  rotationSlots: { slotNo: number; playerId: string }[];
  nextSlotNo: number;
  /** 今回は通常救援の優先順だけ。条件別役割・準備・疲労は未対応。 */
  reliefRoles: { playerId: string; role: 'relief'; priority: number }[];
}

export type ManagementAction =
  | import('./relief-types.ts').ReliefPolicyAction
  | import('./fielder-rest-types.ts').FielderRestAction
  | import('./rest-types.ts').RestPolicyAction
  | import('./roster-policy-types.ts').RosterPolicyAction
  | import('./registration-types.ts').RegistrationAction
  | { kind: 'setClubPlan'; squadId: string; lineup: IdealLineup; pitchers: PitcherUsagePlan }
  | { kind: 'setGameLineup'; squadId: string; gameId: string; lineup: IdealLineup | null }
  | { kind: 'setGameStarter'; squadId: string; gameId: string; playerId: string | null };

export interface ClubManagement {
  version: 'club-management-v1';
  controlledSquadId: string;
  idealLineups: Record<string, IdealLineup>;
  pitcherUsagePlans: Record<string, PitcherUsagePlan>;
  policyRevisions: Record<string, number>;
  starterOverrides: Record<string, string>;
  actions: { commandId: string; sequence: number; date: string; action: ManagementAction }[];
}

export type WorldRecord = WorldState &
  (
    | { version: 'world-prototype-v1' }
    | { version: 'world-prototype-v2'; management: ClubManagement }
    | {
        version: 'world-prototype-v14';
        reliefControl: import('./relief-types.ts').ReliefControl;
        fielderRest: import('./fielder-rest-types.ts').FielderRestControl;
        condition: import('./condition-types.ts').ConditionWorldState;
        restControl: import('./rest-types.ts').RestControl;
        physical: import('./physical-types.ts').PhysicalWorldState;
        management: ClubManagement;
        seasonSummary: SeasonSummary | null;
        farmSummary: SeasonSummary | null;
        gameLineups: Record<string, IdealLineup>;
        registration: import('./registration-types.ts').RegistrationState;
        rosterControl: import('./roster-policy-types.ts').RosterControl;
      }
    | {
        version: 'world-prototype-v13';
        reliefControl: import('./relief-types.ts').ReliefControl;
        fielderRest: import('./fielder-rest-types.ts').FielderRestControl;
        condition: import('./condition-types.ts').ConditionWorldState;
        restControl: import('./rest-types.ts').RestControl;
        physical: import('./physical-types.ts').PhysicalWorldState;
        management: ClubManagement;
        seasonSummary: SeasonSummary | null;
        farmSummary: SeasonSummary | null;
        gameLineups: Record<string, IdealLineup>;
        registration: import('./registration-types.ts').RegistrationState;
        rosterControl: import('./roster-policy-types.ts').RosterControl;
      }
    | {
        version: 'world-prototype-v12';
        fielderRest: import('./fielder-rest-types.ts').FielderRestControl;
        condition: import('./condition-types.ts').ConditionWorldState;
        restControl: import('./rest-types.ts').RestControl;
        physical: import('./physical-types.ts').PhysicalWorldState;
        management: ClubManagement;
        seasonSummary: SeasonSummary | null;
        farmSummary: SeasonSummary | null;
        gameLineups: Record<string, IdealLineup>;
        registration: import('./registration-types.ts').RegistrationState;
        rosterControl: import('./roster-policy-types.ts').RosterControl;
      }
    | {
        version: 'world-prototype-v11';
        condition: import('./condition-types.ts').ConditionWorldState;
        restControl: import('./rest-types.ts').RestControl;
        physical: import('./physical-types.ts').PhysicalWorldState;
        management: ClubManagement;
        seasonSummary: SeasonSummary | null;
        farmSummary: SeasonSummary | null;
        gameLineups: Record<string, IdealLineup>;
        registration: import('./registration-types.ts').RegistrationState;
        rosterControl: import('./roster-policy-types.ts').RosterControl;
      }
    | {
        version: 'world-prototype-v10';
        condition: import('./condition-types.ts').ConditionWorldState;
        restControl: import('./rest-types.ts').RestControl;
        physical: import('./physical-types.ts').PhysicalWorldState;
        management: ClubManagement;
        seasonSummary: SeasonSummary | null;
        farmSummary: SeasonSummary | null;
        gameLineups: Record<string, IdealLineup>;
        registration: import('./registration-types.ts').RegistrationState;
        rosterControl: import('./roster-policy-types.ts').RosterControl;
      }
    | {
        version: 'world-prototype-v9';
        restControl: import('./rest-types.ts').RestControl;
        physical: import('./physical-types.ts').PhysicalWorldState;
        management: ClubManagement;
        seasonSummary: SeasonSummary | null;
        farmSummary: SeasonSummary | null;
        gameLineups: Record<string, IdealLineup>;
        registration: import('./registration-types.ts').RegistrationState;
        rosterControl: import('./roster-policy-types.ts').RosterControl;
      }
    | {
        version: 'world-prototype-v8';
        physical: import('./physical-types.ts').PhysicalWorldState;
        management: ClubManagement;
        seasonSummary: SeasonSummary | null;
        farmSummary: SeasonSummary | null;
        gameLineups: Record<string, IdealLineup>;
        registration: import('./registration-types.ts').RegistrationState;
        rosterControl: import('./roster-policy-types.ts').RosterControl;
      }
    | {
        version: 'world-prototype-v7';
        management: ClubManagement;
        seasonSummary: SeasonSummary | null;
        farmSummary: SeasonSummary | null;
        gameLineups: Record<string, IdealLineup>;
        registration: import('./registration-types.ts').RegistrationState;
        rosterControl: import('./roster-policy-types.ts').RosterControl;
      }
    | {
        version: 'world-prototype-v6';
        management: ClubManagement;
        seasonSummary: SeasonSummary | null;
        gameLineups: Record<string, IdealLineup>;
        registration: import('./registration-types.ts').RegistrationState;
        rosterControl: import('./roster-policy-types.ts').RosterControl;
      }
    | {
        version: 'world-prototype-v5';
        management: ClubManagement;
        seasonSummary: SeasonSummary | null;
        gameLineups: Record<string, IdealLineup>;
        registration: import('./registration-types.ts').RegistrationState;
      }
    | {
        version: 'world-prototype-v4';
        management: ClubManagement;
        seasonSummary: SeasonSummary | null;
        gameLineups: Record<string, IdealLineup>;
      }
    | {
        version: 'world-prototype-v3';
        management: ClubManagement;
        seasonSummary: SeasonSummary | null;
      }
  );
export type ManagedWorld = Extract<WorldRecord, { management: ClubManagement }>;

export interface SeasonSummary {
  version: 'season-summary-v1';
  seasonId: string;
  competitionId: string;
  statScope: StatKey['statScope'];
  completedOn: string;
  games: number;
  standingsRule: WorldDefinitions['standingsRule'];
  clubs: ReturnType<typeof import('./stats.ts').standings>;
  stats: SeasonStats;
  title: { status: 'decided'; squadId: string } | { status: 'unresolved'; squadIds: string[] };
}
