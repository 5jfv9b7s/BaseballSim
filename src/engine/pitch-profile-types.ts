import type { PitchTypeCode } from '../data/pitch-types/index.ts';

export interface SpinAxis {
  xPpm: number;
  yPpm: number;
  zPpm: number;
}
export interface PitchDelivery {
  spinRateRpm: number;
  spinSpreadRpm: number;
  /** 右投手の軸。左投手ではzを反転する（捕手視点）。 */
  spinAxis: SpinAxis;
  release: { lateralMm: number; heightMm: number; extensionMm: number };
}
export interface PitchProfile {
  code: PitchTypeCode;
  name: string;
  selection: { baseWeight: number; twoStrike: number; threeBall: number; oppositeSide: number };
  delivery: PitchDelivery;
}
export interface PitchProfileConfig {
  version: 'pitch-shape-v1';
  profiles: PitchProfile[];
  movement: {
    referenceVelocityCentiKph: number;
    breakMmPerRpm: number;
    recognitionBase: number;
    recognitionDiscipline: number;
    contactPenaltyPerMeter: number;
  };
}
