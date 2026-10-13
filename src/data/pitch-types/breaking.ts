import { PITCH_TYPES } from './index.ts';
import type { PitchProfile } from '../../engine/pitch-profile-types.ts';

/** 未校正の架空テンプレート。球速・制球・再現性は投手の持ち球を参照する。 */
export const profiles: PitchProfile[] = [
  {
    code: 'slider',
    name: PITCH_TYPES.slider.name,
    selection: { baseWeight: 30, twoStrike: 1.2, threeBall: 0.8, oppositeSide: 0.9 },
    delivery: {
      spinRateRpm: 2300,
      spinSpreadRpm: 200,
      spinAxis: { xPpm: 0, yPpm: 0, zPpm: 1000000 },
      release: { lateralMm: -450, heightMm: 1800, extensionMm: 1700 },
    },
  },
  {
    code: 'curve',
    name: PITCH_TYPES.curve.name,
    selection: { baseWeight: 16, twoStrike: 1.15, threeBall: 0.7, oppositeSide: 1 },
    delivery: {
      spinRateRpm: 2400,
      spinSpreadRpm: 200,
      spinAxis: { xPpm: 800000, yPpm: 0, zPpm: 600000 },
      release: { lateralMm: -450, heightMm: 1800, extensionMm: 1700 },
    },
  },
  {
    code: 'sweeper',
    name: PITCH_TYPES.sweeper.name,
    selection: { baseWeight: 18, twoStrike: 1.2, threeBall: 0.7, oppositeSide: 0.85 },
    delivery: {
      spinRateRpm: 2700,
      spinSpreadRpm: 230,
      spinAxis: { xPpm: 0, yPpm: 0, zPpm: 1000000 },
      release: { lateralMm: -450, heightMm: 1800, extensionMm: 1700 },
    },
  },
];
