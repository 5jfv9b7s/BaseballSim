import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { WorldDatabase, DexieWorldStorage } from '../src/world/dexie-storage.ts';
import { DexieTradeApplicationStorage } from '../src/world/trade-dexie-storage.ts';
import { TradeGameSession } from '../src/world/trade-game-session.ts';
import { TradeWorkerWorkspace } from '../src/world/trade-worker-workspace.ts';
import { listTradeCandidates } from '../src/world/trade-candidate-index.ts';
import { gameFixture, beginCommand, advanceCommand } from './helpers/trade-game-fixture.ts';
import { request } from './helpers/trade-worker-fixture.ts';

function workspace(db: WorldDatabase) {
  return new TradeWorkerWorkspace({
    open: (id) => TradeGameSession.open(new DexieTradeApplicationStorage(db, id)),
    list: () => listTradeCandidates(db),
  });
}
async function rows(db: WorldDatabase) {
  return Promise.all(db.tables.map((t) => t.toArray()));
}
async function withStore(
  run: (
    f: ReturnType<typeof gameFixture> & {
      db: WorldDatabase;
      storage: DexieTradeApplicationStorage;
      worker: TradeWorkerWorkspace;
    },
  ) => Promise<void>,
) {
  const f = gameFixture(),
    db = new WorldDatabase('candidate-worker-' + crypto.randomUUID()),
    storage = new DexieTradeApplicationStorage(db, f.initial.localWorldId);
  try {
    await storage.create(f.initial);
    await run({ ...f, db, storage, worker: workspace(db) });
  } finally {
    await db.delete();
  }
}

test('候補一覧は専用profileだけを読み、通常のプレイ一覧には候補を出さない', async () => {
  await withStore(async ({ db, source, initial, worker }) => {
    const normal = new DexieWorldStorage(db, 'test-normal-world');
    await normal.createPlay(source, 1, 'test-normal-creation');
    const before = await rows(db);
    const listed = await worker.handle(request(null, { kind: 'listCandidates' }));
    assert.equal(listed.ok, true);
    assert.equal(listed.candidates!.length, 1);
    assert.equal(listed.candidates![0]!.localWorldId, initial.localWorldId);
    assert.equal(listed.candidates![0]!.status, 'indexed');
    assert.ok(!(await normal.listPlays()).some((p) => p.localWorldId === initial.localWorldId));
    assert.deepEqual(await rows(db), before);
    assert.equal(listed.active, null);
  });
});

test('一覧の参照確認と全ブロック復元を区別し、破損した候補を自動で別枠へ戻さない', async () => {
  await withStore(async ({ db, initial, worker }) => {
    const local = (await db.local_worlds.get(initial.localWorldId))!;
    await db.local_worlds.put({ ...local, selectedSnapshotId: 'missing-selected' });
    const unavailable = await listTradeCandidates(db);
    assert.equal(unavailable[0]!.status, 'unavailable');
    assert.equal(unavailable[0]!.gameDate, null);
    await db.local_worlds.put(local);
    const manifest = (await db.save_snapshots.get(local.selectedSnapshotId))!,
      ref = manifest.blockRefs.find((b) => b.logicalKey === 'context')!;
    const block = (await db.save_blocks.get(ref.blockId))!;
    await db.save_blocks.put({ ...block, payloadBytes: new Uint8Array([0, 1, 2]) });
    assert.equal((await listTradeCandidates(db))[0]!.status, 'indexed');
    const before = await rows(db),
      opened = await worker.handle(
        request(null, { kind: 'openCandidate', localWorldId: initial.localWorldId }),
      );
    assert.equal(opened.ok, false);
    assert.equal(opened.active, null);
    assert.equal(opened.workspaceRevision, 0);
    assert.deepEqual(await rows(db), before);
    assert.equal(
      (await db.local_worlds.get(initial.localWorldId))!.selectedSnapshotId,
      local.selectedSnapshotId,
    );
  });
});

