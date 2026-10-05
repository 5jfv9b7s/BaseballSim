import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DexieWorldStorage, WorldDatabase } from '../src/world/dexie-storage.ts';
import { collectUnusedInTransaction } from '../src/world/storage-gc.ts';
import {
  createWorld,
  createBullpenWorld,
  advanceWorld,
  completeDay,
  worldPhase,
} from '../src/world/engine.ts';
import { WorldController } from '../src/world/controller.ts';
import type { WorldRecord } from '../src/world/types.ts';

async function withDatabase(run: (db: WorldDatabase, storage: DexieWorldStorage) => Promise<void>) {
  const db = new WorldDatabase('gc-test-' + crypto.randomUUID());
  try {
    await run(db, new DexieWorldStorage(db));
  } finally {
    await db.delete();
  }
}
async function dump(db: WorldDatabase) {
  return {
    local: await db.local_worlds.toArray(),
    slots: await db.save_slots.toArray(),
    snapshots: await db.save_snapshots.toArray(),
    blocks: await db.save_blocks.toArray(),
  };
}
function day(world: WorldRecord) {
  while (worldPhase(world) === 'playing') world = advanceWorld(world, 25);
  return completeDay(world, world.currentDate);
}

// 0.16以前の複数履歴を、独立DBだけに再現する。
async function seedOldHistory(db: WorldDatabase, storage: DexieWorldStorage) {
  await storage.save(createWorld(100), 0, 'manual', 0);
  for (let i = 1; i <= 2; i++) {
    const old = await dump(db);
    await storage.save(createWorld(100 + i), i, 'manual', i);
    await db.transaction('rw', db.save_snapshots, db.save_blocks, async () => {
      await db.save_snapshots.bulkPut(old.snapshots);
      await db.save_blocks.bulkPut(old.blocks);
    });
  }
}

test('回収境界：書込トランザクション外では削除せず、反復保存で共有内容を残す', async () => {
  await withDatabase(async (db, storage) => {
    await assert.rejects(collectUnusedInTransaction(db), /書込トランザクション/);
    const world = createWorld();
    for (let i = 0; i < 20; i++) await storage.save(world, i, 'manual', i);
    assert.equal(await db.save_snapshots.count(), 1);
    assert.equal(await db.save_blocks.count(), 3);
    assert.deepEqual((await storage.load('manual')).world, world);
    assert.equal((await storage.inspectStorage()).candidateBlockIds.length, 0);
  });
});

test('現行世界の日次回収：自動・直前・手動を保持し、試合と途中手動保存を完全復元する', async () => {
  await withDatabase(async (db, storage) => {
    let world: WorldRecord = advanceWorld(createBullpenWorld(), 1);
    const manual = structuredClone(world);
    await storage.save(world, 0, 'manual', 0);
    let previous = world;
    for (let i = 1; worldPhase(world) !== 'scheduleComplete'; i++) {
      previous = world;
      world = day(world);
      await storage.save(world, i, 'auto', i);
      assert.equal(await db.save_snapshots.count(), Math.min(i + 1, 3));
      assert.equal((await storage.inspectStorage()).candidateBlockIds.length, 0);
    }
    assert.deepEqual((await storage.load('auto')).world, world);
    assert.deepEqual((await storage.load('previousAuto')).world, previous);
    assert.deepEqual((await storage.load('manual')).world, manual);
    const snapshot = (await db.save_snapshots.get((await storage.listSlots()).auto!.snapshotId))!;
    assert(snapshot.blockRefs.filter((r) => r.kind === 'game').length === 10);
  });
});

test('全参照保護：別プレイ枠・選択中保存・共有ブロックを保持して新規世界を保存する', async () => {
  await withDatabase(async (db, storage) => {
    await storage.save(createWorld(11), 0, 'manual', 0);
    const first = await dump(db);
    await db.save_slots.put({ ...first.slots[0]!, localWorldId: 'other-play' });
    await storage.save(createWorld(12), 1, 'manual', 1);
    const selected = (await db.local_worlds.get('v02-local'))!;
    await db.local_worlds.put({ ...selected, localWorldId: 'selected-play' });
    await storage.save(createWorld(13), 2, 'manual', 2);
    assert.equal(await db.save_snapshots.count(), 3);
    assert(await db.save_snapshots.get(first.slots[0]!.snapshotId));
    assert(await db.save_snapshots.get(selected.selectedSnapshotId));
    assert.equal((await storage.inspectStorage()).candidateBlockIds.length, 0);
  });
});

test('不整合時は回収見送り：保護先の目録・ブロック欠損があっても既存履歴を消さない', async () => {
  for (const broken of ['manifest', 'block'])
    await withDatabase(async (db, storage) => {
      await seedOldHistory(db, storage);
      const old = await dump(db);
      const snapshot = old.snapshots[0]!;
      if (broken === 'manifest') {
        await db.save_slots.put({
          ...old.slots[0]!,
          localWorldId: 'broken-play',
          snapshotId: 'missing',
        });
      } else {
        await db.save_slots.put({
          ...old.slots[0]!,
          localWorldId: 'broken-play',
          snapshotId: snapshot.snapshotId,
        });
        // 保護目録の参照を存在しないIDへ差し替える試験。製品データには行わない。
        await db.save_snapshots.put({
          ...snapshot,
          blockRefs: [{ ...snapshot.blockRefs[0]!, blockId: 'missing' }],
        });
      }
      const before = await dump(db);
      await storage.save(createWorld(200), 3, 'manual', 3);
      for (const row of before.snapshots)
        assert.deepEqual(await db.save_snapshots.get(row.snapshotId), row);
      for (const row of before.blocks) assert.deepEqual(await db.save_blocks.get(row.blockId), row);
      assert((await storage.inspectStorage()).issues.length > 0);
      assert.deepEqual((await storage.load('manual')).world, createWorld(200));
    });
});

