import type { BullpenConfig } from '../src/game/bullpen-types.ts';

/** 未校正の自動準備モデル。準備負荷はphysical.tsのpreparationを1開始につき加算する。 */
export const bullpenConfig: BullpenConfig = {
  version: 'auto-bullpen-v1',

  // 交代目安の何球前から準備を始めるか（整数0〜200球）。
  leadPitches: 20,

  // 自チームの守備中の実投球で数える準備時間（整数1〜100球）。
  requiredPitches: 8,
};
