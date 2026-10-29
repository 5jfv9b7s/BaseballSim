import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { canonicalJson, sha256 } from '../src/storage/codec.ts';
import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { singleGameHomeRunRecord, singleGameHomeRunRecords } from '../src/world/memorial.ts';
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
    const expectedClubs = structuredClone(view.clubMemorial);
    assert.deepEqual(expectedClubs.firstRegular, singleGameHomeRunRecords(played).byClub);
    assert.deepEqual(
      expectedClubs.farmRegular,
      singleGameHomeRunRecords(played, 'farmRegular').byClub,
    );
    assert.ok(expected.firstRegular.entries.length > 0);
    assert.ok(expected.farmRegular!.entries.length > 0);
    assert.deepEqual(expected.firstRegular, singleGameHomeRunRecord(played));
    assert.deepEqual(expected.farmRegular, singleGameHomeRunRecord(played, 'farmRegular'));
    for (const game of view.games.filter((item) => item.result)) {
      assert.deepEqual(game.display, gameDisplay(played.games[game.gameId]!));
    }
    const beforeSlots = await storage.listSlots();
    view.memorial.firstRegular.maximum = 999;
    Object.values(view.clubMemorial.firstRegular)[0]!.maximum = 999;
    assert.deepEqual(controller.query().clubMemorial, expectedClubs);
    assert.deepEqual(controller.query().memorial, expected);
    assert.deepEqual(await storage.listSlots(), beforeSlots);
    await load('manual');
    assert.equal(view.memorial.firstRegular.maximum, null);
    assert.equal(view.memorial.farmRegular!.completedGames, 0);
    assert.ok(Object.values(view.clubMemorial.firstRegular).every((r) => r.maximum === null));
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
    assert.deepEqual(restored.clubMemorial, expectedClubs);
  } finally {
    await db.delete();
  }
});

test('球団記録：他球団の球界最多より少なくても自球団内の最多と同率者を残す', () => {
  const world = zeroed(true);
  const game = Object.values(world.games)[0]!;
  const away = game.fixture.teams.away;
  const home = game.fixture.teams.home;
  const awayLines = game.result!.batting.filter((line) =>
    game.fixture.clubs
      .find((club) => club.clubId === away.clubId)!
      .playerIds.includes(line.playerId),
  );
  const homeLine = game.result!.batting.find((line) =>
    game.fixture.clubs
      .find((club) => club.clubId === home.clubId)!
      .playerIds.includes(line.playerId),
  )!;
  awayLines[0]!.homeRuns = 2;
  awayLines[1]!.homeRuns = 2;
  homeLine.homeRuns = 4;
  const before = structuredClone(world);
  const records = singleGameHomeRunRecords(world);
  const own = records.byClub[away.clubId]!;
  assert.equal(records.overall.maximum, 4);
  assert.equal(own.maximum, 2);
  assert.deepEqual(
    own.entries.map((e) => e.playerId).sort(),
    awayLines
      .slice(0, 2)
      .map((l) => l.playerId)
      .sort(),
  );
  assert.equal(own.completedGames, 1);
  assert.equal(own.scheduledGames, 3);
  assert.equal(records.overall.completedGames, 2);
  assert.equal(records.overall.scheduledGames, 6);
  assert.equal(records.byClub[home.clubId]!.entries[0]!.display.teamName, home.name);
  assert.deepEqual(world, before);
  world.definitions.schedule.reverse();
  assert.deepEqual(singleGameHomeRunRecords(world), records);
});

test('球団記録：0本・未反映試合を除外し、一軍と二軍の同じ球団を混ぜない', () => {
  const world = zeroed(true);
  const firstMatch = world.definitions.schedule.find(
    (match) => gameScope(world.definitions, match) === 'firstRegular',
  )!;
  const farmMatch = world.definitions.schedule.find(
    (match) => gameScope(world.definitions, match) === 'farmRegular',
  )!;
  const first = world.games[firstMatch.gameId]!;
  const farm = world.games[farmMatch.gameId]!;
  const clubId = first.fixture.teams.away.clubId;
  const firstIndex = singleGameHomeRunRecords(world);
  assert.equal(firstIndex.byClub[clubId]!.maximum, null);
  assert.deepEqual(firstIndex.byClub[clubId]!.entries, []);
  const line = farm.result!.batting.find((row) =>
    farm.fixture.clubs.find((club) => club.clubId === clubId)!.playerIds.includes(row.playerId),
  )!;
  line.homeRuns = 3;
  assert.equal(singleGameHomeRunRecords(world).byClub[clubId]!.maximum, null);
  assert.equal(singleGameHomeRunRecords(world, 'farmRegular').byClub[clubId]!.maximum, 3);
  delete world.statApplicationMarkers[farmMatch.gameId];
  assert.equal(singleGameHomeRunRecords(world, 'farmRegular').byClub[clubId]!.maximum, null);
  assert.equal(singleGameHomeRunRecords(world, 'farmRegular').byClub[clubId]!.completedGames, 0);
});

