import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { DexieTradeApplicationStorage } from '../src/world/trade-dexie-storage.ts';
import {
  WorldDatabase,
  DexieWorldStorage,
  DEFAULT_LOCAL_WORLD,
} from '../src/world/dexie-storage.ts';
import { createTradeApplicationPort } from '../src/world/trade-application-port.ts';
import { commitAcceptedTrade } from '../src/recruitment/trade-commit.ts';
import { inspectWorldStorage } from '../src/world/storage-inspection.ts';
import { collectUnusedInTransaction } from '../src/world/storage-gc.ts';
import { tradeSaveFixture, committedTradeSaveFixture } from './helpers/trade-save-fixture.ts';

async function storedRows(db: WorldDatabase) {
  return Promise.all(db.tables.map((table) => table.toArray()));
}

async function withStore(
  run: (
    context: ReturnType<typeof tradeSaveFixture> & {
      db: WorldDatabase;
      storage: DexieTradeApplicationStorage;
    },
  ) => Promise<void>,
) {
  const f = tradeSaveFixture(),
    db = new WorldDatabase('trade-save-' + crypto.randomUUID());
  const storage = new DexieTradeApplicationStorage(db, f.initial.localWorldId);
  try {
    await storage.create(f.initial);
    await run({ ...f, db, storage });
  } finally {
    await db.delete();
  }
}

test('4ストアの候補保存を、接続し直して個人状態・資金・初期資料まで復元する', async () => {
  await withStore(async ({ db, initial }) => {
    assert.deepEqual(db.tables.map((t) => t.name).sort(), [
      'local_worlds',
      'save_blocks',
      'save_slots',
      'save_snapshots',
    ]);
    db.close();
    const reopened = new WorldDatabase(db.name);
    try {
      assert.deepEqual(
        await new DexieTradeApplicationStorage(reopened, initial.localWorldId).read(),
        initial,
      );
    } finally {
      reopened.close();
    }
  });
});

test('実際の確定portから候補とreceiptを一括保存し、再起動後の再送は既存結果を返す', async () => {
  await withStore(async ({ db, initial, command, storage }) => {
    const result = await commitAcceptedTrade(command, createTradeApplicationPort(storage));
    assert.equal(result.status, 'committed');
    if (result.status !== 'committed') return;
    assert.deepEqual(await storage.read(), result.snapshot);
    assert.deepEqual(await storage.load('previousAuto'), initial);
    const before = await storedRows(db);
    const reopenedStorage = new DexieTradeApplicationStorage(db, initial.localWorldId);
    assert.equal(
      (await commitAcceptedTrade(command, createTradeApplicationPort(reopenedStorage))).status,
      'replayed',
    );
    assert.deepEqual(await storedRows(db), before);
  });
});

test('snapshot格納途中の失敗は、ブロック・枠・管理世代・台帳と承認を全て戻す', async () => {
  await withStore(async ({ db, command, storage, initial }) => {
    const before = await storedRows(db);
    const fail = () => {
      throw new Error('test disk full');
    };
    db.save_snapshots.hook('creating', fail);
    try {
      await assert.rejects(
        commitAcceptedTrade(command, createTradeApplicationPort(storage)),
        /disk full/,
      );
    } finally {
      db.save_snapshots.hook('creating').unsubscribe(fail);
    }
    assert.deepEqual(await storedRows(db), before);
    assert.deepEqual(await storage.read(), initial);
    assert.equal(
      (await commitAcceptedTrade(command, createTradeApplicationPort(storage))).status,
      'committed',
    );
  });
});

test('既存候補への初回保存と、通常起動の既定IDの使用を拒否する', async () => {
  await withStore(async ({ db, storage, initial }) => {
    const before = await storedRows(db);
    await assert.rejects(storage.create(initial), /上書きできません/);
    assert.throws(() => new DexieTradeApplicationStorage(db, DEFAULT_LOCAL_WORLD), /既定保存ID/);
    assert.deepEqual(await storedRows(db), before);
  });
});

test('同じ状態からの2タブ相当の確定は一方だけ保存し、他方の再送は二重適用しない', async () => {
  await withStore(async ({ db, storage, initial, command }) => {
    let arrivals = 0,
      release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ports = [storage, new DexieTradeApplicationStorage(db, initial.localWorldId)].map(
      (s) => ({
        ...createTradeApplicationPort(s),
        async read() {
          const saved = await s.read();
          arrivals += 1;
          if (arrivals === 2) release();
          await gate;
          return saved;
        },
      }),
    );
    const results = await Promise.allSettled(ports.map((p) => commitAcceptedTrade(command, p)));
    assert.equal(
      results.filter((r) => r.status === 'fulfilled' && r.value.status === 'committed').length,
      1,
    );
    assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
    assert.equal((await storage.read()).tradeReceipts.length, 1);
    assert.equal(await db.save_snapshots.count(), 2);
    assert.equal(
      (await commitAcceptedTrade(command, createTradeApplicationPort(storage))).status,
      'replayed',
    );
  });
});

