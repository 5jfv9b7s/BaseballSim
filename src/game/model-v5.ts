import { GAME_MODEL_V4 } from './model-v4.ts';

/** 未校正。2ストライク時の接触優先と打球速度のトレードオフ。 */
export const GAME_MODEL_V5 = Object.freeze({
  ...GAME_MODEL_V4,
  version: 'game-prototype-v5',
  rulesetVersion: 'game-rules-prototype-v5',
  battedBallVersion: 'batted-ball-prototype-v3',
  protectExitSpeedPenaltyCentiKph: 1200,
  protectContactRecoveryCentiKph: 600,
} as const);
