import { ensure } from '../engine/validation.ts';
import { canonicalJson } from '../storage/codec.ts';
import { commitAcceptedTrade } from '../recruitment/trade-commit.ts';
import { createTradeApplicationPort } from './trade-application-port.ts';
import { receiptCommand, type TradeSavedState } from './trade-save-validation.ts';
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
): Promise<'trade' | 'gameManual'> {
  const gameDelta = (candidate.gameReceipts?.length ?? 0) - (previous.gameReceipts?.length ?? 0);
  if (gameDelta > 0) {
    ensure(gameDelta <= MAX_GAME_COMMANDS_PER_SAVE, '一回の手動保存の試合指示数を超えました');
    let replay = structuredClone(previous);
    for (const receipt of candidate.gameReceipts!.slice(previous.gameReceipts?.length ?? 0)) {
      const result = applyTradeGameCommand(
        replay,
        parseTradeGameCommand(JSON.parse(receipt.fingerprint)),
      );
      ensure(result.status === 'applied', '試合指示が保存済み履歴と重複しています');
      replay = result.snapshot;
    }
    replay.storageRevision = previous.storageRevision + 1;
    ensure(
      canonicalJson(replay) === canonicalJson(candidate),
      '試合の手動保存が指示の再計算と一致しません',
    );
    return 'gameManual';
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
