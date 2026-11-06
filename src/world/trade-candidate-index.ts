import { ensure, integer } from '../engine/validation.ts';
import { financeId } from '../finance/validation.ts';
import {
  TRADE_STORAGE_PROFILE,
  validateTradeManifest,
  type TradeStoredSnapshot,
} from './trade-save-format.ts';
import type { WorldDatabase } from './dexie-storage.ts';

export interface TradeCandidateIndexEntry {
  localWorldId: string;
  worldId: string | null;
  label: string;
  gameDate: string | null;
  stateRevision: number | null;
  storageRevision: number | null;
  status: 'indexed' | 'unavailable';
  error: string | null;
}

/** 候補profileだけを読む。indexedは目録参照の確認で、全ブロック復元の合格ではない。 */
export async function listTradeCandidates(db: WorldDatabase): Promise<TradeCandidateIndexEntry[]> {
  const snapshots = db.table<TradeStoredSnapshot, string>('save_snapshots');
  return db.transaction('r', db.local_worlds, db.save_slots, snapshots, async () => {
    const locals = (await db.local_worlds.toArray()).filter(
      (r) => r.storageProfile === TRADE_STORAGE_PROFILE,
    );
    const result: TradeCandidateIndexEntry[] = [];
    for (const local of locals) {
      financeId(local.localWorldId);
      const base = {
        localWorldId: local.localWorldId,
        worldId: null,
        gameDate: null,
        stateRevision: null,
        storageRevision: null,
        label:
          typeof local.displayName === 'string' && local.displayName.trim()
            ? local.displayName
            : local.localWorldId,
      };
      try {
        financeId(local.worldId);
        integer(local.storageRevision, 1, Number.MAX_SAFE_INTEGER, '候補の保存版');
        const matches = (
          await db.save_slots.where('localWorldId').equals(local.localWorldId).toArray()
        ).filter((s) => s.snapshotId === local.selectedSnapshotId);
        ensure(matches.length === 1, '現在保存の枠を一意に解決できません');
        const slot = matches[0]!;
        ensure(
          slot.slotNo === 1 && ['auto', 'manual'].includes(slot.slotKind),
          '現在保存の枠が不正です',
        );
        const snapshot = await snapshots.get(slot.snapshotId);
        validateTradeManifest(snapshot);
        ensure(
          snapshot.worldId === local.worldId &&
            snapshot.gameDate === slot.gameDate &&
            (slot.slotKind === 'manual'
              ? snapshot.saveKind === 'manual'
              : ['actionAuto', 'dailyAuto'].includes(snapshot.saveKind)),
          '候補の管理参照が不一致です',
        );
        result.push({
          ...base,
          worldId: local.worldId,
          gameDate: snapshot.gameDate,
          stateRevision: snapshot.stateRevision,
          storageRevision: local.storageRevision,
          status: 'indexed',
          error: null,
        });
      } catch (error) {
        result.push({
          ...base,
          status: 'unavailable',
          error: error instanceof Error ? error.message : '候補の保存参照を確認できません',
        });
      }
    }
    return result.sort((a, b) =>
      a.localWorldId < b.localWorldId ? -1 : a.localWorldId > b.localWorldId ? 1 : 0,
    );
  });
}
