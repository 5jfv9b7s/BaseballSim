import type { PitchLearningConfig } from '../src/world/pitch-learning-types.ts';

/** 未校正の試作値。新規プレイの開始時設定を保存し、既存保存へ後付けしない。 */
export const PITCH_LEARNING_CONFIG: PitchLearningConfig = {
  version: 'pitch-learning-v1',
  enabled: true,

  // 通常練習の指定対象分の予算を習得進度へ換算。1000 = 1倍。
  // 強度・才能・向上心・疲労調整・キャンプの指定補正は既存の練習処理を共用。
  progressPerBudgetPermille: 1000,
};
