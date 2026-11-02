import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { canonicalJson, sha256 } from '../src/storage/codec.ts';
import { consecutiveGameHits } from '../src/world/hit-streaks.ts';
import { WorldController } from '../src/world/controller.ts';
import { WorldDatabase, DexieWorldStorage } from '../src/world/dexie-storage.ts';
import {
  createWorld,
  createBullpenWorld,
  advanceWorld,
  completeDay,
  worldPhase,
} from '../src/world/engine.ts';
import { gameScope } from '../src/world/squads.ts';
import type { WorldRecord } from '../src/world/types.ts';

function finishDay(world: WorldRecord) {
  while (worldPhase(world) === 'playing') world = advanceWorld(world, 25);
  return completeDay(world, world.currentDate);
}
let played: WorldRecord;
function sample() {
  return (played ??= finishDay(createWorld()));
}

// 算定の境界を作るための結果投影。エンジン・保存の検査には使わない。
function series(values: (number | null)[]) {
  const world = structuredClone(sample());
  const match = world.definitions.schedule[0]!;
  const original = world.games[match.gameId]!;
  const playerId = original.fixture.teams.away.lineup[0]!.playerId;
  const teammate = original.fixture.teams.away.lineup[1]!.playerId;
  const opponent = original.fixture.teams.home.lineup[0]!.playerId;
  const clubId = original.fixture.teams.away.clubId;
  world.games = {};
  world.statApplicationMarkers = {};
  world.definitions.schedule = values.map((hits, i) => {
    const gameId = 'streak-game-' + String(i).padStart(2, '0');
    const date = '2026-09-' + String(24 + i).padStart(2, '0');
    const game = structuredClone(original);
    game.result!.gameId = gameId;
    for (const row of game.result!.batting) {
      row.atBats = 0;
      row.hits = 0;
      row.plateAppearances = 0;
    }
    const row = game.result!.batting.find((r) => r.playerId === playerId)!;
    if (hits === null) game.result!.batting = game.result!.batting.filter((r) => r !== row);
    else {
      row.hits = hits;
      row.atBats = Math.max(1, hits);
      row.plateAppearances = row.atBats;
    }
    world.games[gameId] = game;
    world.statApplicationMarkers[gameId] = {
      attemptNo: 1,
      resultRevision: 1,
      contributionHash: 'projected',
    };
    return { ...match, date, gameId };
  });
  const person = () =>
    consecutiveGameHits(world).overall.players.find((p) => p.playerId === playerId)!;
  return { world, playerId, teammate, opponent, clubId, person };
}

test('連続試合安打：未観測・安打なし・未対応大会を0試合の達成者で補わない', () => {
  const empty = consecutiveGameHits(createWorld());
  assert.equal(empty.overall.maximum, null);
  assert.deepEqual(empty.overall.players, []);
  assert.equal(empty.overall.completedGames, 0);
  assert.throws(() => consecutiveGameHits(createWorld(), 'farmRegular'), /大会/);
  const { world } = series([0, 0]);
  assert.equal(consecutiveGameHits(world).overall.maximum, null);
  assert.ok(Object.values(consecutiveGameHits(world).byClub).every((r) => r.maximum === null));
});

test('連続試合安打：複数安打は+1、欠場・四死球のみ・犠飛のみは維持、打数あり無安打で終了', () => {
  const { world, playerId, person } = series([1, 3, null, 0, 0, 0, 0, 2]);
  for (const [index, field] of [
    [3, 'walks'],
    [4, 'hitByPitch'],
    [5, 'sacrificeFlies'],
  ] as const) {
    const row = world.games[world.definitions.schedule[index]!.gameId]!.result!.batting.find(
      (b) => b.playerId === playerId,
    )!;
    row.atBats = 0;
    row.plateAppearances = 1;
    row[field] = 1;
  }
  const record = person();
  assert.equal(record.maximum, 2);
  assert.equal(record.longest.length, 1);
  assert.equal(record.longest[0]!.status, 'ended');
  assert.equal(record.longest[0]!.lastHit.gameId, 'streak-game-01');
  assert.equal(record.longest[0]!.endedBy!.gameId, 'streak-game-06');
  assert.equal(record.current!.length, 1);
  assert.equal(record.current!.start.gameId, 'streak-game-07');
});