test('球団記録：現在の所属から移し替えず、索引間と正本の参照も共有しない', () => {
  const world = zeroed(true);
  const game = Object.values(world.games)[0]!;
  const playerId = game.fixture.teams.away.lineup[0]!.playerId;
  const clubId = game.fixture.teams.away.clubId;
  game.result!.batting.find((row) => row.playerId === playerId)!.homeRuns = 2;
  const expected = singleGameHomeRunRecords(world);
  // 集計境界用の変更。実保存/エンジン入力には使わない。
  for (const squad of world.definitions.squads) {
    squad.players = [];
    squad.team.name = '現在の改称';
  }
  const before = structuredClone(world);
  const actual = singleGameHomeRunRecords(world);
  assert.deepEqual(actual, expected);
  actual.byClub[clubId]!.entries[0]!.display.playerName = '表示だけ変更';
  assert.notEqual(actual.overall.entries[0]!.display.playerName, '表示だけ変更');
  assert.deepEqual(world, before);
  assert.deepEqual(singleGameHomeRunRecords(world), expected);
});

test('球団記録：同じ選手の別試合の同率を残し、大会終了の日次確定まで暫定にする', () => {
  const world = zeroed(true);
  const match = world.definitions.schedule[0]!;
  const game = world.games[match.gameId]!;
  const playerId = game.fixture.teams.away.lineup[0]!.playerId;
  const clubId = game.fixture.teams.away.clubId;
  game.result!.batting.find((row) => row.playerId === playerId)!.homeRuns = 2;
  const another = { ...match, gameId: 'club-record-second-game', date: '2026-09-25' };
  world.definitions.schedule.push(another);
  world.games[another.gameId] = structuredClone(game);
  world.games[another.gameId]!.result!.gameId = another.gameId;
  world.statApplicationMarkers[another.gameId] = world.statApplicationMarkers[match.gameId]!;
  const own = () => singleGameHomeRunRecords(world).byClub[clubId]!;
  assert.equal(own().entries.length, 2);
  assert.equal(new Set(own().entries.map((e) => e.recordId)).size, 2);
  assert.equal(own().status, 'inProgress');
  world.definitions.schedule = world.definitions.schedule.filter((m) => world.games[m.gameId]);
  world.currentDate = '2026-10-01';
  assert.equal(own().status, 'inProgress');
  world.completedDates.push(world.definitions.endDate);
  assert.equal(own().status, 'final');
  world.games[another.gameId]!.result!.batting.find((row) => row.playerId === playerId)!.homeRuns =
    3;
  assert.equal(own().maximum, 3);
  assert.deepEqual(
    own().entries.map((e) => e.gameId),
    [another.gameId],
  );
});

test('球団記録：固定旧v19の全状態SHAを保ち、その保存内の試合から集計する', async () => {
  const world = JSON.parse(
    gunzipSync(
      readFileSync(new URL('./fixtures/world-v19-in-progress.json.gz', import.meta.url)),
    ).toString('utf8'),
  ) as WorldRecord;
  const before = await sha256(canonicalJson(world));
  assert.equal(before, 'd5d3ffb05563f11e039dbea7c5625673a73341a94deeaae2741ad6e7b815a823');
  const records = singleGameHomeRunRecords(world);
  assert.equal(
    records.overall.maximum,
    Math.max(...Object.values(records.byClub).map((r) => r.maximum ?? 0)) || null,
  );
  for (const record of Object.values(records.byClub)) {
    for (const entry of record.entries) assert.ok(world.games[entry.gameId]?.result);
  }
  assert.equal(await sha256(canonicalJson(world)), before);
});
