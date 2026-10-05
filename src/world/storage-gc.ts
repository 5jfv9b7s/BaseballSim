import { Dexie } from 'dexie';
import { ensure } from '../engine/validation.ts';
import { inspectWorldStorage } from './storage-inspection.ts';
import type { WorldDatabase } from './dexie-storage.ts';

/** 保存枠更新と同じ4ストア書込トランザクション内でのみ呼ぶ。 */
export async function collectUnusedInTransaction(db: WorldDatabase): Promise<void> {
  const transaction = Dexie.currentTransaction;
  ensure(
    transaction?.db === db && transaction.mode === 'readwrite',
    '回収には保存の書込トランザクションが必要です',
  );

  // 以前の診断結果を使わず、排他境界内の最新参照を調べ直す。
  const report = await inspectWorldStorage(db);
  if (report.issues.length) return;

  // 全枠と選択中保存から到達できないものだけ。失敗は呼出元の保存全体を取り消す。
  await db.save_snapshots.bulkDelete(report.candidateSnapshotIds);
  await db.save_blocks.bulkDelete(report.candidateBlockIds);
}
