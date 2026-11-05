import type { SalaryProrationPolicy } from '../src/finance/types.ts';

/**
 * 既存契約の給与負担期間は資料7.3の2月1日〜11月30日。
 * 終了日は含まないため12月1日とする。新規途中加入の契約には流用しない。
 * 累積日割りの端数配分は試作v1。経営E-01の初期資金・保証収入・補充余裕は未設定。
 * 現在の世界・保存には未接続。同じ版の式を変える場合は新しい版を追加する。
 */
export const SALARY_PRORATION_POLICY: SalaryProrationPolicy = {
  version: 'salary-day-proration-v1',
  coverageFromMonthDay: '02-01',
  coverageUntilMonthDay: '12-01',
};
