import { GAME_MODEL_V7 } from './model-v7.ts';

/** 係数と到達時間の式はv7と共通。併殺崩れの走者・記録の処理を追加する。 */
export const GAME_MODEL_V8 = Object.freeze({
  ...GAME_MODEL_V7,
  version: 'game-prototype-v8',
  rulesetVersion: 'game-rules-prototype-v8',
} as const);
