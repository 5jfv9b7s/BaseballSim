import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldDatabase, DexieWorldStorage } from '../src/world/dexie-storage.ts';
import { createWorld, advanceWorld, completeDay, worldPhase } from '../src/world/engine.ts';
import { WorldController } from '../src/world/controller.ts';
import type { WorldRecord } from '../src/world/types.ts';

function day(world: WorldRecord) {
  while (worldPhase(world) === 'playing') world = advanceWorld(world, 25);
  return completeDay(world, world.currentDate);
}
async function dump(db: WorldDatabase) {
  return [
    await db.local_worlds.toArray(),
    await db.save_slots.toArray(),
    await db.save_snapshots.toArray(),
    await db.save_blocks.toArray(),
  ];
}
async function database(run: (db: WorldDatabase, storage: DexieWorldStorage) => Promise<void>) {
  const db = new WorldDatabase('inspection-' + crypto.randomUUID());
  try {
    await run(db, new DexieWorldStorage(db));
  } finally {
    await db.delete();
  }
}

/** 0.16以前の履歴蓄積を独立テストDBに再現する。製品の回収を無効化しない。 */
async function saveKeepingHistory(
  storage: DexieWorldStorage,
  ...args: Parameters<DexieWorldStorage['save']>
) {
  const db = storage.database;
  const snapshots = await db.save_snapshots.toArray();
  const blocks = await db.save_blocks.toArray();
  const slots = await storage.save(...args);
  await db.transaction('rw', db.save_snapshots, db.save_blocks, async () => {
    await db.save_snapshots.bulkPut(snapshots);
    await db.save_blocks.bulkPut(blocks);
  });
  return slots;
}

test('容量診断：空の保存領域・共有データの実バイト数を読み取り、4ストアを変更しない', async () => {
  await database(async (db, storage) => {
    const empty = await storage.inspectStorage();
    assert.equal(empty.payloadBytes, 0);
    assert.equal(empty.snapshots, 0);
    assert.deepEqual(empty.issues, []);
    await saveKeepingHistory(storage, createWorld(), 0, 'manual', 0);
    await saveKeepingHistory(storage, createWorld(), 1, 'manual', 1);
    const before = await dump(db);
    const report = await storage.inspectStorage();
    const blocks = await db.save_blocks.toArray();
    assert.equal(
      report.payloadBytes,
      blocks.reduce((n, b) => n + b.payloadBytes.length, 0),
    );
    assert.equal(report.blocks, 3);
    assert.equal(report.snapshots, 2);
    assert.equal(report.protectedSnapshots, 1);
    assert.equal(report.candidateSnapshotIds.length, 1);
    assert.equal(report.candidateBlockIds.length, 0);
    assert.deepEqual(await dump(db), before);
  });
});

test('保持境界：最新自動・直前自動・手動と共有ブロックを保護し、祖先IDだけの履歴を区別', async () => {
  await database(async (db, storage) => {
    let world: WorldRecord = createWorld();
    const manual = await saveKeepingHistory(storage, world, 0, 'manual', 0);
    for (let i = 1; i <= 3; i++) {
      world = day(world);
      await saveKeepingHistory(storage, world, i, 'auto', i);
    }
    const before = await dump(db);
    const slots = await storage.listSlots();
    const roots = new Set([
      slots.auto!.snapshotId,
      slots.previousAuto!.snapshotId,
      manual.manual!.snapshotId,
    ]);
    const snapshots = await db.save_snapshots.toArray();
    const report = await storage.inspectStorage();
    assert.equal(report.snapshots, 4);
    assert.equal(report.protectedSnapshots, 3);
    assert.deepEqual(
      report.candidateSnapshotIds,
      snapshots.filter((s) => !roots.has(s.snapshotId)).map((s) => s.snapshotId),
    );
    const retained = new Set(
      snapshots
        .filter((s) => roots.has(s.snapshotId))
        .flatMap((s) => s.blockRefs.map((r) => r.blockId)),
    );
    assert(report.candidateBlockIds.length > 0);
    assert(report.candidateBlockIds.every((id) => !retained.has(id)));
    const orphanBytes = (await db.save_blocks.toArray())
      .filter((b) => !retained.has(b.blockId))
      .reduce((n, b) => n + b.payloadBytes.length, 0);
    assert.equal(report.candidatePayloadBytes, orphanBytes);
    assert.deepEqual(await dump(db), before);
    assert.deepEqual((await storage.load('auto')).world, world);
    assert.deepEqual((await storage.load('manual')).world, createWorld());
  });
});

