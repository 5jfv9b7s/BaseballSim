import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { WorldDatabase } from '../src/world/dexie-storage.ts';
import { DexieTradeApplicationStorage } from '../src/world/trade-dexie-storage.ts';
import { TradeGameSession } from '../src/world/trade-game-session.ts';
import { collectUnusedInTransaction } from '../src/world/storage-gc.ts';
import { dayCommand, idleDayFixture, finishSessionDay } from './helpers/trade-day-fixture.ts';
import { gameFixture, memoryStorage } from './helpers/trade-game-fixture.ts';

async function storedRows(db: WorldDatabase) {
  return Promise.all(db.tables.map((t) => t.toArray()));
}

async function withStore(
  run: (
    c: ReturnType<typeof idleDayFixture> & {
      db: WorldDatabase;
      storage: DexieTradeApplicationStorage;
    },
  ) => Promise<void>,
) {
  const f = idleDayFixture(),
    db = new WorldDatabase('candidate-day-' + crypto.randomUUID());
  const storage = new DexieTradeApplicationStorage(db, f.initial.localWorldId);
  try {
    await storage.create(f.initial);
    await run({ ...f, db, storage });
  } finally {
    await db.delete();
  }
}

test('当日全試合後のautoは翌日を保存し、手動枠と前回autoを保持する', async () => {
  const f = gameFixture(),
    db = new WorldDatabase('candidate-played-day-' + crypto.randomUUID());
  const storage = new DexieTradeApplicationStorage(db, f.initial.localWorldId);
  try {
    await storage.create(f.initial);
    const session = await TradeGameSession.open(storage);
    await finishSessionDay(session);
    await session.saveManual();
    const manual = await storage.load('manual'),
      command = dayCommand(session.read().snapshot);
    const result = await session.completeDay(command);
    assert.equal(result.status, 'committed');
    const auto = await storage.load('auto');
    assert.equal(auto.currentDate, result.receipt.nextDate);
    assert.equal(auto.state.lastCompletedDate, command.expectedDate);
    assert.deepEqual(await storage.load('manual'), manual);
    assert.deepEqual(await storage.load('previousAuto'), f.initial);
    assert.deepEqual(await storage.read(), auto);
    const local = await db.local_worlds.get(f.initial.localWorldId);
    const manifest = await db.save_snapshots.get(local!.selectedSnapshotId);
    assert.equal(manifest!.saveKind, 'dailyAuto');
    assert.equal(manifest!.versions.saveFormatVersion, 'trade-application-snapshot-v3');
    assert.equal((await session.completeDay(command)).status, 'replayed');
    db.close();
    const reopened = new WorldDatabase(db.name);
    try {
      const resumed = await TradeGameSession.open(
        new DexieTradeApplicationStorage(reopened, f.initial.localWorldId),
      );
      assert.deepEqual(resumed.read().snapshot, auto);
      assert.equal((await resumed.completeDay(command)).status, 'replayed');
    } finally {
      reopened.close();
    }
  } finally {
    await db.delete();
  }
});

test('日次保存失敗は4ストアを取り消し、翌日を公開せず当日の作業を保持する', async () => {
  await withStore(async ({ db, storage, initial }) => {
    const session = await TradeGameSession.open(storage),
      command = dayCommand(initial);
    const before = session.read().snapshot,
      rows = await storedRows(db);
    const fail = () => {
      throw new Error('day-write-abort');
    };
    db.save_snapshots.hook('creating', fail);
    try {
      await assert.rejects(session.completeDay(command), /day-write-abort/);
    } finally {
      db.save_snapshots.hook('creating').unsubscribe(fail);
    }
    assert.deepEqual(await storedRows(db), rows);
    assert.deepEqual(session.read().snapshot, before);
    assert.equal(session.read().reloadRequired, true);
    await assert.rejects(session.completeDay(command), /成否不明/);
    await session.reload();
    await session.completeDay(command);
    assert.equal((await storage.read()).state.growth.state.lastCompletedOn, initial.currentDate);
  });
});

test('二つのタブ相当の日次確定は一方だけ保存し、二重成長・二重日付更新を防ぐ', async () => {
  await withStore(async ({ db, storage, initial }) => {
    const a = await TradeGameSession.open(storage);
    const b = await TradeGameSession.open(
      new DexieTradeApplicationStorage(db, initial.localWorldId),
    );
    const results = await Promise.allSettled([
      a.completeDay(dayCommand(initial, 'day-a')),
      b.completeDay(dayCommand(initial, 'day-b')),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
    const saved = await storage.read();
    assert.equal(saved.dayReceipts!.length, 1);
    assert.equal(saved.state.completedDates.length, initial.state.completedDates.length + 1);
    assert.equal(saved.storageRevision, initial.storageRevision + 1);
    const failed = results[0]!.status === 'rejected' ? a : b;
    assert.equal(failed.read().reloadRequired, true);
    await failed.reload();
    assert.deepEqual(failed.read().snapshot, saved);
  });
});

test('保存後の通信失敗でも当日表示を保ち、再読込後は永続日次receiptで再送を返す', async () => {
  const f = idleDayFixture(),
    memory = memoryStorage(f.initial);
  const session = await TradeGameSession.open({
    read: () => memory.storage.read(),
    async commit(e, c) {
      await memory.storage.commit(e, c);
      throw new Error('day-after-write');
    },
  });
  const command = dayCommand(f.initial);
  await assert.rejects(session.completeDay(command), /day-after-write/);
  assert.equal(session.read().snapshot.currentDate, f.initial.currentDate);
  assert.equal(session.read().reloadRequired, true);
  await session.reload();
  assert.equal((await session.completeDay(command)).status, 'replayed');
  assert.equal(memory.writes(), 1);
  assert.notEqual(session.read().snapshot.currentDate, f.initial.currentDate);
});

test('選択中autoが破損してもpreviousAutoを正本へ自動切替しない', async () => {
  await withStore(async ({ db, storage, initial }) => {
    const session = await TradeGameSession.open(storage);
    await session.completeDay(dayCommand(initial));
    const local = await db.local_worlds.get(initial.localWorldId);
    const manifest = await db.save_snapshots.get(local!.selectedSnapshotId);
    const ref = manifest!.blockRefs.find((r) => r.logicalKey === 'context')!;
    const block = await db.save_blocks.get(ref.blockId);
    block!.payloadBytes = new Uint8Array([0, 1, 2]);
    await db.save_blocks.put(block!);
    await assert.rejects(storage.read());
    assert.deepEqual(await storage.load('previousAuto'), initial);
    assert.equal(
      (await db.local_worlds.get(initial.localWorldId))!.selectedSnapshotId,
      local!.selectedSnapshotId,
    );
  });
});

test('回収は候補v3のautoと候補v1のpreviousAutoを両方保護する', async () => {
  await withStore(async ({ db, storage, initial }) => {
    const session = await TradeGameSession.open(storage);
    await session.completeDay(dayCommand(initial));
    const saved = await storage.read();
    await db.transaction(
      'rw',
      db.local_worlds,
      db.save_slots,
      db.save_snapshots,
      db.save_blocks,
      () => collectUnusedInTransaction(db),
    );
    assert.deepEqual(await storage.read(), saved);
    assert.deepEqual(await storage.load('previousAuto'), initial);
  });
});
