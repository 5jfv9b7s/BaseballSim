import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameController, type GameCommand } from '../src/game/controller.ts';
import { createGame, runToCompletion } from '../src/game/engine.ts';
import { finalizeGame } from '../src/game/results.ts';
import { DexieStorageAdapter, GameDatabase } from '../src/storage/dexie-adapter.ts';

function completed(seed: number) {
  const record = createGame(seed);
  runToCompletion(record);
  finalizeGame(record);
  return record;
}

/** 実際のControllerとStorageAdapterを通す。試験ごとのDBだけを使用する。 */
function session(controller: GameController) {
  let serial = 0;
  return async (
    action:
      | { kind: 'new'; seed: number }
      | { kind: 'advance'; count: number }
      | { kind: 'save' }
      | { kind: 'load'; previous: boolean },
  ) => {
    const command: GameCommand = {
      ...action,
      commandId: `acceptance-${++serial}`,
      expectedStateRevision: controller.query().revision,
    };
    return controller.dispatch(command);
  };
}

test('MVP-01〜06: 逐次・一括・混在進行で全記録が一致し、連続試合と再接続を通せる', async () => {
  const name = 'v01-acceptance-' + crypto.randomUUID();
  const db = new GameDatabase(name);
  const storage = new DexieStorageAdapter(db);
  const controller = new GameController(storage);
  const send = session(controller);
  const records = new Map([20260923, 3668339987].map((seed) => [seed, completed(seed)]));

  try {
    await controller.initialize();
    let previous = null;

    // 同じControllerで6試合。seedと進行単位の組合せを変え、UIの再表示相当も挟む。
    for (const counts of [[1], [25], [1, 7, 25, 3]]) {
      for (const [seed, expected] of records) {
        let view = await send({ kind: 'new', seed });
        let step = 0;
        while (view.state.phase !== 'gameComplete') {
          assert.notEqual(view.state.phase, 'aborted');
          view = await send({ kind: 'advance', count: counts[step++ % counts.length]! });

          const displayed = controller.query();
          assert.deepEqual(displayed, view);
          // 表示側に渡したコピーを変更しても、Worker相当の正本には戻らない。
          displayed.state.score.home = -1;
          displayed.state.rng.fullState.word = 1;
          assert.deepEqual(controller.query(), view);
        }

        assert.deepEqual(view.state, expected.state);
        assert.deepEqual(view.result, expected.result);
        await send({ kind: 'save' });

        // 成績だけでなく、投球・走者・自責点再構成・完全な乱数状態を含め照合。
        assert.deepEqual((await storage.loadSnapshot()).record, expected);
        if (previous) assert.deepEqual((await storage.loadSnapshot(true)).record, previous);
        previous = expected;
      }
    }

    db.close();
    const reopened = new GameDatabase(name);
    try {
      const restored = new GameController(new DexieStorageAdapter(reopened));
      const restore = session(restored);
      await restored.initialize();
      const view = await restore({ kind: 'load', previous: false });
      assert.deepEqual(view.state, records.get(3668339987)!.state);
      assert.deepEqual(view.result, records.get(3668339987)!.result);
      const before = structuredClone(view);
      await assert.rejects(restore({ kind: 'advance', count: 1 }), /終了した試合/);
      assert.deepEqual(restored.query(), before);
    } finally {
      reopened.close();
    }
  } finally {
    await db.delete();
  }
});

test('MVP-05/07: 保存失敗を4ストアで取り消し、同じ指示の再試行・再送でも二重保存しない', async () => {
  const db = new GameDatabase('v01-recovery-' + crypto.randomUUID());
  const storage = new DexieStorageAdapter(db);
  const controller = new GameController(storage);
  const send = session(controller);

  try {
    await storage.commitSnapshot(completed(20260923), 0);
    await controller.initialize();
    let view = await send({ kind: 'new', seed: 3668339987 });
    while (view.state.phase !== 'gameComplete') view = await send({ kind: 'advance', count: 25 });

    const before = controller.query();
    const tablesBefore = await Promise.all(db.tables.map((table) => table.toArray()));
    const command: GameCommand = {
      kind: 'save',
      commandId: 'retry-save',
      expectedStateRevision: before.revision,
    };
    const fail = () => {
      throw new Error('受入試験の保存失敗');
    };

    db.save_snapshots.hook('creating', fail);
    await assert.rejects(controller.dispatch(command), /受入試験の保存失敗/);
    db.save_snapshots.hook('creating').unsubscribe(fail);
    assert.deepEqual(controller.query(), before);
    assert.deepEqual(await Promise.all(db.tables.map((table) => table.toArray())), tablesBefore);

    const saved = await controller.dispatch(command);
    assert.equal(saved.slots.storageRevision, 2);
    assert.deepEqual(await controller.dispatch(command), saved);
    assert.equal(await db.save_snapshots.count(), 2);
    assert.deepEqual((await storage.loadSnapshot()).record, completed(3668339987));
    assert.deepEqual((await storage.loadSnapshot(true)).record, completed(20260923));
  } finally {
    await db.delete();
  }
});

test('MVP-06/07: 破損保存の読込失敗で進行中の正本を保持し、前保存へ復旧できる', async () => {
  const db = new GameDatabase('v01-corrupt-' + crypto.randomUUID());
  const storage = new DexieStorageAdapter(db);
  const controller = new GameController(storage);
  const send = session(controller);

  try {
    const first = completed(20260923);
    await storage.commitSnapshot(first, 0);
    const saved = await storage.commitSnapshot(completed(3668339987), 1);
    await controller.initialize();
    await send({ kind: 'advance', count: 7 });
    const before = controller.query();

    const snapshot = await db.save_snapshots.get(saved.snapshotId!);
    const ref = snapshot!.blockRefs.find((block) => block.kind === 'game')!;
    const block = await db.save_blocks.get(ref.blockId);
    block!.payloadBytes[0] = 0;
    await db.save_blocks.put(block!);

    await assert.rejects(send({ kind: 'load', previous: false }), /破損/);
    assert.deepEqual(controller.query(), before);
    const restored = await send({ kind: 'load', previous: true });
    assert.deepEqual(restored.state, first.state);
    assert.deepEqual(restored.result, first.result);
    assert.equal(restored.slots.storageRevision, 2);
  } finally {
    await db.delete();
  }
});
