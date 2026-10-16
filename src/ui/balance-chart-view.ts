import type { BalanceSeries } from '../world/win-balance.ts';

// 表示用の期間と座標。試合計算・集計・保存形式には関与しない。
export const BALANCE_WINDOW_DAYS = 30;
const LEFT = 90;
const RIGHT = 690;

/** 全試合の終了を確認した日別累計から、最新の30暦日だけを表示する。 */
export function recentBalanceWindow(series: readonly BalanceSeries[]) {
  // winBalanceSeriesは休養日も含む連続した日付を全チームへ同時に出力する。
  // 期間外の勝敗を引き直さず、当季累計の値をそのまま切り出す。
  const rows = series.map((row) => ({
    ...row,
    points: row.points.slice(-BALANCE_WINDOW_DAYS),
  }));
  const dates = rows[0]?.points.map((point) => point.date) ?? [];
  const last = dates.length - 1;
  const x = (index: number) => (last <= 0 ? RIGHT : LEFT + (index / last) * (RIGHT - LEFT));
  const positions = dates.map((date, index) => {
    // 隣り合う日の中間を操作領域の境界にし、端の点も図の内側で選択できる。
    const left = index === 0 ? LEFT : (x(index - 1) + x(index)) / 2;
    const right = index === last ? RIGHT : (x(index) + x(index + 1)) / 2;
    return { date, x: x(index), hitLeft: left, hitWidth: right - left };
  });
  const tickIndices = new Set([0, Math.floor(last / 2), last]);
  const ticks = positions.filter((_, index) => tickIndices.has(index));
  return { rows, positions, ticks };
}
