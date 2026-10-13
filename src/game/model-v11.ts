import { GAME_MODEL_V10 } from './model-v10.ts';

/** 球種別の回転・変化量と認識を追加する未校正の投球モデル。 */
export const GAME_MODEL_V11 = Object.freeze({
  ...GAME_MODEL_V10,
  version: 'game-prototype-v11',
  rulesetVersion: 'game-rules-prototype-v11',
  pitchModelVersion: 'pitch-prototype-v6',
  measurementModelVersion: 'pitch-shape-v1',
} as const);