test('現行ブロック破損では停止し、前回枠を自動で正本へ付け替えない', async () => {
  await withStore(async ({ db, storage, command, initial }) => {
    await commitAcceptedTrade(command, createTradeApplicationPort(storage));
    const local = (await db.local_worlds.get(initial.localWorldId))!;
    const snapshot = (await db.save_snapshots.get(local.selectedSnapshotId))!;
    const context = snapshot.blockRefs.find((r) => r.logicalKey === 'context')!;
    const block = (await db.save_blocks.get(context.blockId))!;
    const corrupt = structuredClone(block);
    corrupt.payloadBytes[0] = corrupt.payloadBytes[0]! ^ 255;
    await db.save_blocks.put(corrupt);
    const before = await storedRows(db);
    await assert.rejects(storage.read());
    assert.deepEqual(await storage.load('previousAuto'), initial);
    assert.deepEqual(await storedRows(db), before);
  });
});

test('未知モデル・不足データを初回保存する場合は4ストアへ何も書かない', async () => {
  const f = tradeSaveFixture(),
    db = new WorldDatabase('trade-invalid-' + crypto.randomUUID());
  try {
    const storage = new DexieTradeApplicationStorage(db, f.initial.localWorldId);
    Reflect.set(f.initial.state.camp, 'version', 'unknown');
    await assert.rejects(storage.create(f.initial), /モデル版/);
    assert.deepEqual(await Promise.all(db.tables.map((t) => t.count())), [0, 0, 0, 0]);
  } finally {
    await db.delete();
  }
});

test('低水準commitでも古い状態版・保存版・指示と異なる個人状態を拒否する', async () => {
  const f = await committedTradeSaveFixture(),
    db = new WorldDatabase('trade-direct-' + crypto.randomUUID());
  const storage = new DexieTradeApplicationStorage(db, f.initial.localWorldId);
  try {
    await storage.create(f.initial);
    const expected = {
      localWorldId: f.initial.localWorldId,
      worldId: f.initial.worldId,
      stateRevision: f.initial.stateRevision,
      storageRevision: f.initial.storageRevision,
    };
    const before = await storedRows(db);
    await assert.rejects(storage.commit({ ...expected, stateRevision: 1 }, f.candidate));
    await assert.rejects(storage.commit({ ...expected, storageRevision: 0 }, f.candidate));
    const bad = structuredClone(f.candidate);
    bad.state.physical.players[f.request.moves[0]!.playerId]!.energyMilli -= 1;
    await assert.rejects(storage.commit(expected, bad), /再計算と一致しません/);
    assert.deepEqual(await storedRows(db), before);
  } finally {
    await db.delete();
  }
});

test('通常保存と共存し、一覧から候補を除外して旧保存処理からの上書きを止める', async () => {
  await withStore(async ({ db, source, storage, initial }) => {
    const legacy = new DexieWorldStorage(db, 'test-legacy');
    await legacy.save(source, 2, 'action', 0);
    assert.deepEqual(
      (await legacy.listPlays()).map((p) => p.localWorldId),
      ['test-legacy'],
    );
    const before = await storedRows(db);
    await assert.rejects(
      new DexieWorldStorage(db, initial.localWorldId).save(source, 3, 'action', 1),
      /通常の世界保存では上書き/,
    );
    const other = structuredClone(initial);
    other.localWorldId = 'test-legacy';
    await assert.rejects(
      new DexieTradeApplicationStorage(db, 'test-legacy').create(other),
      /上書きできません/,
    );
    assert.deepEqual(await storedRows(db), before);
    assert.deepEqual((await legacy.load('auto')).world, source);
    assert.deepEqual(await storage.read(), initial);
  });
});

test('通常の容量診断・回収は候補のautoとpreviousAutoが参照する全ブロックを保護する', async () => {
  await withStore(async ({ db, command, storage }) => {
    await commitAcceptedTrade(command, createTradeApplicationPort(storage));
    const before = await storedRows(db),
      report = await inspectWorldStorage(db);
    assert.deepEqual(report.issues, []);
    assert.equal(report.protectedSnapshots, 2);
    await db.transaction(
      'rw',
      db.local_worlds,
      db.save_slots,
      db.save_snapshots,
      db.save_blocks,
      () => collectUnusedInTransaction(db),
    );
    assert.deepEqual(await storedRows(db), before);
    assert.equal((await storage.read()).state.transactions.length, 1);
  });
});

test('初回の書込失敗は未完成のローカル候補や孤立ブロックを残さず、再試行できる', async () => {
  const f = tradeSaveFixture(),
    db = new WorldDatabase('trade-initial-abort-' + crypto.randomUUID());
  const storage = new DexieTradeApplicationStorage(db, f.initial.localWorldId);
  const fail = () => {
    throw new Error('test initial abort');
  };
  try {
    db.local_worlds.hook('creating', fail);
    await assert.rejects(storage.create(f.initial), /initial abort/);
    db.local_worlds.hook('creating').unsubscribe(fail);
    assert.deepEqual(await Promise.all(db.tables.map((t) => t.count())), [0, 0, 0, 0]);
    await storage.create(f.initial);
    const before = await storedRows(db);
    assert.deepEqual(await storage.read(), f.initial);
    assert.deepEqual(await storedRows(db), before);
  } finally {
    db.local_worlds.hook('creating').unsubscribe(fail);
    await db.delete();
  }
});
