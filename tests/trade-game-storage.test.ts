import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { WorldDatabase, DexieWorldStorage } from '../src/world/dexie-storage.ts';
import { DexieTradeApplicationStorage } from '../src/world/trade-dexie-storage.ts';
import { TradeGameSession } from '../src/world/trade-game-session.ts';
import {
  gameFixture,
  beginCommand,
  advanceCommand,
  applied,
} from './helpers/trade-game-fixture.ts';
import { collectUnusedInTransaction } from '../src/world/storage-gc.ts';

async function withStore(
  run: (
    context: ReturnType<typeof gameFixture> & {
      db: WorldDatabase;
      storage: DexieTradeApplicationStorage;
    },
  ) => Promise<void>,
) {
  const f = gameFixture(),
    db = new WorldDatabase('trade-game-' + crypto.randomUUID());
  const storage = new DexieTradeApplicationStorage(db, f.initial.localWorldId);
  try {
    await storage.create(f.initial);
    await run({ ...f, db, storage });
  } finally {
    await db.delete();
  }
}

async function rows(db: WorldDatabase) {
  return Promise.all(db.tables.map((t) => t.toArray()));
}

test('試合進行はDBへ書かず、手動枠だけを保存し現在選択から再開できる', async () => {
  await withStore(async ({ db, storage, initial }) => {
    const session = await TradeGameSession.open(storage),
      before = await rows(db);
    const begin = beginCommand(initial);
    session.execute(begin);
    const command = advanceCommand(session.read().snapshot);
    session.execute(command);
    assert.deepEqual(await rows(db), before);
    await session.saveManual();
    assert.deepEqual(await storage.load('auto'), initial);
    assert.equal(await db.save_slots.get([initial.localWorldId, 'previousAuto', 1]), undefined);
    const manual = await storage.load('manual');
    assert.deepEqual(await storage.read(), manual);
    assert.equal(manual.state.games[begin.gameId]!.state.totalPitches, 1);
    assert.equal(manual.storageRevision, initial.storageRevision + 1);
    const slot = await db.save_slots.get([initial.localWorldId, 'manual', 1]);
    const snapshot = await db.save_snapshots.get(slot!.snapshotId);
    assert.equal(snapshot!.saveKind, 'manual');
    assert.equal(snapshot!.versions.saveFormatVersion, 'trade-application-snapshot-v2');
    db.close();
    const reopened = new WorldDatabase(db.name);
    try {
      const resumed = await TradeGameSession.open(
        new DexieTradeApplicationStorage(reopened, initial.localWorldId),
      );
      assert.equal(resumed.execute(command).status, 'replayed');
      resumed.execute(advanceCommand(resumed.read().snapshot, 'next-after-reopen'));
      const expected = applied(manual, advanceCommand(manual, 'next-after-reopen'));
      assert.deepEqual(
        resumed.read().snapshot.state.games[begin.gameId],
        expected.state.games[begin.gameId],
      );
    } finally {
      reopened.close();
    }
  });
});

test('手動保存途中の失敗は4ストアとも取り消し、旧autoと選択参照を保持する', async () => {
  await withStore(async ({ db, storage, initial }) => {
    const session = await TradeGameSession.open(storage),
      command = beginCommand(initial);
    session.execute(command);
    const before = await rows(db);
    const fail = () => {
      throw new Error('snapshot-write-failure');
    };
    db.save_snapshots.hook('creating', fail);
    try {
      await assert.rejects(session.saveManual(), /snapshot-write-failure/);
    } finally {
      db.save_snapshots.hook('creating').unsubscribe(fail);
    }
    assert.deepEqual(await rows(db), before);
    assert.equal(session.read().reloadRequired, true);
    assert.deepEqual(await storage.read(), initial);
    await session.reload();
    session.execute(command);
    await session.saveManual();
    assert.equal((await storage.read()).state.games[command.gameId]!.events.length, 0);
  });
});

test('二つの作業状態からの手動保存は片方だけ確定し、競合側は再読込が必要', async () => {
  await withStore(async ({ db, storage, initial }) => {
    const other = new DexieTradeApplicationStorage(db, initial.localWorldId);
    const a = await TradeGameSession.open(storage),
      b = await TradeGameSession.open(other);
    a.execute(beginCommand(initial, 'from-tab-a'));
    b.execute(beginCommand(initial, 'from-tab-b'));
    const results = await Promise.allSettled([a.saveManual(), b.saveManual()]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
    const current = await storage.read();
    assert.equal(current.storageRevision, initial.storageRevision + 1);
    assert.equal(current.gameReceipts!.length, 1);
    const rejected = results[0]!.status === 'rejected' ? a : b;
    assert.equal(rejected.read().reloadRequired, true);
    await rejected.reload();
    assert.deepEqual(rejected.read().snapshot, current);
  });
});

test('選択中の手動保存が破損しても古いautoへ自動で切り替えない', async () => {
  await withStore(async ({ db, storage, initial }) => {
    const session = await TradeGameSession.open(storage);
    session.execute(beginCommand(initial));
    await session.saveManual();
    const slot = await db.save_slots.get([initial.localWorldId, 'manual', 1]);
    const manifest = await db.save_snapshots.get(slot!.snapshotId);
    const ref = manifest!.blockRefs.find((r) => r.logicalKey === 'context')!;
    const block = await db.save_blocks.get(ref.blockId);
    block!.payloadBytes = new Uint8Array([0, 1, 2]);
    await db.save_blocks.put(block!);
    await assert.rejects(storage.read());
    assert.deepEqual(await storage.load('auto'), initial);
    const local = await db.local_worlds.get(initial.localWorldId);
    assert.equal(local!.selectedSnapshotId, slot!.snapshotId);
  });
});

test('共通GCはautoと手動候補を保護し、旧世界の保存先から上書きできない', async () => {
  await withStore(async ({ db, storage, initial, source }) => {
    const session = await TradeGameSession.open(storage);
    session.execute(beginCommand(initial));
    await session.saveManual();
    const manual = await storage.read();
    await db.transaction(
      'rw',
      db.local_worlds,
      db.save_slots,
      db.save_snapshots,
      db.save_blocks,
      async () => collectUnusedInTransaction(db),
    );
    assert.deepEqual(await storage.read(), manual);
    assert.deepEqual(await storage.load('auto'), initial);
    await assert.rejects(
      new DexieWorldStorage(db, initial.localWorldId).save(
        source,
        initial.stateRevision + 2,
        'action',
        initial.storageRevision + 1,
      ),
      /上書き/,
    );
    assert.deepEqual(await storage.read(), manual);
  });
});
