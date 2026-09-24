import { GAME_MODEL_V8 } from './model-v8.ts';

/** v8の試合計算を保ち、位置別の守備記録・成績を追加する。 */
export const GAME_MODEL_V9 = Object.freeze({
  ...GAME_MODEL_V8,
  version: 'game-prototype-v9',
  rulesetVersion: 'game-rules-prototype-v9',
} as const);
