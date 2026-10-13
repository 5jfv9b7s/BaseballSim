import { PITCH_TYPES } from './index.ts';
import type { PitchProfile } from '../../engine/pitch-profile-types.ts';

/** 未校正の架空テンプレート。球速・制球・再現性は投手の持ち球を参照する。 */
export const profiles: PitchProfile[] = [
  {
    code: 'fork',
    name: PITCH_TYPES.fork.name,
    selection: { baseWeight: 20, twoStrike: 1.4, threeBall: 0.6, oppositeSide: 1.1 },
    delivery: {
      spinRateRpm: 600,
      spinSpreadRpm: 250,
      spinAxis: { xPpm: -1000000, yPpm: 0, zPpm: 0 },
      release: { lateralMm: -450, heightMm: 1800, extensionMm: 1700 },
    },
  },
  {
    code: 'splitter',
    name: PITCH_TYPES.splitter.name,
    selection: { baseWeight: 18, twoStrike: 1.3, threeBall: 0.7, oppositeSide: 1.1 },
    delivery: {
      spinRateRpm: 900,
      spinSpreadRpm: 200,
      spinAxis: { xPpm: -1000000, yPpm: 0, zPpm: 0 },
      release: { lateralMm: -450, heightMm: 1800, extensionMm: 1700 },
    },
  },
  {
    code: 'changeup',
    name: PITCH_TYPES.changeup.name,
    selection: { baseWeight: 18, twoStrike: 1.1, threeBall: 0.8, oppositeSide: 1.2 },
    delivery: {
      spinRateRpm: 1200,
      spinSpreadRpm: 170,
      spinAxis: { xPpm: -600000, yPpm: 0, zPpm: -800000 },
      release: { lateralMm: -450, heightMm: 1800, extensionMm: 1700 },
    },
  },
];
