/** プロフィールv1の読込用の暫定上限。人体の限界や査定係数ではない。
 * 同じモデル版で制約を狭めない。変更時はデータ版・旧保存の扱いを検討する。
 */
export const playerProfileBoundsV1 = {
  minBirthYear: 1900,
  maxHeightMm: 3000,
  maxWeightGrams: 500000,
} as const;
