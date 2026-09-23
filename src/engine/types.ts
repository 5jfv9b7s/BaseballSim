/** 1球試作専用の射影。設計書の全選手・全世界セーブ型ではない。 */
export type Id = string;
export type RatingMilli = number; // 整数 0..120000。境界で検査する。
export type CentiKph = number;
export type Millimeter = number;
export type Side = 'R' | 'L';
export type PitchType = import('../data/pitch-types/index.ts').PitchTypeCode;
export type Count = { balls: number; strikes: number };
export type Ability = { valueMilli: RatingMilli; ceilingMilli: RatingMilli };
export type Location = { xMm: Millimeter; zMm: Millimeter };
export type ZoneBounds = { leftMm: number; rightMm: number; bottomMm: number; topMm: number };
export type ZoneCode =
  | `S_${'L' | 'M' | 'H'}${'L' | 'C' | 'R'}`
  | `B_${'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW'}`;
export interface Player {
  playerId: Id;
  familyName: string;
  givenName: string;
  throwingHand: Side;
  battingHand: Side | 'S';
  batting: { contactVsRight: Ability; contactVsLeft: Ability; plateDiscipline: Ability };
  swingAggressionMilli: number;
}
export interface PitchRepertoire {
  pitchId: Id;
  playerId: Id;
  pitchTypeCode: PitchType;
  acquisitionProgressMilli: number;
  control: Ability;
  repeatability: Ability;
  velocity: { typicalCentiKph: CentiKph; maxCentiKph: CentiKph; spreadCentiKph: CentiKph };
}
export interface Fixture {
  initialDatasetVersion: string;
  clubs: { clubId: Id; name: string; playerIds: Id[] }[];
  players: Player[];
  pitches: PitchRepertoire[];
  matchup: { pitcherId: Id; batterId: Id; catcherId: Id };
}
export interface RngState {
  streamId: Id;
  algorithmVersion: 'xorshift32-v1';
  fullState: { word: number };
  drawCount: number;
}
export interface PrototypeState {
  kind: 'pitch-lab-v1';
  gameId: Id;
  attemptNo: 1;
  activeAppearanceId: Id;
  phase: 'readyForPitch' | 'prototypeStopped';
  count: Count;
  nextEventSeq: number;
  rng: RngState;
  simulationVersion: 'pitch-prototype-v1';
  rulesetVersion: 'pitch-lab-rules-v1';
  initialDatasetVersion: string;
}
export type Ruling = 'ball' | 'calledStrike' | 'swingingStrike' | 'foul' | 'inPlay';
export type StopReason = 'walkPending' | 'strikeoutPending' | 'inPlayPending';
export interface PitchRecord {
  gameId: Id;
  eventSeq: number;
  attemptNo: 1;
  appearanceId: Id;
  pitcherId: Id;
  batterId: Id;
  catcherId: Id;
  throwingSide: Side;
  battingSide: Side;
  pitchId: Id;
  pitchTypeCode: PitchType;
  countBefore: Count;
  velocityCentiKph: CentiKph;
  intendedLocation: Location;
  actualLocation: Location;
  zoneBounds: ZoneBounds;
  zoneCode: ZoneCode;
  zoneDefinitionVersion: 'design-v1.0';
  action: 'take' | 'swing';
  contact: 'none' | 'foul' | 'fair';
  ruling: Ruling;
  measurement: {
    spinRateRpm: null;
    spinAxis: null;
    release: null;
    horizontalBreakMm: null;
    verticalBreakMm: null;
    modelOutputVersion: 'endpoint-only-v1';
    availableFields: [];
  };
  measurementModelVersion: 'endpoint-only-v1';
}
export interface PitchStep {
  state: PrototypeState;
  event: {
    kind: 'pitch';
    gameId: Id;
    eventSeq: number;
    sourceCommandId: Id;
    simulationVersion: string;
    rulesetVersion: string;
    before: { count: Count };
    after: { count: Count };
    status: 'pitchOnly' | 'requiresResolution';
    stopReason: StopReason | null;
    pitch: PitchRecord;
  };
  trace: {
    selectionWeights: { pitchId: Id; weight: number }[];
    positionErrorHalfWidthMm: number;
    velocityHalfWidthCentiKph: number;
    swingProbability: number;
    contactProbability: number | null;
    foulProbability: number | null;
    rngBefore: RngState;
    rngAfter: RngState;
  };
}
