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

/** v0.2の試作世界。契約・育成・疲労を実装済みの空データで補わない。 */
export interface WorldSquad {
  squadId: string;
  /** v3定義のみ。控え候補の区分で、一軍登録やベンチ入りを表すものではない。 */
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
  version: 'world-definitions-v1' | 'world-definitions-v2' | 'world-definitions-v3';
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
  statScope: 'firstRegular';
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
  statScope: 'firstRegular';
  completedOn: string;
  games: number;
  standingsRule: WorldDefinitions['standingsRule'];
  clubs: ReturnType<typeof import('./stats.ts').standings>;
  stats: SeasonStats;
  title: { status: 'decided'; squadId: string } | { status: 'unresolved'; squadIds: string[] };
}
