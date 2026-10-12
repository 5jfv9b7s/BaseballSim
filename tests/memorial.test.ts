import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { singleGameHomeRunRecord } from '../src/world/memorial.ts';
import { gameDisplay } from '../src/world/game-display.ts';
import { gameScope } from '../src/world/squads.ts';
import {
  createWorld,
  createBullpenWorld,
  advanceWorld,
  completeDay,
  worldPhase,
} from '../src/world/engine.ts';
import { WorldDatabase, DexieWorldStorage } from '../src/world/dexie-storage.ts';
import { WorldController } from '../src/world/controller.ts';
import type { WorldRecord } from '../src/world/types.ts';

function finishDay(world: WorldRecord) {
  while (worldPhase(world) === 'playing') world = advanceWorld(world, 25);
  return completeDay(world, world.currentDate);
}

let legacy: WorldRecord;
let current: WorldRecord;
function sample(latest = false) {
  if (latest) return (current ??= finishDay(createBullpenWorld(1)));
  return (legacy ??= finishDay(createWorld()));
}

// 集計の境界用に確定結果の本数だけを変更する。エンジン検証・保存の検体には使わない。
function zeroed(latest = false) {
  const world = structuredClone(sample(latest));
  for (const game of Object.values(world.games)) {
    for (const line of game.result!.batting) line.homeRuns = 0;
  }
  return world;
}

test('メモリアル：未実施・0本・未反映・途中・中断試合を達成記録にしない', () => {
  assert.equal(singleGameHomeRunRecord(createWorld()).maximum, null);
  assert.throws(() => singleGameHomeRunRecord(createWorld(), 'farmRegular'), /大会/);
  const world = zeroed();
  const game = Object.values(world.games)[0]!;
  const gameId = game.result!.gameId;
  const zero = singleGameHomeRunRecord(world);
  assert.equal(zero.completedGames, 2);
  assert.equal(zero.maximum, null);
  assert.deepEqual(zero.entries, []);
  game.result!.batting[0]!.homeRuns = 3;
  const marker = world.statApplicationMarkers[gameId]!;
  delete world.statApplicationMarkers[gameId];
  assert.equal(singleGameHomeRunRecord(world).maximum, null);
  world.statApplicationMarkers[gameId] = marker;
  for (const phase of ['readyForPitch', 'aborted'] as const) {
    game.state.phase = phase;
    assert.equal(singleGameHomeRunRecord(world).maximum, null);
  }
  game.state.phase = 'gameComplete';
  game.result!.resultRevision = 2 as never;
  assert.throws(() => singleGameHomeRunRecord(world), /確定版/);
});

test('メモリアル：同率者と同一選手の別試合を全件保持し、より多い記録へ更新する', () => {
  const world = zeroed();
  const first = world.definitions.schedule[0]!;
  const game = world.games[first.gameId]!;
  game.result!.batting[0]!.homeRuns = 2;
  game.result!.batting[1]!.homeRuns = 2;
  const another = { ...first, gameId: 'record-another-game', date: '2026-09-25' };
  world.definitions.schedule.push(another);
  world.games[another.gameId] = structuredClone(game);
  const repeated = world.games[another.gameId]!;
  repeated.result!.gameId = another.gameId;
  repeated.result!.batting[1]!.homeRuns = 0;
  world.statApplicationMarkers[another.gameId] = world.statApplicationMarkers[first.gameId]!;
  const record = singleGameHomeRunRecord(world);
  assert.equal(record.maximum, 2);
  assert.equal(record.entries.length, 3);
  assert.equal(new Set(record.entries.map((entry) => entry.recordId)).size, 3);
  assert.equal(new Set(record.entries.map((entry) => entry.playerId)).size, 2);
  assert.equal(new Set(record.entries.map((entry) => entry.gameId)).size, 2);
  world.definitions.schedule.reverse();
  assert.deepEqual(singleGameHomeRunRecord(world), record);
  repeated.result!.batting[0]!.homeRuns = 3;
  const improved = singleGameHomeRunRecord(world);
  assert.equal(improved.maximum, 3);
  assert.equal(improved.entries.length, 1);
  assert.equal(improved.entries[0]!.gameId, another.gameId);
});

test('メモリアル・試合表示：現在の氏名・所属・選手有無が変わっても試合当時を保つ', () => {
  const world = zeroed();
  const game = Object.values(world.games)[0]!;
  const playerId = game.fixture.teams.home.lineup[0]!.playerId;
  game.result!.batting.find((line) => line.playerId === playerId)!.homeRuns = 4;
  const before = singleGameHomeRunRecord(world);
  const display = gameDisplay(game);
  assert.equal(before.entries[0]!.display.teamName, game.fixture.teams.home.name);
  assert.equal(before.entries[0]!.display.opponentName, game.fixture.teams.away.name);
  for (const squad of world.definitions.squads) {
    squad.team.name = '改称後の球団';
    squad.players = [];
  }
  assert.deepEqual(singleGameHomeRunRecord(world), before);
  assert.deepEqual(gameDisplay(game), display);
  const snapshot = structuredClone(world);
  singleGameHomeRunRecord(world).entries[0]!.display.playerName = '表示コピーの変更';
  gameDisplay(game).players[0]!.playerName = '表示コピーの変更';
  assert.deepEqual(world, snapshot);
  assert.deepEqual(singleGameHomeRunRecord(world), before);
});

