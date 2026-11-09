import type { ReportWorkProgress } from './work-progress.ts';
import type { WorldRecord } from './types.ts';

export type WorldSlotKind = 'auto' | 'previousAuto' | 'manual';
/** progressは期間進行の終了・一時停止時。試合途中も既存の自動枠へ保存する。 */
export type WorldSaveKind = 'auto' | 'manual' | 'action' | 'progress';
export interface WorldSlot {
  snapshotId: string;
  gameDate: string;
  updatedAt: string;
}
export interface WorldSlots {
  storageRevision: number;
  auto: WorldSlot | null;
  previousAuto: WorldSlot | null;
  manual: WorldSlot | null;
}

/** 一覧表示用の読取結果。保存形式やゲーム状態には追加しない。 */
export interface StoredSavePoint extends WorldSlot {
  createdAt: string | null;
  saveFormatVersion: string | null;
  simulationVersion: string | null;
}

export interface StoredPlay {
  localWorldId: string;
  label: string;
  gameDate: string | null;
  slots: WorldSlotKind[];
  slotDetails: Partial<Record<WorldSlotKind, StoredSavePoint>>;
}

export interface WorldStorageAdapter {
  exportSnapshot?(kind: WorldSlotKind): Promise<Uint8Array>;
  importSnapshot?(bytes: Uint8Array, requestId: string): Promise<string>;
  listPlays?(): Promise<StoredPlay[]>;
  listSlots(): Promise<WorldSlots>;
  inspectStorage?(): Promise<import('./storage-inspection.ts').StorageInspection>;
  save(
    world: WorldRecord,
    stateRevision: number,
    kind: WorldSaveKind,
    expectedStorageRevision: number,
  ): Promise<WorldSlots>;
  load(
    kind: WorldSlotKind,
    report?: ReportWorkProgress,
  ): Promise<{ world: WorldRecord; slots: WorldSlots }>;
}

export const emptyWorldSlots = (): WorldSlots => ({
  storageRevision: 0,
  auto: null,
  previousAuto: null,
  manual: null,
});
