import type { ExperienceConfig } from '../src/world/growth-types.ts';

/**
 * 実戦経験v1の試作係数。最終仕様・実データによる校正値ではない。
 * 通常練習とは別の機会抽選を行い、出場量は日別・分野別に逓減する。
 * 量はratingMilli（1000 = 能力表示1）。式・範囲はconfig/README.md参照。
 */
export const EXPERIENCE_CONFIG: ExperienceConfig = {
  version: 'game-experience-v1',
  enabled: true,
  opportunity: {
    baseMilli: 25000,
    ambitionMilli: 50000,
  },
  // 保存された試合開始時の相手能力を中心60000、最大±10%で補正する。
  opponent: {
    centerMilli: 60000,
    spanPermille: 100,
  },
  domains: {
    batting: {
      // 1単位 = 完了打席。相手の投球腕に応じた対右/対左能力へ配分。
      saturationUnits: 6,
      basePerUnitMilli: 120,
      talentPerUnitMilli: 120,
    },
    pitching: {
      // 1単位 = 実投球。実際に使用した持ち球の制球・再現性へ配分。
      saturationUnits: 60,
      basePerUnitMilli: 6,
      talentPerUnitMilli: 6,
    },
    fielding: {
      // 1単位 = 投球時の守備参加。実配置の守備習熟へ配分（投手を含む）。
      saturationUnits: 90,
      basePerUnitMilli: 2,
      talentPerUnitMilli: 2,
    },
  },
};