test('連続試合安打：同率の全選手・同一選手の全期間、現在と自己最長、球団内の独立最多', () => {
  const { world, playerId, teammate, opponent, clubId, person } = series([1, 1, 0, 1, 1]);
  for (const [i, match] of world.definitions.schedule.entries()) {
    const lines = world.games[match.gameId]!.result!.batting;
    for (const [id, count] of [
      [teammate, i < 2 ? 1 : 0],
      [opponent, i < 3 ? 1 : 0],
    ] as const) {
      const row = lines.find((r) => r.playerId === id)!;
      row.hits = count;
      row.atBats = 1;
    }
  }
  const records = consecutiveGameHits(world);
  assert.equal(records.overall.maximum, 3);
  assert.equal(records.byClub[clubId]!.maximum, 2);
  assert.deepEqual(
    new Set(records.byClub[clubId]!.players.map((p) => p.playerId)),
    new Set([playerId, teammate]),
  );
  const player = person();
  assert.equal(player.maximum, 2);
  assert.equal(player.current!.length, 2);
  assert.deepEqual(
    player.longest.map((p) => p.status),
    ['ended', 'ongoing'],
  );
  assert.equal(new Set(player.longest.map((p) => p.recordId)).size, 2);
});

test('連続試合安打：途中・中断・未反映は長さや終了の根拠にせず、結果版不一致を検出', () => {
  for (const phase of ['readyForPitch', 'aborted'] as const) {
    const { world, person } = series([1, 0, 1]);
    world.games['streak-game-01']!.state.phase = phase;
    assert.equal(person().current!.length, 2);
  }
  const { world, person } = series([1, 0, 1]);
  const marker = world.statApplicationMarkers['streak-game-01']!;
  delete world.statApplicationMarkers['streak-game-01'];
  assert.equal(person().current!.length, 2);
  world.statApplicationMarkers['streak-game-01'] = marker;
  world.games['streak-game-01']!.result!.resultRevision = 2 as never;
  assert.throws(() => person(), /確定版/);
});

test('連続試合安打：日付・同日試合ID順を使い、日程配列を変更せず同率の期間順も固定', () => {
  const { world, person } = series([1, 0, 1]);
  for (const match of world.definitions.schedule) match.date = '2026-09-24';
  const expected = person();
  world.definitions.schedule.reverse();
  const before = structuredClone(world);
  assert.deepEqual(person(), expected);
  assert.deepEqual(world, before);
  assert.deepEqual(
    expected.longest.map((e) => e.lastHit.gameId),
    ['streak-game-00', 'streak-game-02'],
  );
});

test('連続試合安打：当時の氏名・所属・相手を保持し、正本・全体/球団・現在/最長を分離', () => {
  const { world, clubId, person } = series([1, 1]);
  const before = consecutiveGameHits(world);
  for (const squad of world.definitions.squads) {
    squad.players = [];
    squad.team.name = '現在の別名';
  }
  assert.deepEqual(consecutiveGameHits(world), before);
  const snapshot = structuredClone(world);
  const copy = consecutiveGameHits(world);
  copy.overall.players[0]!.current!.lastHit.display.playerName = '別表示';
  assert.deepEqual(copy.overall.players[0]!.longest, before.overall.players[0]!.longest);
  copy.byClub[clubId]!.players[0]!.longest[0]!.lastHit.display.teamName = '別球団';
  assert.deepEqual(world, snapshot);
  assert.deepEqual(person(), before.overall.players[0]);
  assert.deepEqual(consecutiveGameHits(world), before);
});

test('連続試合安打：安打時点の所属で球団を分け、現在の編成で過去の所属を書換えない', () => {
  const { world, clubId, playerId } = series([1, 1]);
  const game = world.games['streak-game-01']!;
  const homeId = game.fixture.teams.home.clubId;
  game.fixture.clubs.find((c) => c.clubId === clubId)!.playerIds = game.fixture.clubs
    .find((c) => c.clubId === clubId)!
    .playerIds.filter((id) => id !== playerId);
  game.fixture.clubs.find((c) => c.clubId === homeId)!.playerIds.push(playerId);
  const records = consecutiveGameHits(world);
  assert.equal(records.overall.players[0]!.current!.length, 2);
  assert.equal(records.byClub[homeId]!.maximum, 2);
  assert.equal(records.byClub[clubId]!.maximum, null);
});