test('削除失敗：目録・ブロックの途中エラーで4ストアを全て戻し、再試行は一度だけ確定', async () => {
  for (const phase of ['snapshot', 'block'])
    await withDatabase(async (db, storage) => {
      await seedOldHistory(db, storage);
      const before = await dump(db);
      let calls = 0;
      const fail = () => {
        if (++calls === 2) throw new Error('injected deletion failure');
      };
      const table = phase === 'snapshot' ? db.save_snapshots : db.save_blocks;
      table.hook('deleting', fail);
      await assert.rejects(storage.save(createWorld(300), 3, 'manual', 3), /deletion failure/);
      table.hook('deleting').unsubscribe(fail);
      assert(calls >= 2);
      assert.deepEqual(await dump(db), before);
      assert.deepEqual((await storage.load('manual')).world, createWorld(102));
      await storage.save(createWorld(300), 3, 'manual', 3);
      assert.equal((await storage.listSlots()).storageRevision, 4);
      assert.equal(await db.save_snapshots.count(), 1);
      assert.deepEqual((await storage.load('manual')).world, createWorld(300));
      const after = await dump(db);
      await assert.rejects(storage.save(createWorld(400), 4, 'manual', 3), /別タブ/);
      assert.deepEqual(await dump(db), after);
    });
});

test('競合：同一世代への別接続保存は一方だけ確定し、読込中の旧保存は復元または世代競合で停止する', async () => {
  await withDatabase(async (db, storage) => {
    const original = createWorld(1);
    await storage.save(original, 0, 'manual', 0);
    const other = new WorldDatabase(db.name);
    try {
      const second = new DexieWorldStorage(other);
      const reading = storage.load('manual').then(
        (value) => value,
        (error: unknown) => error,
      );
      const results = await Promise.allSettled([
        second.save(createWorld(2), 1, 'manual', 1),
        storage.save(createWorld(3), 1, 'manual', 1),
      ]);
      const readResult = await reading;
      if (readResult instanceof Error) assert.match(readResult.message, /読込中に別タブ/);
      else {
        assert(readResult && typeof readResult === 'object' && 'world' in readResult);
        assert.deepEqual(readResult.world, original);
      }
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
      assert.equal((await storage.listSlots()).storageRevision, 2);
      const loaded = await storage.load('manual');
      assert([2, 3].includes(loaded.world.seed));
      assert.equal(await db.save_snapshots.count(), 1);
      assert.equal((await storage.inspectStorage()).candidateBlockIds.length, 0);
    } finally {
      other.close();
    }
  });
});

test('再判定：診断後に別枠へ保護された旧履歴は、次の保存で回収しない', async () => {
  await withDatabase(async (db, storage) => {
    await seedOldHistory(db, storage);
    const report = await storage.inspectStorage();
    const protectedId = report.candidateSnapshotIds[0]!;
    const slot = (await db.save_slots.toArray())[0]!;
    await db.save_slots.put({ ...slot, localWorldId: 'new-protection', snapshotId: protectedId });
    await storage.save(createWorld(400), 3, 'manual', 3);
    assert(await db.save_snapshots.get(protectedId));
    assert.equal(await db.save_snapshots.count(), 2);
    assert.equal((await storage.inspectStorage()).candidateBlockIds.length, 0);
  });
});

test('Controller：回収失敗時に保存完了を公開せず、同じ指示の再送で一度だけ確定する', async () => {
  await withDatabase(async (db, storage) => {
    const controller = new WorldController(storage);
    await controller.initialize();
    const send = (kind: 'save' | 'advance', commandId: string) =>
      controller.dispatch({
        kind,
        ...(kind === 'advance' ? { count: 1 } : {}),
        commandId,
        localWorldId: 'v02-local',
        expectedStateRevision: controller.query().revision,
      } as Parameters<WorldController['dispatch']>[0]);
    await send('save', 'first');
    await send('advance', 'pitch');
    const before = controller.query(),
      records = await dump(db);
    const command = {
      kind: 'save' as const,
      commandId: 'second',
      localWorldId: 'v02-local' as const,
      expectedStateRevision: before.revision,
    };
    const fail = () => {
      throw new Error('cleanup failed');
    };
    db.save_snapshots.hook('deleting', fail);
    await assert.rejects(controller.dispatch(command), /cleanup failed/);
    db.save_snapshots.hook('deleting').unsubscribe(fail);
    const failed = controller.query();
    assert.equal(failed.revision, before.revision);
    assert.equal(failed.unsavedChanges, true);
    assert.deepEqual(failed.games, before.games);
    assert.deepEqual(await dump(db), records);
    const saved = await controller.dispatch(command);
    assert.deepEqual(await controller.dispatch(command), saved);
    assert.equal(saved.slots.storageRevision, 2);
    assert.equal(saved.unsavedChanges, false);
  });
});
