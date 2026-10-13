import { PITCH_TYPES } from './index.ts';
import type { PitchProfile } from '../../engine/pitch-profile-types.ts';

/** 未校正の架空テンプレート。球速・制球・再現性は投手の持ち球を参照する。 */
export const profiles: PitchProfile[] = [
  {
    code: 'fastball',
    name: PITCH_TYPES.fastball.name,
    selection: { baseWeight: 50, twoStrike: 0.8, threeBall: 1.4, oppositeSide: 1 },
    delivery: {
      spinRateRpm: 2200,
      spinSpreadRpm: 120,
      spinAxis: { xPpm: -1000000, yPpm: 0, zPpm: 0 },
      release: { lateralMm: -450, heightMm: 1800, extensionMm: 1700 },
    },
  },
  {
    code: 'cutter',
    name: PITCH_TYPES.cutter.name,
    selection: { baseWeight: 18, twoStrike: 1.1, threeBall: 1, oppositeSide: 0.95 },
    delivery: {
      spinRateRpm: 2200,
      spinSpreadRpm: 170,
      spinAxis: { xPpm: -800000, yPpm: 0, zPpm: 600000 },
      release: { lateralMm: -450, heightMm: 1800, extensionMm: 1700 },
    },
  },
  {
    code: 'sinker',
    name: PITCH_TYPES.sinker.name,
    selection: { baseWeight: 18, twoStrike: 1, threeBall: 1, oppositeSide: 1.1 },
    delivery: {
      spinRateRpm: 1600,
      spinSpreadRpm: 180,
      spinAxis: { xPpm: -600000, yPpm: 0, zPpm: -800000 },
      release: { lateralMm: -450, heightMm: 1800, extensionMm: 1700 },
    },
  },
];