test('保持境界：別プレイの枠と選択中保存も保護し、新規世界に切り替えても参照を失わない', async () => {
  await database(async (db, storage) => {
    const first = await saveKeepingHistory(storage, createWorld(), 0, 'manual', 0);
    const oldSlot = (await db.save_slots.get(['v02-local', 'manual', 1]))!;
    const oldLocal = (await db.local_worlds.get('v02-local'))!;
    const second = await saveKeepingHistory(
      storage,
      advanceWorld(createWorld(), 1),
      1,
      'manual',
      1,
    );
    await saveKeepingHistory(storage, createWorld(123), 2, 'manual', 2);
    await db.save_slots.put({ ...oldSlot, localWorldId: 'another-play' });
    await db.local_worlds.put({
      ...oldLocal,
      localWorldId: 'selected-play',
      selectedSnapshotId: second.manual!.snapshotId,
    });
    const report = await storage.inspectStorage();
    assert.equal(report.protectedSnapshots, 3);
    assert(!report.candidateSnapshotIds.includes(first.manual!.snapshotId));
    assert.deepEqual(report.candidateSnapshotIds, []);
    assert.deepEqual(report.candidateBlockIds, []);
  });
});

test('不整合：保護参照・目録・ブロックが欠ける場合は整理候補を確定しない', async () => {
  for (const kind of ['slot', 'manifest', 'reference', 'block'] as const) {
    await database(async (db, storage) => {
      const slots = await saveKeepingHistory(storage, createWorld(), 0, 'manual', 0);
      await saveKeepingHistory(storage, advanceWorld(createWorld(), 1), 1, 'manual', 1);
      const current = await storage.listSlots();
      const snapshot = (await db.save_snapshots.get(current.manual!.snapshotId))!;
      if (kind === 'slot') {
        const slot = (await db.save_slots.get(['v02-local', 'manual', 1]))!;
        await db.save_slots.put({ ...slot, snapshotId: '' });
      } else if (kind === 'manifest') await db.save_snapshots.delete(current.manual!.snapshotId);
      else if (kind === 'reference') await db.save_snapshots.put({ ...snapshot, blockRefs: [] });
      else await db.save_blocks.delete(snapshot.blockRefs[0]!.blockId);
      const before = await dump(db);
      const report = await storage.inspectStorage();
      assert(report.issues.length > 0, kind);
      assert.deepEqual(report.candidateSnapshotIds, []);
      assert.deepEqual(report.candidateBlockIds, []);
      assert.equal(report.candidatePayloadBytes, 0);
      assert.deepEqual(await dump(db), before);
      assert(await db.save_snapshots.get(slots.manual!.snapshotId));
    });
  }
});

test('非変更：診断の反復・失敗は世界・乱数・状態版・保存世代・既存保存を変更しない', async () => {
  await database(async (db, storage) => {
    const controller = new WorldController(storage);
    await controller.initialize();
    await controller.dispatch({
      kind: 'save',
      commandId: 'save',
      localWorldId: 'v02-local',
      expectedStateRevision: 0,
    });
    const world = controller.query();
    const before = await dump(db);
    for (let i = 0; i < 3; i++) await storage.inspectStorage();
    const fail = () => {
      throw new Error('read failure');
    };
    db.save_snapshots.hook('reading', fail);
    await assert.rejects(storage.inspectStorage(), /read failure/);
    db.save_snapshots.hook('reading').unsubscribe(fail);
    assert.deepEqual(controller.query(), world);
    assert.deepEqual(await dump(db), before);
    assert.deepEqual((await storage.inspectStorage()).issues, []);
  });
});

test('読取境界：別接続の保存と同時に診断しても、一貫した参照だけを観測する', async () => {
  await database(async (db, storage) => {
    await storage.save(createWorld(), 0, 'manual', 0);
    const other = new WorldDatabase(db.name);
    try {
      const writer = new DexieWorldStorage(other);
      const [report] = await Promise.all([
        storage.inspectStorage(),
        writer.save(advanceWorld(createWorld(), 1), 1, 'manual', 1),
      ]);
      assert.deepEqual(report.issues, []);
      assert.equal(report.snapshots, 1);
      assert.equal(report.protectedSnapshots, 1);
      const after = await storage.inspectStorage();
      assert.equal(after.snapshots, 1);
      assert.equal((await storage.listSlots()).storageRevision, 2);
    } finally {
      other.close();
    }
  });
});
