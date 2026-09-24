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

export interface WorldStorageAdapter {
  listSlots(): Promise<WorldSlots>;
  save(
    world: WorldRecord,
    stateRevision: number,
    kind: 'auto' | 'manual',
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
