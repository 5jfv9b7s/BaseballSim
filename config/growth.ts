import type { GrowthConfig } from '../src/world/growth-types.ts';

/** 通常練習の未校正モデル。変更は新規プレイへ反映し、開始時の全値を保存する。 */
export const GROWTH_CONFIG: GrowthConfig = {
  version: 'daily-training-v1',
  enabled: true,

  // 1人・1日につき一度の機会抽選。1000 = 1%。向上心0にも20%の基礎機会。
  opportunity: { baseMilli: 20000, ambitionMilli: 60000 },

  // 成立時の総成長量。1000 = 能力1点。才能0でも1.2点、120で3.6点。
  // 対象群へ総量を分割し、15%は指定外の1項目への基礎練習へ回す。
  budget: { baseMilli: 1200, talentMilli: 2400, backgroundPermille: 150 },

  // Permilleは1000で1倍。体力/疲労の1000は表示1ポイント。
  intensities: {
    light: {
      opportunityPermille: 600,
      amountPermille: 500,
      energyCostMilli: 1500,
      fatigueCostMilli: 500,
    },
    normal: {
      opportunityPermille: 1000,
      amountPermille: 1000,
      energyCostMilli: 4000,
      fatigueCostMilli: 2000,
    },
    hard: {
      opportunityPermille: 1200,
      amountPermille: 1500,
      energyCostMilli: 7000,
      fatigueCostMilli: 4500,
    },
    rest: { opportunityPermille: 0, amountPermille: 0, energyCostMilli: 0, fatigueCostMilli: 0 },
  },

  // 全試合後・練習前の体力/疲労と当日の実負荷で判定。強度は下げるだけ。
  fatigueAdjustment: {
    lightEnergyAtOrBelowMilli: 60000,
    restEnergyAtOrBelowMilli: 30000,
    lightFatigueAtOrAboveMilli: 45000,
    restFatigueAtOrAboveMilli: 75000,
    lightWorkloadAtOrAbove: 120000,
    restWorkloadAtOrAbove: 350000,
  },
};
