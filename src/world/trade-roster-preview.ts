import { ensure } from '../engine/validation.ts';
import { applyTradeRosterCommand } from './trade-roster-commands.ts';
import type { TradeRosterCommand } from './trade-roster-commands.ts';
import type { TradeRegistrationAudit } from './trade-registration.ts';
import type { TradeRosterIssue } from '../recruitment/trade-roster-types.ts';
import type { TradeSessionRead } from './trade-play-view.ts';

export type TradeRegistrationCommand = Extract<
  TradeRosterCommand,
  { kind: 'setTradeRegistrations' }
>;
export type TradeRosterPreview = {
  commandId: string;
  stateRevision: number;
} & (
  | { status: 'ready'; audit: TradeRegistrationAudit }
  | { status: 'blocked'; issues: TradeRosterIssue[] }
);

/** 所有者の正本を純粋審査へ渡すだけ。候補世界・receipt・RNG・DBを更新しない。 */
export function previewTradeRoster(
  read: TradeSessionRead,
  command: TradeRegistrationCommand,
): TradeRosterPreview {
  ensure(
    !read.saving && !read.reloadRequired && read.pendingCommands === 0,
    '未保存・保存中・成否不明です。編成確認の前に保存または再読込してください',
  );
  const result = applyTradeRosterCommand(read.snapshot, command);
  ensure(
    result.status !== 'replayed',
    '既に処理済みの指示です。最新の画面から確認し直してください',
  );
  const source = { commandId: command.commandId, stateRevision: read.snapshot.stateRevision };
  return structuredClone(
    result.status === 'blocked'
      ? { ...source, status: 'blocked' as const, issues: result.issues }
      : { ...source, status: 'ready' as const, audit: result.receipt.audit },
  );
}
