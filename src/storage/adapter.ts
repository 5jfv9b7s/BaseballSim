import type { GameRecord } from '../game/types.ts';

export interface SaveSlotInfo {
  snapshotId: string | null;
  previousSnapshotId: string | null;
  storageRevision: number;
  updatedAt: string | null;
}
export interface LoadedGame {
  record: GameRecord;
  storageRevision: number;
  snapshotId: string;
}
/** v0.1終了試合専用のStorageAdapter境界。全世界保存・移行・同期は未対応。 */
export interface StorageAdapter {
  listSlots(): Promise<SaveSlotInfo>;
  commitSnapshot(record: GameRecord, expectedStorageRevision: number): Promise<SaveSlotInfo>;
  loadSnapshot(previous?: boolean): Promise<LoadedGame>;
}