test('Workerの内部承認済み移籍を4ストアへ保存し、再起動後の再送で二重適用しない', async () => {
  await withStore(async ({ db, initial, command, worker, storage }) => {
    const opened = await worker.handle(
      request(null, { kind: 'openCandidate', localWorldId: initial.localWorldId }),
    );
    const result = await worker.handle(request(opened, { kind: 'candidateCommand', command }));
    assert.equal(result.ok, true);
    assert.equal(result.result!.status, 'committed');
    const saved = await storage.read();
    assert.equal(saved.tradeReceipts.length, 1);
    assert.equal(saved.state.transactions.length, 1);
    assert.deepEqual(await storage.load('previousAuto'), initial);
    db.close();
    const reopened = new WorldDatabase(db.name);
    try {
      const next = workspace(reopened),
        active = await next.handle(
          request(null, { kind: 'openCandidate', localWorldId: initial.localWorldId }),
        );
      assert.equal(active.ok, true);
      assert.equal(active.active!.stateRevision, saved.stateRevision);
      const replay = await next.handle(request(active, { kind: 'candidateCommand', command }));
      assert.equal(replay.result!.status, 'replayed');
      assert.deepEqual(
        await new DexieTradeApplicationStorage(reopened, initial.localWorldId).read(),
        saved,
      );
    } finally {
      reopened.close();
    }
  });
});

test('移籍の書込失敗は4ストアを取り消し、旧表示と停止状態を返す', async () => {
  await withStore(async ({ db, initial, command, worker }) => {
    const opened = await worker.handle(
        request(null, { kind: 'openCandidate', localWorldId: initial.localWorldId }),
      ),
      before = await rows(db);
    const fail = () => {
      throw new Error('worker-trade-abort');
    };
    db.save_snapshots.hook('creating', fail);
    let failed;
    try {
      failed = await worker.handle(request(opened, { kind: 'candidateCommand', command }));
    } finally {
      db.save_snapshots.hook('creating').unsubscribe(fail);
    }
    assert.equal(failed!.ok, false);
    assert.equal(failed!.active!.reloadRequired, true);
    assert.equal(failed!.active!.stateRevision, opened.active!.stateRevision);
    assert.deepEqual(failed!.view!.players, opened.view!.players);
    assert.deepEqual(await rows(db), before);
    const reload = await worker.handle(
      request(failed!, {
        kind: 'reloadCandidate',
        expectedStateRevision: failed!.active!.stateRevision,
      }),
    );
    assert.equal(reload.ok, true);
    assert.equal(
      (await worker.handle(request(reload, { kind: 'candidateCommand', command }))).result!.status,
      'committed',
    );
  });
});

test('二つのWorkerの同時移籍は一方だけ確定し、競合側は再読込後に永続receiptを返す', async () => {
  await withStore(async ({ db, initial, command, worker, storage }) => {
    const other = workspace(db);
    const a = await worker.handle(
      request(null, { kind: 'openCandidate', localWorldId: initial.localWorldId }),
    );
    const b = await other.handle(
      request(null, { kind: 'openCandidate', localWorldId: initial.localWorldId }),
    );
    const result = await Promise.all([
      worker.handle(request(a, { kind: 'candidateCommand', command })),
      other.handle(request(b, { kind: 'candidateCommand', command })),
    ]);
    assert.equal(result.filter((r) => r.ok).length, 1);
    assert.equal(result.filter((r) => !r.ok).length, 1);
    const index = result[0]!.ok ? 1 : 0,
      losing = index === 0 ? worker : other,
      failed = result[index]!;
    assert.equal(failed.active!.reloadRequired, true);
    const reloaded = await losing.handle(
      request(failed, {
        kind: 'reloadCandidate',
        expectedStateRevision: failed.active!.stateRevision,
      }),
    );
    assert.equal(reloaded.ok, true);
    assert.equal(
      (await losing.handle(request(reloaded, { kind: 'candidateCommand', command }))).result!
        .status,
      'replayed',
    );
    const saved = await storage.read();
    assert.equal(saved.state.transactions.length, 1);
    assert.equal(saved.storageRevision, initial.storageRevision + 1);
  });
});

test('Worker再開は選択中の手動保存を使い、古いautoや初期名簿へ戻さない', async () => {
  await withStore(async ({ db, initial, storage }) => {
    const session = await TradeGameSession.open(storage);
    session.execute(beginCommand(initial));
    session.execute(advanceCommand(session.read().snapshot));
    await session.saveManual();
    const saved = await storage.read();
    assert.deepEqual(await storage.load('auto'), initial);
    const worker = workspace(db),
      opened = await worker.handle(
        request(null, { kind: 'openCandidate', localWorldId: initial.localWorldId }),
      );
    assert.equal(opened.ok, true);
    assert.equal(opened.active!.stateRevision, saved.stateRevision);
    assert.equal(opened.view!.phase, 'playing');
    assert.equal(opened.view!.saveState.pendingCommands, 0);
    const listed = await listTradeCandidates(db);
    assert.equal(listed[0]!.stateRevision, saved.stateRevision);
  });
});
