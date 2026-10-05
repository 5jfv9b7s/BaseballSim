import { ensure } from '../engine/validation.ts';
import { canonicalJson } from '../storage/codec.ts';
import { decodeBackup, encodeBackup } from './backup-package.ts';
import { verifySharedBlocks, putSharedBlocks } from './shared-blocks.ts';
import { validateSnapshot } from './snapshot-codec.ts';
import type { WorldDatabase } from './dexie-storage.ts';
import type { Block } from './save-format.ts';
import type { StoredPlay, WorldSlotKind } from './storage.ts';

export async function listStoredPlays(db: WorldDatabase): Promise<StoredPlay[]> {
  return db.transaction('r', db.local_worlds, db.save_slots, db.save_snapshots, async () => {
    const slots = await db.save_slots.toArray();
    const locals = await db.local_worlds.toArray();
    return locals.map((local) => ({
      localWorldId: local.localWorldId,
      label: local.displayName ?? '初期プレイ',
      slots: (['auto', 'manual', 'previousAuto'] as const).filter((kind) =>
        slots.some((s) => s.localWorldId === local.localWorldId && s.slotKind === kind),
      ),
      gameDate:
        slots.find(
          (s) => s.localWorldId === local.localWorldId && s.snapshotId === local.selectedSnapshotId,
        )?.gameDate ?? null,
    }));
  });
}

export async function exportStoredPlay(
  db: WorldDatabase,
  localWorldId: string,
  kind: WorldSlotKind,
): Promise<Uint8Array> {
  ensure(['auto', 'manual', 'previousAuto'].includes(kind), '書き出す保存枠が不正です');
  // 読取中は同じ4ストアの回収を排他し、処理に必要なバイトを全部取得する。
  const captured = await db.transaction(
    'r',
    db.local_worlds,
    db.save_slots,
    db.save_snapshots,
    db.save_blocks,
    async () => {
      const slot = await db.save_slots.get([localWorldId, kind, 1]);
      ensure(slot, 'この枠には保存がありません');
      const snapshot = await db.save_snapshots.get(slot.snapshotId);
      ensure(snapshot, '保存の目録がありません');
      validateSnapshot(snapshot);
      const blocks = await db.save_blocks.bulkGet(snapshot.blockRefs.map((r) => r.blockId));
      ensure(
        blocks.every((block): block is Block => !!block),
        '保存ブロックが不足しています',
      );
      return { snapshot, blocks };
    },
  );
  return encodeBackup(captured.snapshot, captured.blocks);
}

export async function importStoredPlay(
  db: WorldDatabase,
  bytes: Uint8Array,
  requestId: string,
): Promise<string> {
  ensure(
    typeof requestId === 'string' && /^[a-f0-9-]{36}$/.test(requestId),
    '取り込み指示IDが不正です',
  );
  const imported = await decodeBackup(bytes);
  const { snapshot, blocks, world, packageHash } = imported;
  const localWorldId = 'import-' + requestId;
  const verified = await verifySharedBlocks(db, blocks);
  await db.transaction(
    'rw',
    db.local_worlds,
    db.save_slots,
    db.save_snapshots,
    db.save_blocks,
    async () => {
      const previous = await db.local_worlds.get(localWorldId);
      if (previous) {
        ensure(previous.importPackageHash === packageHash, '同じ取り込み指示IDの内容が異なります');
        return; // 応答紛失後の再送も、進めたプレイを巻き戻さない。
      }
      await putSharedBlocks(db, blocks, verified);
      const existing = await db.save_snapshots.get(snapshot.snapshotId);
      if (existing)
        ensure(canonicalJson(existing) === canonicalJson(snapshot), '同じ保存IDの内容が異なります');
      else await db.save_snapshots.add(snapshot);
      const now = new Date().toISOString();
      const club =
        'management' in world
          ? world.definitions.squads.find((s) => s.squadId === world.management.controlledSquadId)
              ?.team.name
          : null;
      await db.save_slots.add({
        localWorldId,
        slotKind: 'manual',
        slotNo: 1,
        snapshotId: snapshot.snapshotId,
        gameDate: snapshot.gameDate,
        updatedAt: now,
      });
      await db.local_worlds.add({
        localWorldId,
        worldId: snapshot.worldId,
        storageRevision: 1,
        selectedSnapshotId: snapshot.snapshotId,
        updatedAt: now,
        displayName: (club ?? '世界') + ' / ' + snapshot.gameDate + ' 取り込み ' + now,
        importPackageHash: packageHash,
      });
    },
  );
  return localWorldId;
}
