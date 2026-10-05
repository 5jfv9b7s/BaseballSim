import type { WorldRecord } from './types.ts';
import type { WorldSlotKind } from './storage.ts';

export type SaveFormat =
  | 'v02-world-snapshot-v1'
  | 'v03-world-snapshot-v2'
  | 'v04-world-snapshot-v3'
  | 'v05-world-snapshot-v4'
  | 'v06-world-snapshot-v5'
  | 'v07-world-snapshot-v6'
  | 'v08-world-snapshot-v7'
  | 'v09-world-snapshot-v8'
  | 'v010-world-snapshot-v9'
  | 'v011-world-snapshot-v10'
  | 'v012-world-snapshot-v11'
  | 'v013-world-snapshot-v12'
  | 'v014-world-snapshot-v13'
  | 'v015-world-snapshot-v14';
export const formatFor = (version: WorldRecord['version']): SaveFormat =>
  version === 'world-prototype-v1'
    ? 'v02-world-snapshot-v1'
    : version === 'world-prototype-v2'
      ? 'v03-world-snapshot-v2'
      : version === 'world-prototype-v3'
        ? 'v04-world-snapshot-v3'
        : version === 'world-prototype-v4'
          ? 'v05-world-snapshot-v4'
          : version === 'world-prototype-v5'
            ? 'v06-world-snapshot-v5'
            : version === 'world-prototype-v6'
              ? 'v07-world-snapshot-v6'
              : version === 'world-prototype-v7'
                ? 'v08-world-snapshot-v7'
                : version === 'world-prototype-v8'
                  ? 'v09-world-snapshot-v8'
                  : version === 'world-prototype-v9'
                    ? 'v010-world-snapshot-v9'
                    : version === 'world-prototype-v10'
                      ? 'v011-world-snapshot-v10'
                      : version === 'world-prototype-v11'
                        ? 'v012-world-snapshot-v11'
                        : version === 'world-prototype-v12'
                          ? 'v013-world-snapshot-v12'
                          : version === 'world-prototype-v13'
                            ? 'v014-world-snapshot-v13'
                            : 'v015-world-snapshot-v14';
export const MAX_BYTES = 64 * 1024 * 1024;
export const MAX_ANNUAL_RAW_BYTES = 512 * 1024 * 1024;

export interface LocalWorld {
  displayName?: string;
  importPackageHash?: string;
  localWorldId: string;
  worldId: string;
  storageRevision: number;
  selectedSnapshotId: string;
  updatedAt: string;
}
export interface Slot {
  localWorldId: string;
  slotKind: WorldSlotKind;
  slotNo: number;
  snapshotId: string;
  gameDate: string;
  updatedAt: string;
}
export interface BlockRef {
  logicalKey: string;
  blockId: string;
  kind: string;
  schemaVersion: SaveFormat;
  contentHash: string;
  rawBytes: number;
}
export interface Block extends BlockRef {
  codec: 'none' | 'gzip';
  payloadBytes: Uint8Array;
}
export interface Snapshot {
  snapshotId: string;
  worldId: string;
  parentSnapshotId: string | null;
  createdAt: string;
  gameDate: string;
  stateRevision: number;
  saveKind: 'dailyAuto' | 'manual' | 'actionAuto';
  versions: { saveFormatVersion: SaveFormat; simulationVersion: WorldRecord['version'] };
  blockRefs: BlockRef[];
  manifestHash: string;
}
