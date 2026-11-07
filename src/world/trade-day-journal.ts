import { ensure, integer } from '../engine/validation.ts';
import { uniqueFinanceIds } from '../finance/validation.ts';
import { canonicalJson } from '../storage/canonical.ts';
import { nextDate } from './engine.ts';
import { activityKey } from './physical.ts';
import { exactKeys } from './snapshot-codec.ts';
import { tradeRosterAutoSource } from './trade-registration.ts';
import { validateTradeRosterReport } from './trade-roster-journal.ts';
import { parseTradeDayCommand } from './trade-day-commands.ts';
import type { TradeSavedState } from './trade-save-validation.ts';

/** 日次発生元と成長/回復の保持を照合。全過去試合の再実行検査ではない。 */
export function validateTradeDayJournal(saved: TradeSavedState): void {
  if (!Object.hasOwn(saved, 'dayReceipts')) return;
  ensure(
    Array.isArray(saved.dayReceipts) && Array.isArray(saved.gameReceipts),
    '日次指示履歴が不正です',
  );
  uniqueFinanceIds(
    [
      ...saved.tradeReceipts.map((r) => r.commandId),
      ...saved.gameReceipts.map((r) => r.commandId),
      ...saved.dayReceipts.map((r) => r.commandId),
    ],
    '移籍・試合・日次の指示ID',
  );
  const revisions = new Set(
    [...saved.tradeReceipts, ...saved.gameReceipts].map((r) => r.committedStateRevision),
  );
  let previousDate: string | null = null,
    previousRevision = -1;
  const world = saved.state;
  for (const receipt of saved.dayReceipts) {
    exactKeys(
      receipt,
      [
        'modelVersion',
        'commandId',
        'fingerprint',
        'completedDate',
        'nextDate',
        'committedStateRevision',
        ...(receipt.modelVersion === 'trade-day-commands-v2' ? ['rosterResults'] : []),
      ],
      '日次指示記録',
    );
    ensure(
      ['trade-day-commands-v1', 'trade-day-commands-v2'].includes(receipt.modelVersion) &&
        typeof receipt.fingerprint === 'string' &&
        receipt.fingerprint.length <= 16384,
      '日次指示記録の版・容量が不正です',
    );
    const command = parseTradeDayCommand(JSON.parse(receipt.fingerprint));
    integer(receipt.committedStateRevision, 1, saved.stateRevision, '日次確定版');
    ensure(
      canonicalJson(command) === receipt.fingerprint &&
        command.commandId === receipt.commandId &&
        command.localWorldId === saved.localWorldId &&
        command.worldId === saved.worldId &&
        command.expectedDate === receipt.completedDate &&
        nextDate(receipt.completedDate) === receipt.nextDate &&
        receipt.nextDate <= saved.currentDate &&
        receipt.committedStateRevision === command.expectedStateRevision + 1 &&
        receipt.committedStateRevision > previousRevision &&
        !revisions.has(receipt.committedStateRevision) &&
        (previousDate === null || nextDate(previousDate) === receipt.completedDate),
      '日次指示の参照・版・日付が不一致です',
    );
    ensure(
      (command.kind === 'completeTradeDayWithRoster') ===
        (receipt.modelVersion === 'trade-day-commands-v2'),
      '日次指示と処理版が不一致です',
    );
    if (receipt.modelVersion === 'trade-day-commands-v2') {
      ensure(
        Array.isArray(saved.rosterReceipts) && Array.isArray(receipt.rosterResults),
        '固定希望つき日次は候補v4が必要です',
      );
      uniqueFinanceIds(
        receipt.rosterResults.map((r) => r.clubId),
        '日次固定希望の球団',
      );
      for (const report of receipt.rosterResults)
        validateTradeRosterReport(
          report,
          saved,
          { date: receipt.nextDate, order: 0 },
          tradeRosterAutoSource(receipt.nextDate, report.clubId),
        );
    }
    revisions.add(receipt.committedStateRevision);
    previousDate = receipt.completedDate;
    previousRevision = receipt.committedStateRevision;
    const day = world.growth.state.days[receipt.completedDate];
    ensure(
      world.completedDates.includes(receipt.completedDate) && day?.date === receipt.completedDate,
      '日次指示の成長・完了記録がありません',
    );
    for (const id of Object.keys(world.growth.state.players)) {
      const recovery = world.physical.recoveries[activityKey(id, receipt.completedDate)];
      ensure(
        recovery?.date === receipt.completedDate && recovery.playerId === id,
        '日次指示の回復記録がありません',
      );
    }
  }
  if (saved.dayReceipts.length) {
    ensure(
      world.growth.state.lastCompletedOn === world.lastCompletedDate &&
        world.lastCompletedDate === previousDate &&
        nextDate(previousDate!) === world.currentDate &&
        world.rosterAsOf.date === world.currentDate,
      '日次の最終基準日が不一致です',
    );
    for (const id of Object.keys(world.growth.state.players))
      ensure(
        world.physical.players[id]?.lastUpdatedOn === world.currentDate &&
          world.condition.players[id]?.lastUpdatedOn === world.currentDate,
        '翌日の身体・調子の基準日が不一致です',
      );
  }
}