test('メモリアル：一軍と二軍を別集計し、各大会の終了日確定後だけ今季確定にする', () => {
  const world = zeroed(true);
  for (const match of world.definitions.schedule) {
    const game = world.games[match.gameId];
    if (game)
      game.result!.batting[0]!.homeRuns =
        gameScope(world.definitions, match) === 'farmRegular' ? 5 : 2;
  }
  const first = singleGameHomeRunRecord(world);
  const farm = singleGameHomeRunRecord(world, 'farmRegular');
  assert.equal(first.maximum, 2);
  assert.equal(farm.maximum, 5);
  assert.notEqual(first.competitionId, farm.competitionId);
  assert.equal(first.completedGames, 2);
  assert.equal(farm.completedGames, 2);
  assert.ok(farm.entries.every((entry) => entry.display.teamName.includes('二軍')));
  assert.equal(first.status, 'inProgress');
  world.definitions.schedule = world.definitions.schedule.filter(
    (match) => world.games[match.gameId],
  );
  world.currentDate = '2026-10-01';
  assert.equal(singleGameHomeRunRecord(world, 'farmRegular').status, 'inProgress');
  world.completedDates.push(world.definitions.farm!.endDate);
  assert.equal(singleGameHomeRunRecord(world, 'farmRegular').status, 'final');
  assert.equal(singleGameHomeRunRecord(world).status, 'inProgress');
  world.completedDates.push(world.definitions.endDate);
  assert.equal(singleGameHomeRunRecord(world).status, 'final');
});

test('メモリアル：旧版の保存からも記録を復元し、試合モデルを変更しない', async () => {
  const db = new WorldDatabase('memorial-legacy-' + crypto.randomUUID());
  try {
    const storage = new DexieWorldStorage(db);
    const world = sample();
    await storage.save(world, 1, 'manual', 0);
    const restored = (await storage.load('manual')).world;
    assert.equal(restored.version, 'world-prototype-v1');
    assert.deepEqual(singleGameHomeRunRecord(restored), singleGameHomeRunRecord(world));
  } finally {
    await db.delete();
  }
});

test('メモリアル：読込巻戻し・別プレイ復元・Worker照会で記録を混ぜず正本も変更しない', async () => {
  const db = new WorldDatabase('memorial-storage-' + crypto.randomUUID());
  try {
    const storage = new DexieWorldStorage(db);
    const initial = createBullpenWorld(1);
    const played = sample(true);
    let slots = await storage.save(initial, 1, 'manual', 0);
    slots = await storage.save(played, 2, 'auto', slots.storageRevision);
    const controller = new WorldController(storage);
    let view = await controller.initialize();
    let number = 0;
    const load = async (slot: 'auto' | 'manual') => {
      view = await controller.dispatch({
        kind: 'load',
        slot,
        localWorldId: 'v02-local',
        commandId: 'record-load-' + ++number,
        expectedStateRevision: view.revision,
      });
    };
    await load('auto');
    const expected = structuredClone(view.memorial);
    assert.ok(expected.firstRegular.entries.length > 0);
    assert.ok(expected.farmRegular!.entries.length > 0);
    assert.deepEqual(expected.firstRegular, singleGameHomeRunRecord(played));
    assert.deepEqual(expected.farmRegular, singleGameHomeRunRecord(played, 'farmRegular'));
    for (const game of view.games.filter((item) => item.result)) {
      assert.deepEqual(game.display, gameDisplay(played.games[game.gameId]!));
    }
    const beforeSlots = await storage.listSlots();
    view.memorial.firstRegular.maximum = 999;
    assert.deepEqual(controller.query().memorial, expected);
    assert.deepEqual(await storage.listSlots(), beforeSlots);
    await load('manual');
    assert.equal(view.memorial.firstRegular.maximum, null);
    assert.equal(view.memorial.farmRegular!.completedGames, 0);
    await load('auto');
    assert.deepEqual(view.memorial, expected);
    const bytes = await storage.exportSnapshot('auto');
    const importedId = await storage.importSnapshot(bytes, crypto.randomUUID());
    const imported = new WorldController(new DexieWorldStorage(db, importedId), importedId);
    const opened = await imported.initialize();
    const restored = await imported.dispatch({
      kind: 'load',
      slot: 'manual',
      localWorldId: importedId,
      commandId: 'memorial-open',
      expectedStateRevision: opened.revision,
    });
    assert.deepEqual(restored.memorial, expected);
  } finally {
    await db.delete();
  }
});
