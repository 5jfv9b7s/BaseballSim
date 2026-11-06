import type { WorldRecord, ClubManagement } from './types.ts';
import type { GrowthState } from './growth-types.ts';

type TrainingSource = Extract<WorldRecord, { growth: GrowthState }>;

/**
 * 日次の純粋計算が参照する項目。保存ルートや可変な旧世界のコピーではない。
 * 初期資料は全選手の定義として使い、所属別の計算は試合原記録から解決する。
 */
export type DailyContext<T extends TrainingSource = TrainingSource> = Pick<
  T,
  | 'definitions'
  | 'currentDate'
  | 'lastCompletedDate'
  | 'completedDates'
  | 'dayPlan'
  | 'games'
  | 'physical'
  | 'growth'
> & {
  version: T['version'] | 'trade-application-world-v1';
  management:
    | { version: 'club-management-v1' }
    | Pick<Extract<ClubManagement, { version: 'club-management-v2' }>, 'version' | 'training'>;
};
