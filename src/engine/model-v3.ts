import { PITCH_MODEL_V2 } from './model-v2.ts';

/** 未校正。2ストライクではゾーン内を守り、ミート能力に応じて接触を優先する。 */
export const PITCH_MODEL_V3 = Object.freeze({
  ...PITCH_MODEL_V2,
  version: 'pitch-prototype-v3',
  schemaId: 'pitch-prototype-config-v3',
  rulesetVersion: 'game-rules-prototype-v4',
  protectInside: 0.28,
  protectOutside: 0,
  contactProtectBase: 0.08,
  contactProtectAbility: 0.08,
} as const);
