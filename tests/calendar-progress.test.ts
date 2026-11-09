import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorldStorageAdapter } from '../src/world/storage.ts';
import { emptyWorldSlots } from '../src/world/storage.ts';
import { createWorldDefinitions } from '../src/data/world/index.ts';
import { createCalendarRestWorld } from './calendar-progress-fixture.ts';
import { nextCalendarAction } from '../src/world/calendar-progress.ts';
import { completeDay, createWorld } from '../src/world/engine.ts';
import { WorldController, type WorldAction, type WorldCommand } from '../src/world/controller.ts';
import { DexieWorldStorage, WorldDatabase } from '../src/world/dexie-storage.ts';

const target = { date: '2026-09-25', boundary: 'afterDay' as const };

test('日程：途中日は保存せず、到着・一時停止・異常停止時だけ保存を指示する', () => {
  const current = {
    currentDate: '2026-09-24',
    phase: 'readyToComplete' as const,
    unsavedChanges: true,
  };
  assert.deepEqual(nextCalendarAction(current, target), {
    kind: 'completeDay',
    date: current.currentDate,
    save: 'defer',
  });
  assert.deepEqual(nextCalendarAction({ ...current, phase: 'playing' }, target), {
    kind: 'advanceBatch',
    count: 25,
    batches: 4,
  });
  for (const phase of ['playing', 'readyToComplete', 'aborted', 'scheduleComplete'] as const) {
    const state = { ...current, phase };
    assert.deepEqual(nextCalendarAction(state, target, true), { kind: 'saveProgress' });
    assert.deepEqual(nextCalendarAction({ ...state, currentDate: '2026-09-26' }, target), {
      kind: 'saveProgress',
    });
    assert.equal(nextCalendarAction({ ...state, unsavedChanges: false }, target, true), null);
  }
  assert.deepEqual(nextCalendarAction({ ...current, phase: 'aborted' }, target), {
    kind: 'saveProgress',
  });
  assert.deepEqual(
    nextCalendarAction(current, { date: current.currentDate, boundary: 'beforeGames' }),
    { kind: 'saveProgress' },
  );
});

test('日程：2休養日の更新と乱数を保ち、終了時の1保存・再送・復元・旧手動枠を維持する', async () => {
  const db = new WorldDatabase('calendar-end-' + crypto.randomUUID());
  try {
    const storage = new DexieWorldStorage(db);
    const initial = createCalendarRestWorld();
    let slots = await storage.save(initial, 0, 'manual', 0);
    slots = await storage.save(initial, 1, 'progress', slots.storageRevision);
    const owner = WorldController.fromCommitted(storage, 'v02-local', 1, initial, slots);
    const initialCount = await db.save_snapshots.count();
    const dispatch = (action: WorldAction, commandId = crypto.randomUUID()) =>
      owner.dispatch({
        ...action,
        commandId,
        localWorldId: owner.context().localWorldId,
        expectedStateRevision: owner.context().revision,
      });
    let expected = initial;
    for (let i = 0; i < 2; i++) {
      const action = nextCalendarAction(owner.query(), target)!;
      assert.equal(action.kind, 'completeDay');
      await dispatch(action);
      expected = completeDay(expected, expected.currentDate) as typeof initial;
      assert.equal(owner.query().unsavedChanges, true);
      assert.deepEqual(await storage.listSlots(), slots);
      assert.equal(await db.save_snapshots.count(), initialCount);
    }
    assert.equal(owner.query().currentDate, '2026-09-26');
    assert.equal(owner.query().lastCompletedDate, target.date);
    const end: WorldCommand = {
      ...nextCalendarAction(owner.query(), target)!,
      commandId: 'end-save',
      localWorldId: owner.context().localWorldId,
      expectedStateRevision: owner.context().revision,
    };
    const result = await owner.dispatch(end);
    assert.equal(result.unsavedChanges, false);
    assert.equal(result.slots.storageRevision, slots.storageRevision + 1);
    assert.deepEqual(result.slots.manual, slots.manual);
    assert.deepEqual(result.slots.previousAuto, slots.auto);
    assert.deepEqual((await storage.load('auto')).world, expected);
    assert.deepEqual((await storage.load('manual')).world, initial);
    assert.deepEqual(await owner.dispatch(end), result);
    assert.equal((await storage.listSlots()).storageRevision, result.slots.storageRevision);
    await assert.rejects(owner.dispatch({ ...end, kind: 'save' }), /同じ指示ID/);
    await assert.rejects(owner.dispatch({ ...end, commandId: 'stale' }), /古い/);
    await assert.rejects(
      dispatch({ kind: 'completeDay', date: initial.currentDate, save: 'defer' }),
      /日付/,
    );
    await assert.rejects(
      dispatch({
        kind: 'completeDay',
        date: result.currentDate,
        save: 'invalid',
      } as unknown as WorldAction),
      /保存方法/,
    );
  } finally {
    await db.delete();
  }
});

