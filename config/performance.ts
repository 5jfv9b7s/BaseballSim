import type { PerformanceConfig } from '../src/game/performance-types.ts';

/** 未校正の試合前補正。身体消耗や基本能力の成長の係数とは別です。 */
export const performanceConfig: PerformanceConfig = {
  version: 'pregame-performance-v1',
  // 1000が等倍。合成倍率を0.5〜1.2倍へ制限します。
  minFactorPermille: 500,
  maxFactorPermille: 1200,
  groups: {
    // 調子0/100で±10%、体力0で-15%、疲労100で-15%という試作仮定。
    contact: {
      conditionSwingPermille: 100,
      energyPenaltyPermille: 150,
      fatiguePenaltyPermille: 150,
    },
    power: {
      conditionSwingPermille: 100,
      energyPenaltyPermille: 150,
      fatiguePenaltyPermille: 150,
    },
    discipline: {
      conditionSwingPermille: 100,
      energyPenaltyPermille: 150,
      fatiguePenaltyPermille: 150,
    },
    running: {
      conditionSwingPermille: 100,
      energyPenaltyPermille: 150,
      fatiguePenaltyPermille: 150,
    },
    fielding: {
      conditionSwingPermille: 100,
      energyPenaltyPermille: 150,
      fatiguePenaltyPermille: 150,
    },
    throwing: {
      conditionSwingPermille: 100,
      energyPenaltyPermille: 150,
      fatiguePenaltyPermille: 150,
    },
    control: {
      conditionSwingPermille: 100,
      energyPenaltyPermille: 150,
      fatiguePenaltyPermille: 150,
    },
    repeatability: {
      conditionSwingPermille: 100,
      energyPenaltyPermille: 150,
      fatiguePenaltyPermille: 150,
    },
  },
};
