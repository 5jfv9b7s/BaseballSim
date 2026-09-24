import { PITCH_MODEL_V3 } from './model-v3.ts';

/** 未校正。3ボール時は制球誤差を維持したまま狙いを中央へ寄せる。 */
export const PITCH_MODEL_V4 = Object.freeze({
  ...PITCH_MODEL_V3,
  version: 'pitch-prototype-v4',
  schemaId: 'pitch-prototype-config-v4',
  rulesetVersion: 'game-rules-prototype-v6',
  threeBallAimXMm: [-100, 0, 100] as const,
  threeBallAimZMm: [650, 800, 950] as const,
} as const);
