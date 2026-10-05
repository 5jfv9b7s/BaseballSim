import type { WorldDatabase } from './dexie-storage.ts';

export interface StorageInspection {
  version: 'storage-inspection-v1';
  snapshots: number;
  protectedSnapshots: number;
  blocks: number;
  payloadBytes: number;
  candidatePayloadBytes: number;
  candidateSnapshotIds: string[];
  candidateBlockIds: string[];
  issues: string[];
}

/** 読み取り専用の診断。候補の列挙だけを行い、DBの変更・削除は一切行わない。 */
export async function inspectWorldStorage(db: WorldDatabase): Promise<StorageInspection> {
  return db.transaction(
    'r',
    db.local_worlds,
    db.save_slots,
    db.save_snapshots,
    db.save_blocks,
    async () => {
      const report: StorageInspection = {
        version: 'storage-inspection-v1',
        snapshots: 0,
        protectedSnapshots: 0,
        blocks: 0,
        payloadBytes: 0,
        candidatePayloadBytes: 0,
        candidateSnapshotIds: [],
        candidateBlockIds: [],
        issues: [],
      };
      const roots = new Set<string>();
      const protect = (snapshotId: unknown) => {
        if (typeof snapshotId === 'string' && snapshotId.length > 0) roots.add(snapshotId);
        else report.issues.push('保存枠または選択中保存の参照が不正です。');
      };
      // 全プレイ・全枠から到達する共有データを保護する。
      for (const slot of await db.save_slots.toArray()) protect(slot.snapshotId);
      for (const local of await db.local_worlds.toArray()) {
        if (local.selectedSnapshotId !== undefined) protect(local.selectedSnapshotId);
      }
      const snapshots = await db.save_snapshots.toArray();
      report.snapshots = snapshots.length;
      const byId = new Map(snapshots.map((snapshot) => [snapshot.snapshotId, snapshot]));
      const protectedBlocks = new Set<string>();
      for (const snapshotId of roots) {
        const snapshot = byId.get(snapshotId);
        if (!snapshot || !Array.isArray(snapshot.blockRefs) || !snapshot.blockRefs.length) {
          report.issues.push('保護対象の保存目録またはブロック参照がありません。');
          continue;
        }
        report.protectedSnapshots++;
        for (const ref of snapshot.blockRefs) {
          if (typeof ref?.blockId === 'string' && ref.blockId.length > 0)
            protectedBlocks.add(ref.blockId);
          else report.issues.push('保護対象のブロック参照が不正です。');
        }
      }
      const found = new Set<string>();
      // 全バイナリを配列へ保持せず、1件ずつ格納済みpayloadの長さを数える。
      await db.save_blocks.each((block) => {
        found.add(block.blockId);
        report.blocks++;
        if (!(block.payloadBytes instanceof Uint8Array)) {
          report.issues.push('保存ブロックの容量を取得できません。');
          return;
        }
        report.payloadBytes += block.payloadBytes.byteLength;
        if (!protectedBlocks.has(block.blockId)) {
          report.candidateBlockIds.push(block.blockId);
          report.candidatePayloadBytes += block.payloadBytes.byteLength;
        }
      });
      for (const blockId of protectedBlocks) {
        if (!found.has(blockId)) report.issues.push('保護対象の保存ブロックが見つかりません。');
      }
      // 各目録は完全な参照を持つため、親IDだけの祖先を保護対象へ加えない。
      report.candidateSnapshotIds = snapshots
        .filter((s) => !roots.has(s.snapshotId))
        .map((s) => s.snapshotId);
      report.issues = [...new Set(report.issues)];
      if (report.issues.length) {
        // 参照を確定できなければ、どのデータも整理可能とは表示しない。
        report.candidateSnapshotIds = [];
        report.candidateBlockIds = [];
        report.candidatePayloadBytes = 0;
      }
      return report;
    },
  );
}
