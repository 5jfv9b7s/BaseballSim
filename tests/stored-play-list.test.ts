import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DexieWorldStorage, WorldDatabase } from '../src/world/dexie-storage.ts';
import { createWorld } from '../src/world/engine.ts';

async function database(run: (db: WorldDatabase, storage: DexieWorldStorage) => Promise<void>) {
  const db = new WorldDatabase('save-list-' + crypto.randomUUID());
  try {
    await run(db, new DexieWorldStorage(db));
  } finally {
    await db.delete();
  }
}

async function metadata(db: WorldDatabase) {
  return Promise.all([
    db.local_worlds.toArray(),
    db.save_slots.toArray(),
    db.save_snapshots.toArray(),
  ]);
}

test('保存一覧：枠別の日時・形式は実データから取得し、ブロックを読まず保存を変更しない', async () => {
  await database(async (db, storage) => {
    await storage.save(createWorld(), 0, 'manual', 0);
    const slot = (await db.save_slots.toArray())[0]!;
    // 同じゲーム日付でも端末への保存時刻を区別する。負荷のある試合進行は不要。
    await db.save_slots.add({ ...slot, slotKind: 'auto', updatedAt: '2026-10-20T01:02:03Z' });
    await db.save_slots.add({
      ...slot,
      slotKind: 'previousAuto',
      updatedAt: '2026-10-19T22:00:00Z',
    });
    const before = await metadata(db);
    const snapshot = (await db.save_snapshots.toArray())[0]!;
    const rejectBlockRead = () => {
      throw new Error('一覧でブロックを読んではならない');
    };
    db.save_blocks.hook('reading', rejectBlockRead);
    const [play] = await storage.listPlays();
    assert(play);
    assert.deepEqual(play.slots, ['auto', 'manual', 'previousAuto']);
    assert.equal(play.slotDetails.auto?.updatedAt, '2026-10-20T01:02:03Z');
    assert.equal(play.slotDetails.previousAuto?.updatedAt, '2026-10-19T22:00:00Z');
    assert.deepEqual(play.slotDetails.manual, {
      snapshotId: slot.snapshotId,
      gameDate: slot.gameDate,
      updatedAt: slot.updatedAt,
      createdAt: snapshot.createdAt,
      saveFormatVersion: snapshot.versions.saveFormatVersion,
      simulationVersion: snapshot.versions.simulationVersion,
    });
    assert.deepEqual(await metadata(db), before);
  });
});

test('保存一覧：一枠の目録がなくても他枠を表示し、欠損値を捏造しない', async () => {
  await database(async (db, storage) => {
    await storage.save(createWorld(), 0, 'manual', 0);
    const slot = (await db.save_slots.toArray())[0]!;
    await db.save_slots.add({ ...slot, slotKind: 'auto', snapshotId: 'missing-snapshot' });
    const before = await metadata(db);
    const [play] = await storage.listPlays();
    assert(play);
    assert.equal(play.slotDetails.auto?.createdAt, null);
    assert.equal(play.slotDetails.auto?.saveFormatVersion, null);
    assert.equal(play.slotDetails.auto?.simulationVersion, null);
    assert.equal(play.slotDetails.manual?.snapshotId, slot.snapshotId);
    assert.deepEqual(await metadata(db), before);
    await assert.rejects(storage.load('auto'));
    assert.equal((await storage.load('manual')).world.currentDate, slot.gameDate);
  });
});

test('保存一覧：取り込み先と元プレイを分離し、データ作成日時と端末への保存日時を混同しない', async () => {
  await database(async (db, storage) => {
    await storage.save(createWorld(), 0, 'manual', 0);
    const bytes = await storage.exportSnapshot('manual');
    const importedId = await storage.importSnapshot(bytes, crypto.randomUUID());
    await db.save_slots.update([importedId, 'manual', 1], { updatedAt: '2026-11-05T03:04:05Z' });
    const before = await metadata(db);
    const plays = await storage.listPlays();
    const original = plays.find((play) => play.localWorldId === storage.localWorldId)!;
    const imported = plays.find((play) => play.localWorldId === importedId)!;
    assert.equal(plays.length, 2);
    assert.equal(imported.slotDetails.manual?.createdAt, original.slotDetails.manual?.createdAt);
    assert.equal(imported.slotDetails.manual?.updatedAt, '2026-11-05T03:04:05Z');
    assert.notEqual(imported.slotDetails.manual?.updatedAt, original.slotDetails.manual?.updatedAt);
    assert.deepEqual(await metadata(db), before);
  });
});
