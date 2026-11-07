import assert from 'node:assert/strict';
import test from 'node:test';
import { CompletedProjectionCache } from '../src/world/completed-projection-cache.ts';
import { WorldController } from '../src/world/controller.ts';
import { createWorld, createScheduledGame, createRestWorld } from '../src/world/engine.ts';
import { emptyWorldSlots, type WorldStorageAdapter } from '../src/world/storage.ts';
import type { WorldRecord } from '../src/world/types.ts';
import { playerStatuses } from '../src/world/player-status.ts';

function counter() {
  let calls = 0;
  const cache = new CompletedProjectionCache(() => ({ call: ++calls }));
  return { cache, calls: () => calls };
}

// キャッシュの参照差替えを検査する表示用token。試合として適用・保存しない。
function completedToken(world: WorldRecord) {
  const game = createScheduledGame(world, world.dayPlan.gameIds[0]!);
  game.state.phase = 'gameComplete';
  game.result = {
    gameId: game.state.gameId,
    resultRevision: 1,
    winner: 'draw',
    score: { away: 0, home: 0 },
    innings: { away: [], home: [] },
    batting: [],
    pitching: [],
    totalPitches: 0,
    completedAppearances: 0,
    contributionKey: 'display-token',
  };
  return game;
}

function memoryStorage(world = createWorld()) {
  let slots = emptyWorldSlots();
  let loads = 0,
    lists = 0;
  let failSave = false;
  const storage: WorldStorageAdapter = {
    async listSlots() {
      lists++;
      return structuredClone(slots);
    },
    async load() {
      loads++;
      return { world: structuredClone(world), slots: structuredClone(slots) };
    },
    async save(_world, _revision, _kind, expected) {
      if (failSave) throw new Error('保存失敗');
      assert.equal(expected, slots.storageRevision);
      slots = { ...slots, storageRevision: slots.storageRevision + 1 };
      return structuredClone(slots);
    },
  };
  return {
    storage,
    counts: () => ({ loads, lists }),
    fail: () => {
      failSave = true;
    },
  };
}

test('確定記録：未完了試合の投球だけでは再集計しない', () => {
  const world = createWorld();
  const { cache, calls } = counter();
  const first = cache.read(world);
  const id = world.dayPlan.gameIds[0]!;
  const next = { ...world, games: { ...world.games, [id]: createScheduledGame(world, id) } };
  assert.strictEqual(cache.read(next), first);
  assert.equal(calls(), 1);
});

test('確定記録：試合終了と成績確定markerの差替えを検出する', () => {
  const world = createWorld();
  const { cache, calls } = counter();
  cache.read(world);
  const id = world.dayPlan.gameIds[0]!;
  const next = { ...world, games: { ...world.games, [id]: completedToken(world) } };
  cache.read(next);
  cache.read({
    ...next,
    statApplicationMarkers: {
      [id]: { attemptNo: 1, resultRevision: 1, contributionHash: 'changed' },
    },
  });
  assert.equal(calls(), 3);
});

test('確定記録：同一ID・結果版でも読込で内容が変われば再集計する', () => {
  const world = createWorld();
  const id = world.dayPlan.gameIds[0]!;
  const next = { ...world, games: { [id]: completedToken(world) } };
  const { cache, calls } = counter();
  cache.read(next);
  const replacement = structuredClone(next.games[id]!);
  replacement.result!.score.away = 1;
  cache.read({ ...next, games: { [id]: replacement } });
  cache.read(structuredClone(next));
  assert.equal(calls(), 3);
});

test('確定記録：日付と日次完了の変更で最終確定の表示を更新する', () => {
  const world = createWorld();
  const { cache, calls } = counter();
  cache.read(world);
  const dated = { ...world, currentDate: '2026-09-25' };
  cache.read(dated);
  cache.read({ ...dated, completedDates: ['2026-09-24'] });
  assert.equal(calls(), 3);
});

test('確定記録：集計の失敗を成功としてキャッシュしない', () => {
  const world = createWorld();
  let calls = 0;
  const cache = new CompletedProjectionCache(() => {
    if (++calls === 1) throw new Error('索引エラー');
    return calls;
  });
  assert.throws(() => cache.read(world), /索引エラー/);
  assert.equal(cache.read(world), 2);
  assert.equal(cache.read(world), 2);
});

