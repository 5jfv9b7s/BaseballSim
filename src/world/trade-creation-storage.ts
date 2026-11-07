import { ensure } from '../engine/validation.ts';
import { WorldDatabase, DexieWorldStorage } from './dexie-storage.ts';
import { DexieTradeApplicationStorage } from './trade-dexie-storage.ts';
import { validateSnapshot } from './snapshot-codec.ts';
import { requireTradeCreationSource } from './trade-creation-input.ts';
import type {
  TradeCreationAccess,
  TradeCreationSource,
  TradeCreationSourceRef,
} from './trade-creation-types.ts';

export function tradeCreationStorage(db: WorldDatabase): TradeCreationAccess {
  return {
    async listSources() {
      return db.transaction('r', db.local_worlds, db.save_slots, db.save_snapshots, async () => {
        const locals = (await db.local_worlds.toArray()).filter((r) => !r.storageProfile);
        const slots = await db.save_slots.toArray();
        const result: TradeCreationSource[] = [];
        for (const local of locals)
          for (const slot of slots.filter(
            (s) => s.localWorldId === local.localWorldId && s.slotNo === 1,
          )) {
            const snapshot = await db.save_snapshots.get(slot.snapshotId);
            let supported = false;
            try {
              ensure(snapshot, '保存目録がありません');
              validateSnapshot(snapshot);
              supported =
                snapshot.versions.simulationVersion === 'world-prototype-v21' &&
                snapshot.worldId === local.worldId &&
                snapshot.gameDate === slot.gameDate;
            } catch {
              /* 選択不可の目録として残す。 */
            }
            result.push({
              localWorldId: local.localWorldId,
              slotKind: slot.slotKind,
              snapshotId: slot.snapshotId,
              storageRevision: local.storageRevision,
              label: local.displayName ?? '通常プレイ',
              gameDate: slot.gameDate,
              supported,
            });
          }
        return result;
      });
    },
    async loadSource(ref: TradeCreationSourceRef) {
      const local = await db.local_worlds.get(ref.localWorldId);
      ensure(
        local && !local.storageProfile && local.storageRevision === ref.storageRevision,
        '元プレイの保存版が更新されたか、通常プレイではありません',
      );
      const loaded = await new DexieWorldStorage(db, ref.localWorldId).load(ref.slotKind);
      ensure(
        loaded.slots.storageRevision === ref.storageRevision &&
          loaded.slots[ref.slotKind]?.snapshotId === ref.snapshotId &&
          loaded.world.worldId === local.worldId,
        '元の保存時点が更新されました。一覧から選び直してください',
      );
      ensure(loaded.world.version === 'world-prototype-v21', '元保存は世界v21に対応します');
      requireTradeCreationSource(loaded.world);
      return loaded.world;
    },
    create: (saved, options) =>
      new DexieTradeApplicationStorage(db, saved.localWorldId).create(saved, options),
  };
}
