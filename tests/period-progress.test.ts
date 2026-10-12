import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createProgressTarget, nextProgressAction } from '../src/world/period-progress.ts';
import {
  advanceWorld,
  completeDay,
  createBullpenWorld,
  createWorld,
  worldPhase,
} from '../src/world/engine.ts';
import { DexieWorldStorage, WorldDatabase } from '../src/world/dexie-storage.ts';
import type { ProgressTarget } from '../src/world/period-progress.ts';
import type { WorldRecord } from '../src/world/types.ts';

function runTo(world: WorldRecord, target: ProgressTarget): WorldRecord {
  for (let count = 0; count < 10000; count++) {
    const action = nextProgressAction(
      { currentDate: world.currentDate, phase: worldPhase(world) },
      target,
    );
    if (!action) return world;
    world =
      action.kind === 'advance'
        ? advanceWorld(world, action.count)
        : completeDay(world, action.date);
  }
  throw new Error('期間進行が停止しません');
}

function finishDay(world: WorldRecord) {
  while (worldPhase(world) === 'playing') world = advanceWorld(world, 25);
  return completeDay(world, world.currentDate);
}

test('期間進行：実在する未来日だけ試合前を指定でき、今日の終了とは区別する', () => {
  for (const date of [
    '',
    '2026-2-28',
    '2026-02-29',
    '2026-04-31',
    '2026-13-01',
    '2026-03-26',
    '2026-03-27',
    '2026-10-01',
  ]) {
    assert.throws(() => createProgressTarget('2026-03-27', '2026-09-30', date, 'beforeGames'));
  }
  assert.doesNotThrow(() =>
    createProgressTarget('2024-02-28', '2024-03-02', '2024-02-29', 'beforeGames'),
  );
  assert.doesNotThrow(() =>
    createProgressTarget('2026-12-31', '2027-01-03', '2027-01-01', 'beforeGames'),
  );
  assert.doesNotThrow(() =>
    createProgressTarget('2026-03-27', '2026-09-30', '2026-03-27', 'afterDay'),
  );
  assert.doesNotThrow(() =>
    createProgressTarget('2026-03-27', '2026-09-30', '2026-09-30', 'beforeGames'),
  );
});

test('期間進行：到着日の初球・休養日の確定を送らず、中断・終了後も指示しない', () => {
  const target = createProgressTarget('2026-09-24', '2026-09-27', '2026-09-26', 'beforeGames');
  for (const phase of ['playing', 'readyToComplete', 'aborted', 'scheduleComplete'] as const) {
    assert.equal(nextProgressAction({ currentDate: '2026-09-26', phase }, target), null);
    assert.equal(nextProgressAction({ currentDate: '2026-09-27', phase }, target), null);
  }
  for (const phase of ['aborted', 'scheduleComplete'] as const)
    assert.equal(nextProgressAction({ currentDate: '2026-09-25', phase }, target), null);
  assert.deepEqual(
    nextProgressAction({ currentDate: '2026-09-25', phase: 'readyToComplete' }, target),
    { kind: 'completeDay', date: '2026-09-25' },
  );
});

test('期間進行：一軍・二軍と休養日を日次順で処理し、到着日の試合・乱数は未着手', () => {
  for (const initial of [createWorld(1), createBullpenWorld(1)]) {
    const target = createProgressTarget(
      initial.currentDate,
      initial.definitions.endDate,
      '2026-09-26',
      'beforeGames',
    );
    const before = structuredClone(initial);
    const arrived = runTo(initial, target);
    assert.equal(arrived.currentDate, '2026-09-26');
    assert.deepEqual(arrived.completedDates, ['2026-09-24', '2026-09-25']);
    assert.equal(arrived.dayPlan.cursor, 0);
    for (const id of arrived.dayPlan.gameIds) {
      assert.equal(arrived.games[id], undefined);
      assert.equal(arrived.statApplicationMarkers[id], undefined);
    }
    assert.deepEqual(arrived, finishDay(finishDay(initial)));
    assert.deepEqual(initial, before);
    // 到着日の再評価は無操作。明示した「1日」の進行だけがその日を処理する。
    assert.equal(runTo(arrived, target), arrived);
    const next = runTo(
      arrived,
      createProgressTarget(
        arrived.currentDate,
        arrived.definitions.endDate,
        arrived.currentDate,
        'afterDay',
      ),
    );
    assert.deepEqual(next, finishDay(arrived));
    assert.equal(next.currentDate, '2026-09-27');
    const ended = runTo(
      next,
      createProgressTarget(
        next.currentDate,
        next.definitions.endDate,
        next.definitions.endDate,
        'afterDay',
      ),
    );
    assert.equal(ended.currentDate, '2026-09-28');
    assert.equal(worldPhase(ended), 'scheduleComplete');
    assert.equal(runTo(ended, target), ended);
  }
});

test('期間進行：途中停止・再開と到着日の保存復帰で、同じ試合・成績・日次状態を保持', async () => {
  const initial = createBullpenWorld(1);
  const target = createProgressTarget(
    initial.currentDate,
    initial.definitions.endDate,
    '2026-09-27',
    'beforeGames',
  );
  const expected = runTo(initial, target);
  // 途中の25イベントで止め、同じ目標で再開する。
  const partial = advanceWorld(initial, 25);
  assert.deepEqual(runTo(partial, target), expected);
  const db = new WorldDatabase('period-progress-' + crypto.randomUUID());
  try {
    const storage = new DexieWorldStorage(db);
    await storage.save(expected, 1, 'auto', 0);
    const restored = (await storage.load('auto')).world;
    assert.deepEqual(restored, expected);
    assert.equal(restored.currentDate, '2026-09-27');
    assert.equal(restored.dayPlan.cursor, 0);
    assert.equal(runTo(restored, target), restored);
    assert.deepEqual(finishDay(restored), finishDay(expected));
  } finally {
    await db.delete();
  }
});
