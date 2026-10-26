import type { AgeConfig } from '../src/world/age-types.ts';

/** 試作仮定。年間量はRatingMilli、年齢の境界は年×1000。校正は後工程。 */
export const AGE_CONFIG: AgeConfig = {
  version: 'age-development-v1',
  enabled: true,
  groups: {
    physical: {
      growthMilliPerYear: 1800, // 年齢成長の頂点での年間量。1000で能力1ポイント。
      declineMilliPerYear: 2400, // 衰退が最大速度になったときの年間量。
      declineRampAgeMilli: 5000, // 衰退開始から最大速度になるまで5年。
    },
    technique: {
      growthMilliPerYear: 1500, // 技術の年間成長量（RatingMilli）。
      declineMilliPerYear: 1200,
      declineRampAgeMilli: 6000,
    },
    judgment: {
      growthMilliPerYear: 1000, // 判断の年間成長量（RatingMilli）。
      declineMilliPerYear: 600,
      declineRampAgeMilli: 8000,
    },
  },
  // 才能0でも基礎量を残す。倍率1000で等倍。
  growthAmount: {
    basePermille: 500,
    talentPermille: 500,
  },
  abilityGroups: {
    'batting.contactVsRight': 'technique',
    'batting.contactVsLeft': 'technique',
    'batting.powerVsRight': 'physical',
    'batting.powerVsLeft': 'physical',
    'batting.plateDiscipline': 'judgment',
    'batting.bunting': 'technique',
    'running.speed': 'physical',
    'running.stealing': 'technique',
    'running.baserunning': 'judgment',
    'fielding.range': 'physical',
    'fielding.catching': 'technique',
    'fielding.armStrength': 'physical',
    'fielding.throwing': 'technique',
    'fielding.positioning': 'judgment',
    'catching.gameCalling': 'judgment',
    'catching.blocking': 'technique',
    'catching.framing': 'technique',
    'physical.stamina': 'physical',
    'physical.recovery': 'physical',
    'physical.injuryResistance': 'physical',
    'pitching.quickDelivery': 'technique',
    'pitching.pickoff': 'technique',
  },
  positionGroup: 'technique',
  pitchGroups: { control: 'technique', repeatability: 'technique' },
};
