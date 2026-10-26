import type { CampConfig } from '../src/world/camp-types.ts';

/** 未校正の試作。補正は指定対象だけ、爆発率は1人・1キャンプの100万分率。 */
export const CAMP_CONFIG: CampConfig = {
  version: 'camp-training-v1',
  enabled: true,
  focusAmountPermille: 1500,
  burst: {
    basePpm: 10000,
    ambitionPpm: 10000,
    baseMilli: 6000,
    talentMilli: 6000,
  },
};
