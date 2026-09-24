import { GAME_MODEL_V6 } from './model-v6.ts';

/** アルゴリズムの版。可変係数は各試合のconfigと保存定義ブロックのハッシュで識別する。 */
export const GAME_MODEL_V7 = Object.freeze({
  version: 'game-prototype-v7',
  rulesetVersion: 'game-rules-prototype-v7',
  pitchModelVersion: 'pitch-prototype-v5',
  battedBallVersion: 'batted-ball-prototype-v4',
  configSchemaVersion: 'match-config-v1',
  datasetVersion: GAME_MODEL_V6.datasetVersion,
  regulationInnings: GAME_MODEL_V6.regulationInnings,
  maximumInnings: GAME_MODEL_V6.maximumInnings,
  maxGamePitches: GAME_MODEL_V6.maxGamePitches,
  maxAppearancePitches: GAME_MODEL_V6.maxAppearancePitches,
  starterPitchLimit: GAME_MODEL_V6.starterPitchLimit,
  relieverPitchLimit: GAME_MODEL_V6.relieverPitchLimit,
  baseDistanceMeters: GAME_MODEL_V6.baseDistanceMeters,
} as const);
