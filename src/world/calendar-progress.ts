import type { WorldAction, WorldView } from './controller.ts';
import { nextProgressAction, type ProgressTarget } from './period-progress.ts';

type CalendarAction = Extract<
  WorldAction,
  { kind: 'advanceBatch' | 'completeDay' | 'saveProgress' }
>;

/** 日次更新は省略しない。終了・一時停止・エラーで止まる時だけ保存を要求する。 */
export function nextCalendarAction(
  current: Pick<WorldView, 'currentDate' | 'phase' | 'unsavedChanges'>,
  target: ProgressTarget,
  stopRequested = false,
): CalendarAction | null {
  const action = stopRequested ? null : nextProgressAction(current, target);
  if (!action) return current.unsavedChanges ? { kind: 'saveProgress' } : null;
  return action.kind === 'advance'
    ? { kind: 'advanceBatch', count: action.count, batches: 4 }
    : { ...action, save: 'defer' };
}
