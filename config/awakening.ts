import type { RookieAwakeningConfig } from '../src/world/awakening-types.ts';

/** 未校正の試作。確率は100万分率、成長量はRatingMilli（1000で能力1）。 */
export const ROOKIE_AWAKENING_CONFIG: RookieAwakeningConfig = {
  version: 'rookie-awakening-v1',
  enabled: true,
  // 対象選手1人・日次確定1回につき0.05〜0.1%。発生は保証しない。
  opportunity: { basePpm: 500, ambitionPpm: 500 },
  amount: {
    baseMilli: 3000,
    talentMilli: 3000,
  },
};
