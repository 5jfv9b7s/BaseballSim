import assert from 'node:assert/strict';
import test from 'node:test';
import { createPitchLearningWorld } from '../src/world/engine.ts';
import { WorldController, type WorldCommand } from '../src/world/controller.ts';
import { emptyWorldSlots, type WorldStorageAdapter } from '../src/world/storage.ts';
import type { WorldRecord } from '../src/world/types.ts';

// 日付・DBを進めず、同一1試合の手動単位と自動まとめ処理を比較する。
test('自動進行：同じ1試合の全イベント・乱数・負荷・集計を保ち、終了時に応答する', async () => {
  const initial = createPitchLearningWorld();
  const worlds: WorldRecord[] = [];
  const counts: number[] = [];
  for (const batch of [false, true]) {
    const slots = emptyWorldSlots();
    const storage: WorldStorageAdapter = {
      async listSlots() {
        return slots;
      },
      async load() {
        throw new Error('この確認では読込しない');
      },
      async save(world) {
        worlds.push(world);
        return slots;
      },
    };
    const owner = WorldController.fromCommitted(storage, 'batch-check', 0, initial, slots);
    let view = owner.query();
    const before = structuredClone(view);
    if (batch) {
      for (const value of [0, 5, 1.5])
        await assert.rejects(
          owner.dispatch({
            kind: 'advanceBatch',
            count: 25,
            batches: value,
            commandId: 'invalid-' + value,
            localWorldId: view.localWorldId,
            expectedStateRevision: 0,
          }),
        );
      await assert.rejects(
        owner.dispatch({
          kind: 'advance',
          count: 26,
          commandId: 'invalid-count',
          localWorldId: view.localWorldId,
          expectedStateRevision: 0,
        }),
      );
      assert.deepEqual(owner.query(), before);
    }
    let count = 0;
    let last: WorldCommand | undefined;
    while (view.dayPlan.cursor === before.dayPlan.cursor && view.phase === 'playing') {
      assert.ok(count < 200, '同じ試合の進行上限');
      last = batch
        ? {
            kind: 'advanceBatch',
            count: 25,
            batches: 4,
            commandId: 'batch-' + count,
            localWorldId: view.localWorldId,
            expectedStateRevision: view.revision,
          }
        : {
            kind: 'advance',
            count: 25,
            commandId: 'step-' + count,
            localWorldId: view.localWorldId,
            expectedStateRevision: view.revision,
          };
      view = await owner.dispatch(last);
      count++;
    }
    assert.equal(view.dayPlan.cursor, before.dayPlan.cursor + 1);
    assert.equal(view.currentDate, before.currentDate);
    assert.deepEqual(view.completedDates, before.completedDates);
    assert.equal(view.games.filter((game) => game.status === 'completed').length, 1);
    assert.equal(view.games.filter((game) => game.status === 'playing').length, 0);
    // 応答の再送は同じ状態。指示内容の変更と古い版は拒否する。
    assert.deepEqual(await owner.dispatch(last!), view);
    if (last?.kind === 'advanceBatch')
      await assert.rejects(owner.dispatch({ ...last, batches: 3 }), /同じ指示ID/);
    await assert.rejects(
      owner.dispatch({
        kind: 'advanceBatch',
        count: 25,
        batches: 4,
        commandId: 'stale',
        localWorldId: view.localWorldId,
        expectedStateRevision: 0,
      }),
      /古い/,
    );
    assert.deepEqual(owner.query(), view);
    await owner.dispatch({
      kind: 'save',
      commandId: 'capture',
      localWorldId: view.localWorldId,
      expectedStateRevision: view.revision,
    });
    counts.push(count);
  }
  assert.deepEqual(worlds[1], worlds[0]);
  assert.ok(counts[1]! < counts[0]!, '同じ結果を少ない応答で返す');
  assert.deepEqual(initial.games, {}, '入力の世界を変更しない');
});
