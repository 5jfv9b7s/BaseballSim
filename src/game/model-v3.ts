import { GAME_MODEL_V2 } from './model-v2.ts';
export const GAME_MODEL_V3 = Object.freeze({
  ...GAME_MODEL_V2,
  version: 'game-prototype-v3',
  rulesetVersion: 'game-rules-prototype-v3',
  pitchModelVersion: 'pitch-prototype-v2',
} as const);
