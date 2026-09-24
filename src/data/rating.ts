import type { Ability } from '../engine/types.ts';

/**
 * 能力は0〜120000の整数（表示上の0〜120を1000倍）。
 * 上限の初期値110000も架空データ用の仮定。必要なら第2引数で個別指定します。
 */
export function rating(valueMilli: number, ceilingMilli = 110000): Ability {
  return { valueMilli, ceilingMilli };
}