test('日程：保存失敗で進行済みの日付と旧保存を保ち、再計算せず同じ要求で再試行する', async () => {
  const db = new WorldDatabase('calendar-retry-' + crypto.randomUUID());
  try {
    const storage = new DexieWorldStorage(db);
    const initial = createCalendarRestWorld();
    const slots = await storage.save(initial, 0, 'progress', 0);
    const owner = WorldController.fromCommitted(storage, 'v02-local', 1, initial, slots);
    await owner.dispatch({
      kind: 'completeDay',
      date: initial.currentDate,
      save: 'defer',
      commandId: 'day',
      localWorldId: 'v02-local',
      expectedStateRevision: 1,
    });
    const before = owner.query();
    const end: WorldCommand = {
      kind: 'saveProgress',
      commandId: 'retry-save',
      localWorldId: 'v02-local',
      expectedStateRevision: before.revision,
    };
    const fail = () => {
      throw new Error('injected save failure');
    };
    db.save_snapshots.hook('creating', fail);
    await assert.rejects(owner.dispatch(end), /injected/);
    db.save_snapshots.hook('creating').unsubscribe(fail);
    const failed = owner.query();
    assert.equal(failed.currentDate, before.currentDate);
    assert.equal(failed.revision, before.revision);
    assert.equal(failed.unsavedChanges, true);
    assert.deepEqual(failed.completedDates, before.completedDates);
    assert.deepEqual(await storage.listSlots(), slots);
    assert.match(failed.storageError!, /保存だけ/);
    assert.deepEqual((await storage.load('auto')).world, initial);
    const saved = await owner.dispatch(end);
    assert.equal(saved.currentDate, before.currentDate);
    assert.equal(saved.unsavedChanges, false);
    assert.equal(saved.storageError, null);
    assert.deepEqual(saved.completedDates, [initial.currentDate]);
    assert.deepEqual((await storage.load('auto')).world, completeDay(initial, initial.currentDate));
    // 同じ保存世代で別タブが先に保存した場合も、既存の競合検出を省略しない。
    await storage.save(initial, 9, 'manual', saved.slots.storageRevision);
    await assert.rejects(
      owner.dispatch({ ...end, commandId: 'conflict', expectedStateRevision: saved.revision }),
      /別タブ/,
    );
  } finally {
    await db.delete();
  }
});

test('日程：試合前の停止は日次完了を偽装せず自動枠へ保存でき、従来の日次保存制約は残す', async () => {
  const db = new WorldDatabase('calendar-pause-' + crypto.randomUUID());
  try {
    const storage = new DexieWorldStorage(db);
    const initial = createWorld(42);
    assert.equal(initial.lastCompletedDate, null);
    await assert.rejects(storage.save(initial, 0, 'auto', 0), /日次完了/);
    const slots = await storage.save(initial, 0, 'progress', 0);
    assert.equal(slots.manual, null);
    assert.deepEqual((await storage.load('auto')).world, initial);
  } finally {
    await db.delete();
  }
});

test('従来の日次確定：保存省略を指定しなければ保存成功まで日付を公開しない', async () => {
  const definitions = createWorldDefinitions();
  definitions.schedule = [];
  const initial = createWorld(42, definitions);
  const slots = emptyWorldSlots();
  let fail = true;
  const kinds: string[] = [];
  const storage: WorldStorageAdapter = {
    async listSlots() {
      return slots;
    },
    async load() {
      throw new Error('未使用');
    },
    async save(_world, _revision, kind) {
      kinds.push(kind);
      if (fail) throw new Error('injected default save failure');
      return slots;
    },
  };
  const owner = WorldController.fromCommitted(storage, 'legacy-day', 1, initial, slots);
  const command: WorldCommand = {
    kind: 'completeDay',
    date: initial.currentDate,
    commandId: 'legacy',
    localWorldId: 'legacy-day',
    expectedStateRevision: 1,
  };
  await assert.rejects(owner.dispatch(command), /injected/);
  assert.equal(owner.query().currentDate, initial.currentDate);
  assert.equal(owner.query().revision, 1);
  fail = false;
  const saved = await owner.dispatch(command);
  assert.equal(saved.currentDate, '2026-09-25');
  assert.equal(saved.unsavedChanges, false);
  assert.deepEqual(kinds, ['auto', 'auto']);
});
