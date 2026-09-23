import { GAME_MODEL } from './model.ts';

const { angleSpanDegrees: _legacyAngleSpan, ...sharedModel } = GAME_MODEL;

export const GAME_MODEL_V2 = Object.freeze({
  ...sharedModel,
  version: 'game-prototype-v2',
  rulesetVersion: 'game-rules-prototype-v2',
  battedBallVersion: 'batted-ball-prototype-v2',
  angleMinimumDegrees: -45,
  angleModeDegrees: 5,
  angleMaximumDegrees: 75,
  fielderAccelerationMetersPerSecond2: 8,
  runnerLeadMeters: 3,
  runnerReactionSeconds: 0.2,
  extraBaseSafetySeconds: 0.8,
} as const);
