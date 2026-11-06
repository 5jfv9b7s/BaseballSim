import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { WorldDatabase } from '../src/world/dexie-storage.ts';
import { DexieTradeApplicationStorage } from '../src/world/trade-dexie-storage.ts';
import { TradeGameSession } from '../src/world/trade-game-session.ts';
import { collectUnusedInTransaction } from '../src/world/storage-gc.ts';
import { applyTradeRosterCommand } from '../src/world/trade-roster-commands.ts';
import { idleDayFixture } from './helpers/trade-day-fixture.ts';
import { memoryStorage } from './helpers/trade-game-fixture.ts';
import {
  policyCommand,
  registrationCommand,
  rosterDayCommand,
} from './helpers/trade-registration-fixture.ts';

async function withStore(
  run: (
    f: ReturnType<typeof idleDayFixture> & {
      db: WorldDatabase;
      storage: DexieTradeApplicationStorage;
    },
  ) => Promise<void>,
) {
  const f = idleDayFixture(),
    db = new WorldDatabase('candidate-registration-' + crypto.randomUUID());
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

test('登録のactionAutoは履歴と4ストアを確定し、再開・再送でも二重登録しない', async () => {
  await withStore(async ({ db, storage, initial }) => {
    const session = await TradeGameSession.open(storage),
      command = registrationCommand(initial);
    assert.equal((await session.changeRoster(command)).status, 'committed');
    const saved = await storage.read();
    assert.deepEqual(session.read().snapshot, saved);
    assert.deepEqual(await storage.load('previousAuto'), initial);
    assert.equal(saved.storageRevision, initial.storageRevision + 1);
    const local = await db.local_worlds.get(initial.localWorldId),
      manifest = await db.save_snapshots.get(local!.selectedSnapshotId);
    assert.equal(manifest!.saveKind, 'actionAuto');
    assert.equal(manifest!.versions.saveFormatVersion, 'trade-application-snapshot-v4');
    const before = await rows(db);
    const resumed = await TradeGameSession.open(
      new DexieTradeApplicationStorage(db, initial.localWorldId),
    );
    assert.equal((await resumed.changeRoster(command)).status, 'replayed');
    assert.deepEqual(await rows(db), before);
    assert.equal(resumed.read().snapshot.rosterReceipts!.length, 1);
  });
});

test('固定希望の書込失敗は全表を取り消し、希望・登録を公開せず後続を止める', async () => {
  await withStore(async ({ db, storage, initial }) => {
    const session = await TradeGameSession.open(storage),
      registration = registrationCommand(initial);
    const command = policyCommand(initial, { [registration.changes[0]!.playerId]: 'farmFixed' });
    const before = await rows(db);
    const fail = () => {
      throw new Error('roster-abort');
    };
    db.save_snapshots.hook('creating', fail);
    try {
      await assert.rejects(session.changeRoster(command), /roster-abort/);
    } finally {
      db.save_snapshots.hook('creating').unsubscribe(fail);
    }
    assert.deepEqual(await rows(db), before);
    assert.deepEqual(session.read().snapshot, initial);
    assert.equal(session.read().reloadRequired, true);
    await assert.rejects(session.changeRoster(command), /成否不明/);
    await session.reload();
    assert.equal((await session.changeRoster(command)).status, 'committed');
    assert.equal((await storage.read()).rosterReceipts![0]!.reconciliation!.status, 'applied');
  });
});

test('二タブの同じ登録変更は一方だけ成立し、競合側は再読込まで停止する', async () => {
  await withStore(async ({ db, storage, initial }) => {
    const a = await TradeGameSession.open(storage),
      b = await TradeGameSession.open(new DexieTradeApplicationStorage(db, initial.localWorldId));
    const result = await Promise.allSettled([
      a.changeRoster(registrationCommand(initial, 'roster-a')),
      b.changeRoster(registrationCommand(initial, 'roster-b')),
    ]);
    assert.equal(result.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(result.filter((r) => r.status === 'rejected').length, 1);
    const saved = await storage.read();
    assert.equal(saved.rosterReceipts!.length, 1);
    const loser = result[0]!.status === 'rejected' ? a : b;
    assert.equal(loser.read().reloadRequired, true);
    await loser.reload();
    assert.deepEqual(loser.read().snapshot, saved);
  });
});

test('保存後の通信失敗は元の表示を保ち、明示再読込後の再送は保存し直さない', async () => {
  const { initial } = idleDayFixture(),
    memory = memoryStorage(initial);
  const session = await TradeGameSession.open({
    read: () => memory.storage.read(),
    async commit(e, c) {
      await memory.storage.commit(e, c);
      throw new Error('roster-after-write');
    },
  });
  const command = registrationCommand(initial);
  await assert.rejects(session.changeRoster(command), /roster-after-write/);
  assert.deepEqual(session.read().snapshot, initial);
  assert.equal(session.read().reloadRequired, true);
  await session.reload();
  assert.equal((await session.changeRoster(command)).status, 'replayed');
  assert.equal(memory.writes(), 1);
});

test('新日次は再登録可能日の固定希望を日次成長・翌日autoと同時に確定する', async () => {
  const f = idleDayFixture();
  // 試験の二日目で再登録できるようにする明示値。製品の規則は変更しない。
  f.initial.state.initialDefinitions.registrationRules!.reentryDays = 1;
  const db = new WorldDatabase('candidate-registration-day-' + crypto.randomUUID()),
    storage = new DexieTradeApplicationStorage(db, f.initial.localWorldId);
  try {
    await storage.create(f.initial);
    const session = await TradeGameSession.open(storage),
      registration = registrationCommand(f.initial),
      id = registration.changes[0]!.playerId;
    await session.changeRoster(registration);
    const policy = policyCommand(session.read().snapshot, { [id]: 'firstFixed' });
    await session.changeRoster(policy);
    const before = session.read().snapshot;
    assert.equal(before.rosterReceipts!.at(-1)!.reconciliation!.status, 'pending');
    const command = rosterDayCommand(before);
    assert.equal((await session.completeDay(command)).status, 'committed');
    const saved = await storage.read();
    assert.equal(
      saved.state.registration.registrations.find((r) => r.playerId === id && r.until === null)!
        .category,
      'first',
    );
    assert.deepEqual(await storage.load('previousAuto'), before);
    assert.equal(saved.state.growth.state.lastCompletedOn, before.currentDate);
    const local = await db.local_worlds.get(f.initial.localWorldId),
      manifest = await db.save_snapshots.get(local!.selectedSnapshotId);
    assert.equal(manifest!.saveKind, 'dailyAuto');
    assert.equal(manifest!.versions.saveFormatVersion, 'trade-application-snapshot-v4');
    const resumed = await TradeGameSession.open(storage);
    assert.deepEqual(resumed.read().snapshot, saved);
    assert.equal((await resumed.completeDay(command)).status, 'replayed');
  } finally {
    await db.delete();
  }
});

test('正しいreceiptに無関係な個人状態を混ぜた保存候補は書き込まない', async () => {
  await withStore(async ({ db, storage, initial }) => {
    const command = registrationCommand(initial),
      result = applyTradeRosterCommand(initial, command);
    assert.equal(result.status, 'applied');
    if (result.status !== 'applied') return;
    const candidate = result.snapshot;
    candidate.storageRevision++;
    candidate.state.physical.players[command.changes[0]!.playerId]!.energyMilli = 1;
    const before = await rows(db);
    await assert.rejects(storage.commit(initial, candidate), /再計算/);
    assert.deepEqual(await rows(db), before);
  });
});

test('回収処理は候補v4の正本と旧v1のpreviousAutoを保護する', async () => {
  await withStore(async ({ db, storage, initial }) => {
    const session = await TradeGameSession.open(storage);
    await session.changeRoster(registrationCommand(initial));
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
