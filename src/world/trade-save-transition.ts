import { ensure } from '../engine/validation.ts';
import { canonicalJson } from '../storage/codec.ts';
import { commitAcceptedTrade } from '../recruitment/trade-commit.ts';
import { createTradeApplicationPort } from './trade-application-port.ts';
import { receiptCommand, type TradeSavedState } from './trade-save-validation.ts';
import { applyTradeRosterCommand, parseTradeRosterCommand } from './trade-roster-commands.ts';
import { applyTradeDayCommand, parseTradeDayCommand } from './trade-day-commands.ts';
import {
  applyTradeGameCommand,
  MAX_GAME_COMMANDS_PER_SAVE,
  parseTradeGameCommand,
} from './trade-game-commands.ts';

/**
 * 既存候補から、この保存対象の指示だけを純粋に再計算する。
 * 下のportは検証結果を受けるだけで、DB・実Worker・実RNGは変更しない。
 */
export async function validateTradeSaveTransition(
  previous: TradeSavedState,
  candidate: TradeSavedState,
): Promise<'trade' | 'gameManual' | 'dayAuto' | 'rosterAuto'> {
  const dayDelta = (candidate.dayReceipts?.length ?? 0) - (previous.dayReceipts?.length ?? 0);
  ensure(dayDelta >= 0 && dayDelta <= 1, '一回の保存で確定する日次指示が不正です');
  const gameDelta = (candidate.gameReceipts?.length ?? 0) - (previous.gameReceipts?.length ?? 0);
  const rosterDelta =
    (candidate.rosterReceipts?.length ?? 0) - (previous.rosterReceipts?.length ?? 0);
  ensure(rosterDelta >= 0 && rosterDelta <= 1, '一回の保存の編成指示数が不正です');
  if (rosterDelta === 1) {
    ensure(dayDelta === 0 && gameDelta === 0, '編成指示は未保存の試合・日次指示と混在できません');
    const receipt = candidate.rosterReceipts!.at(-1)!;
    const result = applyTradeRosterCommand(
      previous,
      parseTradeRosterCommand(JSON.parse(receipt.fingerprint)),
    );
    ensure(result.status === 'applied', '編成指示を現在の保存から再計算できません');
    const replay = { ...result.snapshot, storageRevision: previous.storageRevision + 1 };
    ensure(
      canonicalJson(replay) === canonicalJson(candidate),
      '編成保存が指示の再計算と一致しません',
    );
    return 'rosterAuto';
  }
  if (gameDelta > 0 || dayDelta === 1) {
    ensure(
      gameDelta >= 0 && gameDelta <= MAX_GAME_COMMANDS_PER_SAVE,
      '一回の保存の試合指示数を超えました',
    );
    let replay = structuredClone(previous);
    for (const receipt of (candidate.gameReceipts ?? []).slice(
      previous.gameReceipts?.length ?? 0,
    )) {
      const result = applyTradeGameCommand(
        replay,
        parseTradeGameCommand(JSON.parse(receipt.fingerprint)),
      );
      ensure(result.status === 'applied', '試合指示が保存済み履歴と重複しています');
      replay = result.snapshot;
    }
    if (dayDelta === 1) {
      const receipt = candidate.dayReceipts!.at(-1)!;
      const result = applyTradeDayCommand(
        replay,
        parseTradeDayCommand(JSON.parse(receipt.fingerprint)),
      );
      ensure(result.status === 'applied', '日次指示が保存済み履歴と重複しています');
      replay = result.snapshot;
    }
    replay.storageRevision = previous.storageRevision + 1;
    ensure(
      canonicalJson(replay) === canonicalJson(candidate),
      '試合・日次の保存が指示の再計算と一致しません',
    );
    return dayDelta === 1 ? 'dayAuto' : 'gameManual';
  }
  ensure(
    candidate.tradeReceipts.length === previous.tradeReceipts.length + 1,
    '候補保存には一つの新しい確定記録が必要です',
  );
  const receipt = candidate.tradeReceipts.at(-1)!;
  const command = receiptCommand(receipt.fingerprint);
  const result = await commitAcceptedTrade(
    command,
    createTradeApplicationPort({
      async read() {
        return structuredClone(previous);
      },
      async commit() {
        /* 再計算結果の検査だけ。ここで保存しない。 */
      },
    }),
  );
  ensure(
    result.status === 'committed' && canonicalJson(result.snapshot) === canonicalJson(candidate),
    '候補保存の内容が承認済み指示の再計算と一致しません',
  );
  return 'trade';
}
