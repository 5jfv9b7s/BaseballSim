import { ensure, integer } from '../engine/validation.ts';
import { dateDays, financeId } from '../finance/validation.ts';
import { canonicalJson } from '../storage/canonical.ts';
import { exactKeys } from './snapshot-codec.ts';
import { completeTradeWorldDay, completeTradeWorldDayWithRoster } from './trade-day.ts';
import type { TradeRosterReconciliation } from './trade-roster-policy.ts';
import type { TradeSavedState } from './trade-save-validation.ts';

export interface TradeDayCommand {
  kind: 'completeTradeDay' | 'completeTradeDayWithRoster';
  commandId: string;
  localWorldId: string;
  worldId: string;
  expectedStateRevision: number;
  expectedDate: string;
}

interface DayReceiptContext {
  commandId: string;
  fingerprint: string;
  completedDate: string;
  nextDate: string;
  committedStateRevision: number;
}

export type TradeDayReceipt = DayReceiptContext &
  (
    | { modelVersion: 'trade-day-commands-v1' }
    | { modelVersion: 'trade-day-commands-v2'; rosterResults: TradeRosterReconciliation[] }
  );

export function parseTradeDayCommand(value: unknown): TradeDayCommand {
  ensure(value && typeof value === 'object', '日次指示が不正です');
  const command = value as TradeDayCommand;
  exactKeys(
    command,
    ['kind', 'commandId', 'localWorldId', 'worldId', 'expectedStateRevision', 'expectedDate'],
    '日次指示',
  );
  ensure(
    ['completeTradeDay', 'completeTradeDayWithRoster'].includes(command.kind),
    '未対応の日次指示です',
  );
  for (const id of [command.commandId, command.localWorldId, command.worldId]) financeId(id);
  integer(command.expectedStateRevision, 0, Number.MAX_SAFE_INTEGER - 1, '日次指示の状態版');
  dateDays(command.expectedDate);
  ensure(canonicalJson(command).length <= 16384, '日次指示の容量を超えています');
  return command;
}

/** 分離された翌日候補を返す。所有者は日次保存成功後だけ公開する。 */
export function applyTradeDayCommand(saved: TradeSavedState, value: TradeDayCommand) {
  const command = parseTradeDayCommand(structuredClone(value));
  ensure(
    command.localWorldId === saved.localWorldId && command.worldId === saved.worldId,
    '別プレイ・別世界への日次指示です',
  );
  ensure(
    !saved.tradeReceipts.some((r) => r.commandId === command.commandId) &&
      !saved.gameReceipts?.some((r) => r.commandId === command.commandId) &&
      !saved.rosterReceipts?.some((r) => r.commandId === command.commandId),
    '別の種類の指示IDは再使用できません',
  );
  const fingerprint = canonicalJson(command),
    prior = saved.dayReceipts?.find((r) => r.commandId === command.commandId);
  if (prior) {
    ensure(prior.fingerprint === fingerprint, '同じ日次指示IDの内容が異なります');
    return { status: 'replayed' as const, receipt: structuredClone(prior) };
  }
  ensure(command.expectedStateRevision === saved.stateRevision, '古い状態への日次指示です');
  integer(saved.stateRevision, 0, Number.MAX_SAFE_INTEGER - 1, '日次状態版');
  const result =
    command.kind === 'completeTradeDayWithRoster'
      ? completeTradeWorldDayWithRoster(saved.state, command.expectedDate)
      : { world: completeTradeWorldDay(saved.state, command.expectedDate), reports: null };
  const state = result.world;
  const receipt: TradeDayReceipt = {
    ...(result.reports === null
      ? { modelVersion: 'trade-day-commands-v1' as const }
      : { modelVersion: 'trade-day-commands-v2' as const, rosterResults: result.reports }),
    commandId: command.commandId,
    fingerprint,
    completedDate: command.expectedDate,
    nextDate: state.currentDate,
    committedStateRevision: saved.stateRevision + 1,
  };
  const snapshot: TradeSavedState = {
    ...saved,
    state,
    currentDate: state.currentDate,
    stateRevision: saved.stateRevision + 1,
    gameReceipts: saved.gameReceipts ?? [],
    dayReceipts: [...(saved.dayReceipts ?? []), receipt],
    ...(result.reports !== null ? { rosterReceipts: saved.rosterReceipts ?? [] } : {}),
  };
  return { status: 'applied' as const, receipt: structuredClone(receipt), snapshot };
}
