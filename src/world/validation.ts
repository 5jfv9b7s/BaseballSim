import { applyManagement } from './management.ts';
import { ensure, integer } from '../engine/validation.ts';
import { canonicalJson } from '../storage/codec.ts';
import {
  advanceWorld,
  completeDay,
  createWorld,
  createManagedWorld,
  createAnnualWorld,
  createRosterWorld,
  createScheduledGame,
  acceptGame,
} from './engine.ts';
import type { GameRecord } from '../game/types.ts';
import type { WorldRecord } from './types.ts';

/**
 * 保存内の開始時定義から全イベントを再実行する。
 * 現在の編集データを補わず、成績・日付・cursor・完全な乱数状態まで照合する。
 */
export function validateWorld(value: unknown): asserts value is WorldRecord {
  validateWithCache(value);
}

/** 保存インスタンス内だけの検証キャッシュ。読込は新しいオブジェクトを必ず再検証する。 */
export class WorldValidator {
  private verified = new WeakMap<GameRecord, string>();

  validate(value: unknown): asserts value is WorldRecord {
    validateWithCache(value, this.verified);
  }
}

function freezeRecord(value: unknown): void {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeRecord(child);
    Object.freeze(value);
  }
}

function validateWithCache(
  value: unknown,
  verified?: WeakMap<GameRecord, string>,
): asserts value is WorldRecord {
  ensure(value !== null && typeof value === 'object', '世界データが不正です');
  const candidate = value as WorldRecord;
  ensure(
    [
      'world-prototype-v1',
      'world-prototype-v2',
      'world-prototype-v3',
      'world-prototype-v4',
    ].includes(candidate.version),
    '未対応の世界モデルです',
  );
  ensure(Array.isArray(candidate.completedDates), '日次完了記録が不正です');
  integer(candidate.completedDates.length, 0, 'seasonSummary' in candidate ? 366 : 31, '完了日数');
  ensure(
    candidate.games !== null &&
      typeof candidate.games === 'object' &&
      !Array.isArray(candidate.games),
    '試合記録が不正です',
  );
  const actions = candidate.version !== 'world-prototype-v1' ? candidate.management.actions : [];
  ensure(Array.isArray(actions), '編成履歴が不正です');
  integer(actions.length, 0, 'seasonSummary' in candidate ? 2048 : 256, '編成履歴の件数');
  ensure(
    candidate.definitions.version ===
      (candidate.version === 'world-prototype-v4'
        ? 'world-definitions-v3'
        : candidate.version === 'world-prototype-v3'
          ? 'world-definitions-v2'
          : 'world-definitions-v1'),
    '世界モデルと日程定義の版が異なります',
  );
  let actionIndex = 0;
  let replay: WorldRecord =
    candidate.version === 'world-prototype-v4'
      ? createRosterWorld(
          candidate.seed,
          candidate.management.controlledSquadId,
          candidate.definitions,
        )
      : candidate.version === 'world-prototype-v3'
        ? createAnnualWorld(
            candidate.seed,
            candidate.management.controlledSquadId,
            candidate.definitions,
          )
        : candidate.version === 'world-prototype-v2'
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
      // 完全再実行で照合した終了試合だけを再利用する。
      // 記録を深く凍結し、開始時編成・seed・設定も比較するので、後から改変できない。
      const start =
        verified && saved.result ? canonicalJson(createScheduledGame(replay, gameId)) : null;
      if (start !== null && verified?.get(saved) === start) {
        replay = acceptGame(replay, gameId, saved);
        continue;
      }
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
      // 照合後の再生成イベント列を全試合分保持せず、保存側と共有する。
      replay.games[gameId] = saved;
      if (start !== null && saved.result) {
        freezeRecord(saved);
        verified!.set(saved, start);
      }
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
  const { games: replayGames, ...replayCore } = replay;
  const { games: candidateGames, ...candidateCore } = candidate;
  ensure(
    canonicalJson(Object.keys(replayGames).sort()) ===
      canonicalJson(Object.keys(candidateGames).sort()),
    '日程外または未実施の試合記録があります',
  );
  ensure(
    canonicalJson(replayCore) === canonicalJson(candidateCore),
    '世界の成績・日付・進行状態が一致しません',
  );
}
