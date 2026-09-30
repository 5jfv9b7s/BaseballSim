import type { RegistrationRules } from '../src/world/registration-types.ts';

/** 要件FR-REG-02/12の採用値。開始時に保存へ複製し、後の編集は新規プレイへ適用する。 */
export const registrationRules: RegistrationRules = {
  version: 'registration-rules-v1',
  clubLimit: 70,
  firstLimit: 31,
  benchLimit: 26,
  foreignFirstLimit: 5,
  foreignBenchLimit: 4,
  // 抹消日＋10暦日を再登録可能日とする試作規約。特例による短縮は未対応。
  reentryDays: 10,
};