test('表示キャッシュ：呼出側の改変が次のqueryとcontextへ漏れない', () => {
  const world = createWorld();
  const mem = memoryStorage(world);
  const controller = WorldController.fromCommitted(
    mem.storage,
    'read-cache',
    3,
    world,
    emptyWorldSlots(),
  );
  const before = controller.query();
  const output = controller.query();
  output.definitions.squads[0]!.players[0]!.familyName = '改変';
  output.memorial.firstRegular.maximum = 999;
  const context = controller.context();
  context.slots.storageRevision = 999;
  assert.deepEqual(controller.query(), before);
  assert.equal(controller.context().slots.storageRevision, 0);
  assert.equal('definitions' in controller.context(), false);
});

test('表示キャッシュ：手動保存と再送で状態版・枠・返却値を分離する', async () => {
  const world = createWorld();
  const mem = memoryStorage(world);
  const controller = WorldController.fromCommitted(
    mem.storage,
    'read-cache',
    3,
    world,
    emptyWorldSlots(),
  );
  const command = {
    kind: 'save' as const,
    commandId: 'save-cache',
    localWorldId: 'read-cache',
    expectedStateRevision: 3,
  };
  const saved = await controller.dispatch(command);
  assert.equal(saved.revision, 4);
  assert.equal(saved.slots.storageRevision, 1);
  saved.slots.storageRevision = 999;
  assert.equal((await controller.dispatch(command)).slots.storageRevision, 1);
  assert.equal(controller.query().slots.storageRevision, 1);
});

test('保存読込：初期世界と破棄するqueryを作らず、一度のloadで開く', async () => {
  const world = createWorld();
  const mem = memoryStorage(world);
  const controller = await WorldController.openSaved(mem.storage, 'opened-play', 8, 'manual');
  assert.deepEqual(mem.counts(), { loads: 1, lists: 0 });
  assert.equal(controller.query().revision, 9);
  assert.equal(controller.query().localWorldId, 'opened-play');
  assert.equal(controller.query().unsavedChanges, false);
  assert.deepEqual(controller.query().definitions, world.definitions);
});

test('表示キャッシュ：保存失敗の理由を古い正常表示で隠さない', async () => {
  const world = createWorld();
  const mem = memoryStorage(world);
  const controller = WorldController.fromCommitted(
    mem.storage,
    'read-cache',
    3,
    world,
    emptyWorldSlots(),
  );
  const before = controller.query();
  mem.fail();
  await assert.rejects(
    controller.dispatch({
      kind: 'save',
      commandId: 'failed-cache',
      localWorldId: 'read-cache',
      expectedStateRevision: 3,
    }),
    /保存失敗/,
  );
  assert.match(controller.query().storageError!, /手動保存に失敗/);
  assert.equal(controller.query().revision, before.revision);
  assert.deepEqual(controller.query().games, before.games);
});

test('選手状態：履歴の順序に依存せず最新日の複数登板を合計する', () => {
  const world = createRestWorld();
  const squad = world.definitions.squads[0]!;
  const playerId = squad.players[0]!.playerId;
  const make = (gameId: string, date: string, pitches: number) => ({
    playerId,
    squadId: squad.squadId,
    gameId,
    date,
    pitches,
    innings: [1],
  });
  world.restControl.appearances = {
    a: make('a', '2026-09-23', 12),
    b: make('b', '2026-09-22', 80),
    c: make('c', '2026-09-23', 7),
  };
  const row = playerStatuses(world).find((row) => row.playerId === playerId)!;
  assert.equal(row.lastPitchedOn, '2026-09-23');
  assert.equal(row.lastPitchCount, 19);
  assert.notEqual(row.registration, null);
});

test('選手状態：未登板と実際の0球を区別する', () => {
  const world = createRestWorld();
  const squad = world.definitions.squads[0]!;
  const playerId = squad.players[0]!.playerId;
  assert.equal(playerStatuses(world).find((r) => r.playerId === playerId)!.lastPitchCount, null);
  world.restControl.appearances = {
    zero: {
      playerId,
      squadId: squad.squadId,
      gameId: 'zero',
      date: '2026-09-23',
      pitches: 0,
      innings: [],
    },
  };
  assert.equal(playerStatuses(world).find((r) => r.playerId === playerId)!.lastPitchCount, 0);
});
