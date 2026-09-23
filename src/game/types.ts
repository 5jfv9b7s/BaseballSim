import type { GameModelVersion } from './model-registry.ts';
import type { Ability, Count, Fixture, PitchRecord, Player, RngState } from '../engine/types.ts';

export type TeamSide = 'home' | 'away';
export type Position = 'C' | '1B' | '2B' | '3B' | 'SS' | 'LF' | 'CF' | 'RF' | 'DH' | 'P';
export type AppearanceOutcome =
  'single' | 'double' | 'triple' | 'homeRun' | 'walk' | 'hitByPitch' | 'strikeout' | 'battedOut';

export interface GamePlayer extends Player {
  powerVsRight: Ability;
  powerVsLeft: Ability;
  runningSpeed: Ability;
  fieldingRange: Ability;
  armStrength: Ability;
}

export interface Team {
  side: TeamSide;
  clubId: string;
  name: string;
  lineup: { playerId: string; position: Exclude<Position, 'P'> }[];
  pitcherIds: string[];
}

export interface GameFixture extends Omit<Fixture, 'players' | 'matchup'> {
  players: GamePlayer[];
  teams: { home: Team; away: Team };
}

export interface Runner {
  runInstanceId: string;
  originalRunnerId: string;
  currentRunnerId: string;
  responsiblePitcherId: string;
  reachedEventSeq: number;
  reachedReason: AppearanceOutcome;
}

export interface Situation {
  inning: number;
  half: 'top' | 'bottom';
  outs: number;
  score: Record<TeamSide, number>;
  count: Count;
  baseOccupants: [Runner | null, Runner | null, Runner | null];
}

export interface GameState extends Situation {
  /** v1保存では省略。存在する場合は対応する版を厳密に使用する。 */
  simulationVersion?: GameModelVersion;
  gameId: string;
  phase: 'readyForPitch' | 'halfComplete' | 'gameComplete' | 'aborted';
  nextEventSeq: number;
  nextAppearanceNo: number;
  appearanceStartSeq: number;
  paPitches: number;
  totalPitches: number;
  lineupIndex: Record<TeamSide, number>;
  pitcherIndex: Record<TeamSide, number>;
  pitcherPitchCounts: Record<string, number>;
  innings: { away: number[]; home: (number | null)[] };
  rng: RngState;
  endReason: 'regulation' | 'walkOff' | 'draw' | 'pitchLimit' | null;
}

export interface BattedBall {
  sourcePitchSeq: number;
  exitVelocityCentiKph: number;
  launchAngleCentiDegree: number;
  launchSprayAngleCentiDegree: number;
  fairBearingCentiDegree: number;
  type: 'ground' | 'line' | 'fly' | 'popup';
  isBunt: false;
  fairStatus: 'fair';
  directionCode: 'left' | 'leftCenter' | 'center' | 'rightCenter' | 'right';
  directionDefinitionVersion: 'design-v1.0';
  terminalLocation: { xMm: number; yMm: number };
  flightTimeMs: number;
  distanceMm: number;
  fenceDistanceMm: number;
  fielderId: string | null;
  fieldingPosition: Position | null;
  fielderDistanceMm: number | null;
  fielderReachMm: number | null;
  fieldingTimeMs: number | null;
  batterFirstBaseTimeMs: number;
  projectedBases: 0 | 1 | 2 | 3 | 4;
  modelVersion: 'batted-ball-prototype-v1' | 'batted-ball-prototype-v2';
  /** v2のみ。捕球域外の打球を回収し各塁へ返球できる最短時間。 */
  returnTimeMs?: { second: number; third: number; home: number } | null;
}

export interface RunnerAction {
  runInstanceId: string;
  runnerId: string;
  from: 'batter' | 1 | 2 | 3;
  to: 1 | 2 | 3 | 'home';
  responsiblePitcherId: string;
  reason: AppearanceOutcome;
  orderInPlay: number;
}

export interface ScoringCredit {
  creditId: string;
  playerId: string;
  clubId: string;
  category: 'batting' | 'pitching';
  metricCode: string;
  amount: number;
  sourceEventSeq: number;
  ruleRef:
    | 'game-rules-prototype-v1'
    | 'game-rules-prototype-v2'
    | 'game-rules-prototype-v3'
    | 'game-rules-prototype-v4';
}

export interface PitchDecision {
  modelVersion: 'pitch-prototype-v2' | 'pitch-prototype-v3';
  swingProbability: number;
  contactProbability: number | null;
  foulProbability: number | null;
  bodyThreat: boolean;
  avoidanceShiftMm: number | null;
  hitByPitch: boolean;
}
export interface GameEvent {
  /** v3以降の投球だけ。判断過程を保存し、調査・再現で確認できる。 */
  pitchDecision?: PitchDecision;
  gameId: string;
  attemptNo: 1;
  eventSeq: number;
  kind: 'pitch' | 'substitution' | 'halfEnd' | 'aborted';
  before: Situation;
  after: Situation;
  appearanceId: string | null;
  pitch: (Omit<PitchRecord, 'ruling'> & { ruling: PitchRecord['ruling'] | 'hitByPitch' }) | null;
  battedBall: BattedBall | null;
  outcome: AppearanceOutcome | null;
  runnerActions: RunnerAction[];
  outDecisions: {
    playerId: string;
    creditedPitcherId: string;
    kind: 'strikeout' | 'battedOut';
    countsTowardInning: true;
  }[];
  runDecisions: {
    runInstanceId: string;
    playerId: string;
    responsiblePitcherId: string;
    earned: true;
  }[];
  substitution: { side: TeamSide; outPlayerId: string; inPlayerId: string } | null;
  credits: ScoringCredit[];
  rngAfter: RngState;
  simulationVersion: GameModelVersion;
  rulesetVersion:
    | 'game-rules-prototype-v1'
    | 'game-rules-prototype-v2'
    | 'game-rules-prototype-v3'
    | 'game-rules-prototype-v4';
}

export interface BattingLine {
  playerId: string;
  plateAppearances: number;
  atBats: number;
  hits: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  runs: number;
  runsBattedIn: number;
  walks: number;
  hitByPitch: number;
  strikeouts: number;
}
export interface PitchingLine {
  playerId: string;
  pitches: number;
  battersFaced: number;
  outsRecorded: number;
  hitsAllowed: number;
  homeRunsAllowed: number;
  strikeouts: number;
  walks: number;
  hitBatters: number;
  runsAllowed: number;
  earnedRuns: number;
}
export interface GameResult {
  gameId: string;
  resultRevision: 1;
  winner: TeamSide | 'draw';
  score: Record<TeamSide, number>;
  innings: GameState['innings'];
  batting: BattingLine[];
  pitching: PitchingLine[];
  totalPitches: number;
  completedAppearances: number;
  contributionKey: string;
}

export interface GameRecord {
  kind:
    | 'completed-game-prototype-v1'
    | 'running-game-prototype-v1'
    | 'completed-game-prototype-v2'
    | 'running-game-prototype-v2'
    | 'completed-game-prototype-v3'
    | 'running-game-prototype-v3'
    | 'completed-game-prototype-v4'
    | 'running-game-prototype-v4';
  seed: number;
  fixture: GameFixture;
  state: GameState;
  events: GameEvent[];
  result: GameResult | null;
}
