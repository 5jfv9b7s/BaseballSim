import { GAME_MODEL_V3 } from './model-v3.ts';

export const GAME_MODEL_V4 = Object.freeze({
  ...GAME_MODEL_V3,
  version: 'game-prototype-v4',
  rulesetVersion: 'game-rules-prototype-v4',
  pitchModelVersion: 'pitch-prototype-v3',
} as const);
