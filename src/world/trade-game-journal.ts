import { ensure, integer } from '../engine/validation.ts';
import { uniqueFinanceIds } from '../finance/validation.ts';
import { canonicalJson } from '../storage/codec.ts';
import { exactKeys } from './snapshot-codec.ts';
import { parseTradeGameCommand } from './trade-game-commands.ts';
import type { TradeSavedState } from './trade-save-validation.ts';

/** 保存の指示履歴を検査。過去の全試合を再実行したという意味ではない。 */
export function validateTradeGameJournal(saved: TradeSavedState): void {
  if (!Object.hasOwn(saved, 'gameReceipts')) return;
  ensure(Array.isArray(saved.gameReceipts), '試合指示履歴が不正です');
  uniqueFinanceIds(
    [...saved.tradeReceipts.map((r) => r.commandId), ...saved.gameReceipts.map((r) => r.commandId)],
    '移籍・試合の指示ID',
  );
  const revisions = new Set(saved.tradeReceipts.map((r) => r.committedStateRevision));
  const ends = new Map<string, number>();
  let lastRevision = -1;
  for (const receipt of saved.gameReceipts) {
    exactKeys(
      receipt,
      [
        'modelVersion',
        'commandId',
        'fingerprint',
        'gameId',
        'kind',
        'committedStateRevision',
        'firstEventSeq',
        'nextEventSeq',
      ],
      '試合指示記録',
    );
    ensure(
      receipt.modelVersion === 'trade-game-commands-v1' &&
        typeof receipt.fingerprint === 'string' &&
        receipt.fingerprint.length <= 16384,
      '試合指示記録の版・容量が不正です',
    );
    const command = parseTradeGameCommand(JSON.parse(receipt.fingerprint));
    integer(receipt.committedStateRevision, 1, saved.stateRevision, '試合指示の確定版');
    integer(receipt.firstEventSeq, 1, Number.MAX_SAFE_INTEGER - 25, '試合の開始イベント番号');
    integer(
      receipt.nextEventSeq,
      receipt.firstEventSeq,
      Number.MAX_SAFE_INTEGER,
      '試合の次イベント番号',
    );
    ensure(
      canonicalJson(command) === receipt.fingerprint &&
        command.commandId === receipt.commandId &&
        command.gameId === receipt.gameId &&
        command.kind === receipt.kind &&
        command.localWorldId === saved.localWorldId &&
        command.worldId === saved.worldId &&
        command.expectedStateRevision + 1 === receipt.committedStateRevision &&
        receipt.committedStateRevision > lastRevision &&
        !revisions.has(receipt.committedStateRevision),
      '試合指示記録の参照・状態版が不一致です',
    );
    revisions.add(receipt.committedStateRevision);
    lastRevision = receipt.committedStateRevision;
    const previous = ends.get(receipt.gameId);
    if (command.kind === 'beginTradeGame') {
      ensure(
        previous === undefined && receipt.firstEventSeq === 1 && receipt.nextEventSeq === 1,
        '試合開始指示が重複・不正です',
      );
    } else {
      ensure(
        receipt.firstEventSeq === command.expectedNextEventSeq &&
          (previous === undefined || previous === receipt.firstEventSeq) &&
          receipt.nextEventSeq > receipt.firstEventSeq &&
          receipt.nextEventSeq <= receipt.firstEventSeq + command.eventCount,
        '試合指示のイベント区間が不正です',
      );
    }
    ensure(saved.state.games[receipt.gameId], '試合指示の原記録がありません');
    ends.set(receipt.gameId, receipt.nextEventSeq);
  }
  for (const [id, end] of ends) {
    const world = saved.state,
      game = world.games[id]!;
    ensure(
      game.state.nextEventSeq === end &&
        game.events.length === end - 1 &&
        game.state.simulationVersion === 'game-prototype-v11' &&
        (world.physical.appliedEvents[id] ?? 0) === game.events.length &&
        (world.restControl.appliedEvents[id] ?? 0) === game.events.length &&
        world.registration.gameRosters[id] &&
        world.condition.samples[id],
      '試合原記録・負荷済み情報・開始時記録が不一致です',
    );
    for (let i = 0; i < game.events.length; i++)
      ensure(
        game.events[i]!.gameId === id && game.events[i]!.eventSeq === i + 1,
        '試合イベントのID・順序が不正です',
      );
    ensure(
      game.performance?.gameId === id && game.state.rng.streamId === id + ':attempt:1',
      '試合入力・RNGの参照が不一致です',
    );
    if (game.state.phase === 'gameComplete')
      ensure(
        game.result && world.contributions[id] && world.statApplicationMarkers[id],
        '完了試合の結果・集計がありません',
      );
    else
      ensure(
        !game.result && !world.contributions[id] && !world.statApplicationMarkers[id],
        '未完了試合を集計済みにはできません',
      );
  }
}
