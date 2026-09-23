import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DexieStorageAdapter, GameDatabase } from '../src/storage/dexie-adapter.ts';
import { createGame, runToCompletion } from '../src/game/engine.ts';
import { finalizeGame } from '../src/game/results.ts';

function completed(seed: number) {
  const game = createGame(seed);
  runToCompletion(game);
  finalizeGame(game);
  return game;
}

test('4ストアに保存し、接続し直して同じ結果・選手・乱数・定義を復元', async () => {
  const name = 'test-roundtrip-' + crypto.randomUUID();
  const db = new GameDatabase(name);
  const storage = new DexieStorageAdapter(db);
  const game = completed(20260923);
  const before = structuredClone(game);
  const saved = await storage.commitSnapshot(game, 0);
  assert.equal(saved.storageRevision, 1);
  assert.deepEqual(game, before);
  assert.deepEqual(db.tables.map((t) => t.name).sort(), [
    'local_worlds',
    'save_blocks',
    'save_slots',
    'save_snapshots',
  ]);
  db.close();
  const reopened = new GameDatabase(name);
  try {
    const loaded = await new DexieStorageAdapter(reopened).loadSnapshot();
    assert.deepEqual(loaded.record, game);
  } finally {
    await reopened.delete();
  }
});

test('保存途中の失敗をロールバックし、以前の枠・ブロック・結果を維持', async () => {
  const db = new GameDatabase('test-rollback-' + crypto.randomUUID());
  const storage = new DexieStorageAdapter(db);
  try {
    const first = completed(1);
    await storage.commitSnapshot(first, 0);
    const blockCount = await db.save_blocks.count();
    const fail = () => {
      throw new Error('simulated disk full');
    };
    db.save_snapshots.hook('creating', fail);
    await assert.rejects(storage.commitSnapshot(completed(2), 1), /disk full/);
    db.save_snapshots.hook('creating').unsubscribe(fail);
    assert.equal((await storage.listSlots()).storageRevision, 1);
    assert.equal(await db.save_blocks.count(), blockCount);
    assert.equal(await db.save_snapshots.count(), 1);
    assert.deepEqual((await storage.loadSnapshot()).record, first);
  } finally {
    await db.delete();
  }
});

test('別タブ相当の古い世代を拒否し、前の保存へ戻れる', async () => {
  const db = new GameDatabase('test-conflict-' + crypto.randomUUID());
  const storage = new DexieStorageAdapter(db);
  try {
    const first = completed(1);
    const second = completed(2);
    await storage.commitSnapshot(first, 0);
    await assert.rejects(storage.commitSnapshot(second, 0), /別タブ/);
    await storage.commitSnapshot(second, 1);
    assert.deepEqual((await storage.loadSnapshot()).record, second);
    assert.deepEqual((await storage.loadSnapshot(true)).record, first);
    assert.equal((await storage.loadSnapshot(true)).storageRevision, 2);
  } finally {
    await db.delete();
  }
});

test('未知の版・改変された記録・破損ブロックを拒否し、正常な前保存を残す', async () => {
  const db = new GameDatabase('test-corrupt-' + crypto.randomUUID());
  const storage = new DexieStorageAdapter(db);
  try {
    const first = completed(1);
    await storage.commitSnapshot(first, 0);
    const altered = completed(2);
    altered.result!.score.home++;
    await assert.rejects(storage.commitSnapshot(altered, 1), /一致しません/);
    const second = completed(2);
    const saved = await storage.commitSnapshot(second, 1);
    const snapshot = await db.save_snapshots.get(saved.snapshotId!);
    const unknownVersion = structuredClone(snapshot!);
    unknownVersion.versions = { ...unknownVersion.versions, simulationVersion: 'unknown' as never };
    await db.save_snapshots.put(unknownVersion);
    await assert.rejects(storage.loadSnapshot(), /未対応/);
    assert.deepEqual((await storage.loadSnapshot(true)).record, first);
    await db.save_snapshots.put(snapshot!);
    const gameRef = snapshot!.blockRefs.find((b) => b.kind === 'game')!;
    const block = await db.save_blocks.get(gameRef.blockId);
    block!.payloadBytes[0] = 0;
    await db.save_blocks.put(block!);
    await assert.rejects(storage.loadSnapshot(), /破損/);
    assert.deepEqual((await storage.loadSnapshot(true)).record, first);
  } finally {
    await db.delete();
  }
});
