import type { WorldRecord } from './types.ts';

export type WorldSlotKind = 'auto' | 'previousAuto' | 'manual';
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

export interface StoredPlay {
  localWorldId: string;
  label: string;
  gameDate: string | null;
  slots: WorldSlotKind[];
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
    kind: 'auto' | 'manual' | 'action',
    expectedStorageRevision: number,
  ): Promise<WorldSlots>;
  load(kind: WorldSlotKind): Promise<{ world: WorldRecord; slots: WorldSlots }>;
}

export const emptyWorldSlots = (): WorldSlots => ({
  storageRevision: 0,
  auto: null,
  previousAuto: null,
  manual: null,
});
