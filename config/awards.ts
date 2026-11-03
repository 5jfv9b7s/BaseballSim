import type { AwardsRules } from '../src/world/awards-types.ts';

/** 未校正の試作。実際の投票/選考方式ではない。参考表示専用。保存には入らず、現在の設定で再集計する。 */
export const AWARDS_RULES: AwardsRules = {
  version: 'season-awards-v1',
  // B9野手：当該位置での実打席 >= 球団実施試合数×1。
  battingRolePaPerTeamGame: 1,
  // B9投手：投球アウト >= 球団実施試合数×3（1回/試合）。
  pitchingOutsPerTeamGame: 3,
  // GG：当該位置の守備アウト >= 球団実施試合数×3。
  fieldingOutsPerTeamGame: 3,
  // すべての選考指標が同じなら全員併記。IDは表示順だけに使用する。
  ties: 'allCoWinners',
  battingOrder: ['ops', 'plateAppearances'],
  pitchingOrder: ['era', 'outsRecorded'],
  fieldingOrder: ['fieldingPercentage', 'chances'],
};
