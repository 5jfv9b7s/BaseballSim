import type { ConditionConfig } from '../src/world/condition-types.ts';

/** 未校正の滑らかな波。試合の能力倍率やリーグ成績の補正ではない。 */
export const conditionConfig: ConditionConfig = {
  version: 'condition-smooth-v1',
  neutralMilli: 50000,

  // 次の終点：現在値を中立へ10%戻し、±35ポイントの乱数を加える。
  targetSpreadMilli: 35000,
  reversionPermille: 100,

  // 1区間を14〜42暦日で補間。試合のない日にも進む。
  minSegmentDays: 14,
  maxSegmentDays: 42,

  // データ設計5.8.2の表示境界案。20/40/60/80ポイント。
  stageBoundariesMilli: [20000, 40000, 60000, 80000],
};