test('連続試合安打：一二軍を混ぜず、最終日確定後の継続は無安打終了と区別する', () => {
  const world = finishDay(createBullpenWorld(1));
  for (const match of world.definitions.schedule) {
    const game = world.games[match.gameId];
    if (game)
      for (const row of game.result!.batting) {
        row.hits = gameScope(world.definitions, match) === 'farmRegular' ? 1 : 0;
        row.atBats = 1;
      }
  }
  assert.equal(consecutiveGameHits(world).overall.maximum, null);
  const farm = () => consecutiveGameHits(world, 'farmRegular').overall;
  assert.equal(farm().maximum, 1);
  world.definitions.schedule = world.definitions.schedule.filter((m) => world.games[m.gameId]);
  world.currentDate = '2026-10-01';
  assert.equal(farm().status, 'inProgress');
  world.completedDates.push(world.definitions.farm!.endDate);
  assert.equal(farm().status, 'final');
  assert.ok(
    farm().players.every(
      (p) => p.current!.status === 'seasonClosed' && p.current!.endedBy === null,
    ),
  );
  assert.equal(consecutiveGameHits(world).overall.status, 'inProgress');
  const { world: ended, person } = series([1, 0]);
  ended.currentDate = '2026-10-01';
  ended.completedDates.push(ended.definitions.endDate);
  assert.equal(person().current, null);
  assert.equal(person().longest[0]!.status, 'ended');
});

test('連続試合安打：実試合のDB/バックアップ復元・巻戻し・Worker照会は記録と正本を分離', async () => {
  const db = new WorldDatabase('hit-streaks-' + crypto.randomUUID());
  try {
    const storage = new DexieWorldStorage(db);
    let slots = await storage.save(createWorld(), 1, 'manual', 0);
    slots = await storage.save(sample(), 2, 'auto', slots.storageRevision);
    const expected = consecutiveGameHits(sample());
    assert.ok(expected.overall.players.length > 0);
    assert.deepEqual(consecutiveGameHits((await storage.load('auto')).world), expected);
    const controller = new WorldController(storage);
    let view = await controller.initialize();
    const load = async (slot: 'auto' | 'manual') => {
      view = await controller.dispatch({
        kind: 'load',
        slot,
        localWorldId: 'v02-local',
        commandId: 'streak-load-' + slot + view.revision,
        expectedStateRevision: view.revision,
      });
    };
    await load('auto');
    assert.deepEqual(view.hitStreaks.firstRegular, expected);
    assert.equal(view.hitStreaks.farmRegular, null);
    const savedSlots = await storage.listSlots();
    view.hitStreaks.firstRegular.overall.players[0]!.maximum = 999;
    assert.deepEqual(controller.query().hitStreaks.firstRegular, expected);
    assert.deepEqual(await storage.listSlots(), savedSlots);
    await load('manual');
    assert.equal(view.hitStreaks.firstRegular.overall.maximum, null);
    await load('auto');
    assert.deepEqual(view.hitStreaks.firstRegular, expected);
    const importedId = await storage.importSnapshot(
      await storage.exportSnapshot('auto'),
      crypto.randomUUID(),
    );
    const restored = await new DexieWorldStorage(db, importedId).load('manual');
    assert.deepEqual(consecutiveGameHits(restored.world), expected);
  } finally {
    await db.delete();
  }
});

test('連続試合安打：独立固定の旧v19保存を再計算せず全状態SHAを保持', async () => {
  const world = JSON.parse(
    gunzipSync(
      readFileSync(new URL('./fixtures/world-v19-in-progress.json.gz', import.meta.url)),
    ).toString('utf8'),
  ) as WorldRecord;
  const before = await sha256(canonicalJson(world));
  assert.equal(before, 'd5d3ffb05563f11e039dbea7c5625673a73341a94deeaae2741ad6e7b815a823');
  const index = consecutiveGameHits(world);
  for (const p of index.overall.players)
    for (const e of p.longest) {
      const game = world.games[e.lastHit.gameId]!;
      assert.ok(game.result!.batting.find((b) => b.playerId === p.playerId)!.hits > 0);
      assert.ok(e.endedBy === null || world.games[e.endedBy.gameId]);
    }
  assert.equal(await sha256(canonicalJson(world)), before);
});
