import { ensure } from '../engine/validation.ts';
import type { WorldPhase } from './types.ts';

/** 画面の進行目標。世界の状態や保存データには含めない。 */
export interface ProgressTarget {
  date: string;
  boundary: 'beforeGames' | 'afterDay';
}

function validDate(date: string): boolean {
  const time = Date.parse(date + 'T00:00:00Z');
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(time) &&
    new Date(time).toISOString().slice(0, 10) === date
  );
}

export function createProgressTarget(
  currentDate: string,
  endDate: string,
  date: string,
  boundary: ProgressTarget['boundary'],
): ProgressTarget {
  ensure(
    validDate(date) && validDate(currentDate) && validDate(endDate),
    '進行先に有効な日付を指定してください。',
  );
  ensure(boundary === 'beforeGames' || boundary === 'afterDay', '進行の停止位置が不正です。');
  ensure(
    date >= currentDate && date <= endDate,
    '進行先は現在日から日程最終日までを指定してください。',
  );
  ensure(
    boundary !== 'beforeGames' || date > currentDate,
    '試合前までの進行には、現在日より未来の日付を指定してください。',
  );
  return { date, boundary };
}

export function reachedProgressTarget(currentDate: string, target: ProgressTarget): boolean {
  return target.boundary === 'beforeGames' ? currentDate >= target.date : currentDate > target.date;
}

export function progressLabel(target: ProgressTarget): string {
  return target.date + (target.boundary === 'beforeGames' ? 'の試合前まで' : 'の終了まで');
}

/**
 * 到着日の最初のイベントを送る前に止める。
 * 日付や試合を直接更新せず、従来のWorker指示を一つずつ返す。
 * completeDayの応答は翌日への移行と自動保存の成功後に届く。
 */
export function nextProgressAction(
  current: { currentDate: string; phase: WorldPhase },
  target: ProgressTarget,
): { kind: 'advance'; count: 25 } | { kind: 'completeDay'; date: string } | null {
  if (reachedProgressTarget(current.currentDate, target)) return null;
  if (current.phase === 'playing') return { kind: 'advance', count: 25 };
  if (current.phase === 'readyToComplete')
    return { kind: 'completeDay', date: current.currentDate };
  return null;
}
