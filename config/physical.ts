import type { PhysicalConfig } from '../src/world/physical-types.ts';

/** 未校正の試作値。式や実績の数え方を変更するときはモデル版も更新する。 */
export const physicalConfig: PhysicalConfig = {
  version: 'physical-load-v1',

  workloadUnits: {
    pitching: 1000,
    batting: 120,
    fielding: 30,
    running: 250,
    preparation: 8000,
  },

  energyCostMilli: 500,
  fatigueCostMilli: 200,

  dailyRecovery: {
    energyBaseMilli: 18000,
    energyAbilityMilli: 24000,
    fatigueBaseMilli: 3000,
    fatigueAbilityMilli: 6000,
    restEnergyBonusMilli: 10000,
    restFatigueBonusMilli: 4000,
  },

  restAdvice: {
    energyAtOrBelowMilli: 35000,
    fatigueAtOrAboveMilli: 40000,
  },
};
