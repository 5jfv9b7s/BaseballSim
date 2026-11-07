import type { WorldSlotKind } from './storage.ts';
import type { TradeSavedState } from './trade-save-validation.ts';
import type { TradeSourceWorld } from './trade-application-types.ts';

export const TRADE_INITIAL_INPUT_FORMAT = 'trade-initial-input-v1' as const;
export const MAX_TRADE_INITIAL_INPUT_BYTES = 2 * 1024 * 1024;
/** 初期入力ファイルだけの通信枠。通常の指示上限とは分ける。 */
export const MAX_TRADE_CREATION_REQUEST_CHARS = 4 * 1024 * 1024 + 32768;
export interface TradeCreationSourceRef {
  localWorldId: string;
  slotKind: WorldSlotKind;
  snapshotId: string;
  storageRevision: number;
}
export interface TradeCreationSource extends TradeCreationSourceRef {
  label: string;
  gameDate: string;
  supported: boolean;
}
export interface TradeCreationSummary {
  date: string;
  seasonId: string;
  controlledClub: string;
  playerCount: number;
  clubCount: number;
  contractCount: number;
  budgets: { clubId: string; name: string; cashYen: number; availableYen: number }[];
}
export interface TradeCreationStatus {
  creationId: string;
  localWorldId: string;
  source: TradeCreationSourceRef;
  state: 'ready' | 'uncertain' | 'created';
  summary: TradeCreationSummary;
}
export interface TradeCreationInspection {
  creationId: string;
  status: 'ready' | 'blocked';
  issues: { path: string; message: string }[];
  issueCount: number;
}
export interface TradeCreationOptions {
  source: TradeCreationSourceRef;
  fingerprint: string;
  displayName: string;
}
export interface TradeCreationAccess {
  listSources(): Promise<TradeCreationSource[]>;
  loadSource(ref: TradeCreationSourceRef): Promise<TradeSourceWorld>;
  create(saved: TradeSavedState, options: TradeCreationOptions): Promise<'created' | 'replayed'>;
}
