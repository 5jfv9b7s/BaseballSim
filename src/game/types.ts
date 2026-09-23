import type { MatchConfig } from './config.ts';
import type { GameModelVersion } from './model-registry.ts';
import type { Ability, Count, Fixture, PitchRecord, Player, RngState } from '../engine/types.ts';

export type TeamSide = 'home' | 'away';
export type Position = 'C' | '1B' | '2B' | '3B' | 'SS' | 'LF' | 'CF' | 'RF' | 'DH' | 'P';
export type AppearanceOutcome =
  | 'single'
  | 'double'
  | 'triple'
  | 'homeRun'
  | 'walk'
  | 'hitByPitch'
  | 'strikeout'
  | 'battedOut'
  | 'sacrificeFly'
  | 'fieldersChoice';

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
  /** v7以降。開始時の設定全体を固定し、保存・再実行にも使用する。 */
  config?: MatchConfig;
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
  modelVersion:
    | 'batted-ball-prototype-v1'
    | 'batted-ball-prototype-v2'
    | 'batted-ball-prototype-v3'
    | 'batted-ball-prototype-v4';
  /** v7以降。打球接触から捕球までの時間と捕球地点（mm）。 */
  fieldingContact?: { timeMs: number; location: { xMm: number; yMm: number } } | null;
  /** v5以降。打球速度の計算前に適用した接触優先の仮定。旧記録には追加しない。 */
  contactQuality?: { approach: 'normal' | 'protect'; exitSpeedPenaltyCentiKph: number };
  /** v2以降。捕球域外の打球を回収し各塁へ返球できる最短時間。 */
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
  category: 'batting' | 'pitching' | 'fielding';
  /** 守備成績だけ。位置別の集計キー。 */
  position?: DefensivePosition;
  metricCode: string;
  amount: number;
  sourceEventSeq: number;
  ruleRef:
    | 'game-rules-prototype-v1'
    | 'game-rules-prototype-v2'
    | 'game-rules-prototype-v3'
    | 'game-rules-prototype-v4'
    | 'game-rules-prototype-v5'
    | 'game-rules-prototype-v6'
    | 'game-rules-prototype-v7'
    | 'game-rules-prototype-v8'
    | 'game-rules-prototype-v9';
}

export interface PitchDecision {
  modelVersion:
    'pitch-prototype-v2' | 'pitch-prototype-v3' | 'pitch-prototype-v4' | 'pitch-prototype-v5';
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
  fieldingEvaluation?: FieldingEvaluation;
  /** v9の投球時のみ。守備参加者とアウトに関わる動作を保存する。 */
  defensiveAlignment?: Defender[];
  fieldingActions?: FieldingAction[];
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
    kind: 'strikeout' | 'battedOut' | 'forceOut';
    runInstanceId?: string;
    orderInPlay?: number;
    atBase?: 1 | 2;
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
    | 'game-rules-prototype-v4'
    | 'game-rules-prototype-v5'
    | 'game-rules-prototype-v6'
    | 'game-rules-prototype-v7'
    | 'game-rules-prototype-v8'
    | 'game-rules-prototype-v9';
}

export interface BattingLine {
  /** v8以降。安打に含めない野手選択の打席数。 */
  fieldersChoices?: number;
  /** v7以降。旧モデルでは未対応のため項目自体を省略する。 */
  sacrificeFlies?: number;
  groundedIntoDoublePlays?: number;
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
  /** v9以降。旧版の未対応成績は作らない。 */
  fielding?: FieldingLine[];
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
    | 'running-game-prototype-v4'
    | 'completed-game-prototype-v5'
    | 'running-game-prototype-v5'
    | 'completed-game-prototype-v6'
    | 'running-game-prototype-v6'
    | 'completed-game-prototype-v7'
    | 'running-game-prototype-v7'
    | 'completed-game-prototype-v8'
    | 'running-game-prototype-v8'
    | 'completed-game-prototype-v9'
    | 'running-game-prototype-v9';
  seed: number;
  fixture: GameFixture;
  state: GameState;
  events: GameEvent[];
  result: GameResult | null;
}

/** 対象プレーだけの判断記録。未対応の守備成績を完成済みとして生成しない。 */
export interface FieldingEvaluation {
  modelVersion: 'in-play-prototype-v1' | 'in-play-prototype-v2';
  /** v8以降。併殺候補がどの結果になったかを明示する。 */
  resolution?: 'doublePlay' | 'fieldersChoice' | 'battedOut' | 'sacrificeFly';
  play: 'doublePlay' | 'tagUp';
  preparationTimeMs: number;
  /** 元の候補プレー（併殺またはタッチアップ）が成立したか。野選はfalse。 */
  completed: boolean;
  participants: { playerId: string; position: Position; role: 'field' | 'pivot' | 'receive' }[];
  /** すべて打球接触を0とした時刻（ms）。同時到達は走者優先の試作規則。 */
  defenseArrivalMs: number[];
  runnerArrivalMs: number[];
}

export type DefensivePosition = Exclude<Position, 'DH'>;

export interface Defender {
  playerId: string;
  position: DefensivePosition;
}

/** v9で扱うアウトプレーの動作。時刻や未計算の失策情報は補完しない。 */
export interface FieldingAction extends Defender {
  actionSeq: number;
  kind: 'field' | 'catch' | 'throw' | 'receive' | 'putout';
  targetPlayerId?: string;
  targetBase?: 1 | 2;
  /** 同じイベントのoutDecisionsへの0始まり参照。刺殺の動作だけに付ける。 */
  outDecisionIndex?: number;
  /** アウトを成立させた送球の参照。間に合わない送球には付けない。 */
  assistedOutIndices?: number[];
}

export interface FieldingLine extends Defender {
  gamesAtPosition: number;
  /** 守備位置についている間に取ったチームのアウト数。刺殺とは別。 */
  fieldingOuts: number;
  putouts: number;
  assists: number;
  doublePlayParticipations: number;
}
