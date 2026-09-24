import { applyManagement } from './management.ts';
import { ensure, integer } from '../engine/validation.ts';
import { canonicalJson } from '../storage/codec.ts';
import { advanceWorld, completeDay, createWorld, createManagedWorld } from './engine.ts';
import type { WorldRecord } from './types.ts';

/**
 * 保存内の開始時定義から全イベントを再実行する。
 * 現在の編集データを補わず、成績・日付・cursor・完全な乱数状態まで照合する。
 */
export function validateWorld(value: unknown): asserts value is WorldRecord {
  ensure(value !== null && typeof value === 'object', '世界データが不正です');
  const candidate = value as WorldRecord;
  ensure(
    ['world-prototype-v1', 'world-prototype-v2'].includes(candidate.version),
    '未対応の世界モデルです',
  );
  ensure(Array.isArray(candidate.completedDates), '日次完了記録が不正です');
  integer(candidate.completedDates.length, 0, 31, '完了日数');
  ensure(candidate.games !== null && typeof candidate.games === 'object', '試合記録が不正です');
  const actions = candidate.version === 'world-prototype-v2' ? candidate.management.actions : [];
  ensure(Array.isArray(actions), '編成履歴が不正です');
  integer(actions.length, 0, 256, '編成履歴の件数');
  let actionIndex = 0;
  let replay: WorldRecord =
    candidate.version === 'world-prototype-v2'
      ? createManagedWorld(
          candidate.seed,
          candidate.definitions,
          candidate.management.controlledSquadId,
        )
      : createWorld(candidate.seed, candidate.definitions);

  const replayDate = (requireComplete: boolean) => {
    while (actions[actionIndex]?.date === replay.currentDate) {
      const entry = actions[actionIndex]!;
      ensure(entry.sequence === actionIndex + 1, '編成履歴の順番が不正です');
      replay = applyManagement(replay, entry.commandId, entry.action);
      actionIndex++;
    }
    for (const gameId of [...replay.dayPlan.gameIds]) {
      const saved = candidate.games[gameId];
      if (!saved) {
        ensure(!requireComplete, '終了日の試合記録がありません');
        break;
      }
      ensure(Array.isArray(saved.events), 'イベント列が不正です');
      integer(saved.events.length, 1, 11000, '試合イベント数');
      let remaining = saved.events.length;
      while (remaining > 0) {
        const count = Math.min(25, remaining);
        const before = replay.games[gameId]?.events.length ?? 0;
        replay = advanceWorld(replay, count);
        const consumed = replay.games[gameId]!.events.length - before;
        ensure(consumed > 0 && consumed <= remaining, 'イベント列の長さが不正です');
        remaining -= consumed;
      }
      ensure(
        canonicalJson(replay.games[gameId]) === canonicalJson(saved),
        '試合記録を再現できません',
      );
      if (!saved.result) {
        ensure(!requireComplete, '終了日に未完了試合があります');
        break;
      }
    }
  };

  for (const date of candidate.completedDates) {
    ensure(date === replay.currentDate, '日次完了の順序が不正です');
    replayDate(true);
    replay = completeDay(replay, date);
  }
  replayDate(false);
  ensure(actionIndex === actions.length, '日程と編成履歴が一致しません');
  ensure(
    canonicalJson(replay) === canonicalJson(candidate),
    '世界の成績・日付・進行状態が一致しません',
  );
}
