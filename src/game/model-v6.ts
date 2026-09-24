import { GAME_MODEL_V5 } from './model-v5.ts';

export const GAME_MODEL_V6 = Object.freeze({
  ...GAME_MODEL_V5,
  version: 'game-prototype-v6',
  rulesetVersion: 'game-rules-prototype-v6',
  pitchModelVersion: 'pitch-prototype-v4',
} as const);
