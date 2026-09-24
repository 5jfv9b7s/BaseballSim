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
  version: 'world-definitions-v1';
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

export interface WorldRecord {
  version: 'world-prototype-v1';
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
