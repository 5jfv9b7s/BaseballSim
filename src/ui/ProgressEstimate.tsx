import { estimateProgress } from '../world/period-progress.ts';
import type { WorldView } from '../world/controller.ts';

export function ProgressEstimate({ view, date }: { view: WorldView; date: string }) {
  const estimate = estimateProgress(view.currentDate, view.definitions.endDate, date, view.games);
  if (!estimate) return null;

  return (
    <span className="progress-estimate">
      {estimate.days}日分・残り{estimate.games}試合（一軍・二軍）。途中で一時停止できます。
    </span>
  );
}
