import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { WorldDatabase, DexieWorldStorage } from '../src/world/dexie-storage.ts';
import { tradeCreationStorage } from '../src/world/trade-creation-storage.ts';
import { DexieTradeApplicationStorage } from '../src/world/trade-dexie-storage.ts';
import { inspectTradeCreationInput } from '../src/world/trade-creation-input.ts';
import { TradeGameSession } from '../src/world/trade-game-session.ts';
import { beginCommand } from './helpers/trade-game-fixture.ts';
import { creationFixture } from './helpers/trade-creation-fixture.ts';

async function withSource(
  run: (
    f: ReturnType<typeof creationFixture> & {
      db: WorldDatabase;
      normal: DexieWorldStorage;
      access: ReturnType<typeof tradeCreationStorage>;
    },
  ) => Promise<void>,
) {
  const f = creationFixture(),
    db = new WorldDatabase('trade-create-test-' + crypto.randomUUID());
  const normal = new DexieWorldStorage(db, f.ref.localWorldId);
  try {
    const slots = await normal.save(f.source, 0, 'auto', 0);
    f.ref.snapshotId = slots.auto!.snapshotId;
    f.ref.storageRevision = slots.storageRevision;
    f.data.source = { ...f.data.source, ...f.ref };
    await run({ ...f, db, normal, access: tradeCreationStorage(db) });
  } finally {
    db.close();
    await db.delete();
  }
}
const rows = (db: WorldDatabase) => Promise.all(db.tables.map((table) => table.toArray()));
async function prepared(f: ReturnType<typeof creationFixture>) {
  const result = await inspectTradeCreationInput(f.source, f.ref, f.text(), f.creationId);
  assert.equal(result.status, 'ready');
  if (result.status !== 'ready') throw new Error('fixture');
  return {
    saved: result.saved,
    options: { source: f.ref, fingerprint: result.fingerprint, displayName: '試験用の独立候補' },
  };
}

test('元保存の一覧・復元は読取で、候補の初回保存は元のプレイと枠を保持する', async () => {
  await withSource(async (f) => {
    const before = await rows(f.db),
      sourceLocal = await f.db.local_worlds.get(f.ref.localWorldId),
      sourceSlots = await f.db.save_slots
        .where('localWorldId')
        .equals(f.ref.localWorldId)
        .toArray();
    const listed = await f.access.listSources();
    assert.equal(listed.length, 1);
    assert.equal(listed[0]!.supported, true);
    assert.deepEqual(await f.access.loadSource(f.ref), f.source);
    assert.deepEqual(await rows(f.db), before);
    const p = await prepared(f);
    assert.equal(await f.access.create(p.saved, p.options), 'created');
    assert.deepEqual(await f.db.local_worlds.get(f.ref.localWorldId), sourceLocal);
    assert.deepEqual(
      await f.db.save_slots.where('localWorldId').equals(f.ref.localWorldId).toArray(),
      sourceSlots,
    );
    assert.deepEqual(
      await new DexieTradeApplicationStorage(f.db, p.saved.localWorldId).read(),
      p.saved,
    );
    assert.equal((await f.access.listSources()).length, 1);
  });
});

test('検査後に元プレイが更新されたら初回保存を全体拒否する', async () => {
  await withSource(async (f) => {
    const p = await prepared(f);
    await f.normal.save(f.source, 1, 'manual', f.ref.storageRevision);
    const before = await rows(f.db);
    await assert.rejects(f.access.create(p.saved, p.options), /元保存が更新/);
    assert.deepEqual(await rows(f.db), before);
    await assert.rejects(f.access.loadSource(f.ref), /保存版が更新/);
  });
});

test('初回保存の途中例外は4ストアを巻き戻し、元プレイを保持する', async () => {
  await withSource(async (f) => {
    const p = await prepared(f),
      before = await rows(f.db);
    const abort = (_key: unknown, row: { localWorldId: string }) => {
      if (row.localWorldId === p.saved.localWorldId) throw new Error('creation abort');
    };
    f.db.save_slots.hook('creating', abort);
    try {
      await assert.rejects(f.access.create(p.saved, p.options), /creation abort/);
    } finally {
      f.db.save_slots.hook('creating').unsubscribe(abort);
    }
    assert.deepEqual(await rows(f.db), before);
  });
});

test('同じ作成IDの再送は進行済み候補を巻き戻さず、元保存の後続更新とも区別する', async () => {
  await withSource(async (f) => {
    const p = await prepared(f);
    await f.access.create(p.saved, p.options);
    const session = await TradeGameSession.open(
      new DexieTradeApplicationStorage(f.db, p.saved.localWorldId),
    );
    session.execute(beginCommand(p.saved));
    await session.saveManual();
    await f.normal.save(f.source, 1, 'manual', f.ref.storageRevision);
    const before = await rows(f.db);
    assert.equal(await f.access.create(p.saved, p.options), 'replayed');
    assert.deepEqual(await rows(f.db), before);
  });
});

test('同一作成IDの異なる入力と通常プレイへの衝突を上書きしない', async () => {
  await withSource(async (f) => {
    const p = await prepared(f);
    await f.access.create(p.saved, p.options);
    const before = await rows(f.db);
    await assert.rejects(
      f.access.create(p.saved, { ...p.options, fingerprint: 'f'.repeat(64) }),
      /同じ作成ID/,
    );
    assert.deepEqual(await rows(f.db), before);
    const collision = { ...p.saved, localWorldId: f.ref.localWorldId };
    await assert.rejects(
      f.access.create(collision, {
        ...p.options,
        source: { ...f.ref, localWorldId: 'other-source' },
      }),
      /衝突/,
    );
    assert.deepEqual(await rows(f.db), before);
  });
});

test('元保存のブロック破損は復元を拒否し、候補を自動作成しない', async () => {
  await withSource(async (f) => {
    const snapshot = await f.db.save_snapshots.get(f.ref.snapshotId),
      id = snapshot!.blockRefs[0]!.blockId;
    const block = await f.db.save_blocks.get(id);
    await f.db.save_blocks.put({ ...block!, payloadBytes: new Uint8Array([0]) });
    const before = await rows(f.db);
    await assert.rejects(f.access.loadSource(f.ref));
    assert.deepEqual(await rows(f.db), before);
  });
});
