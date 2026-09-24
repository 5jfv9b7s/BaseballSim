import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { seasonConfig } from '../config/season.ts';
import { createAnnualDefinitions } from '../src/data/world/annual.ts';
import { createAnnualWorld, advanceWorld, completeDay, worldPhase } from '../src/world/engine.ts';
import { summarizeSeason } from '../src/world/season.ts';
import { WorldValidator, validateWorld } from '../src/world/validation.ts';
import { WorldDatabase, DexieWorldStorage } from '../src/world/dexie-storage.ts';
import { compress, decompress } from '../src/world/compression.ts';
import { canonicalJson, sha256 } from '../src/storage/codec.ts';
import { WorldController } from '../src/world/controller.ts';
import type { WorldRecord } from '../src/world/types.ts';

function finishDate(world: WorldRecord): WorldRecord {
  while (worldPhase(world) === 'playing') world = advanceWorld(world, 25);
  return completeDay(world, world.currentDate);
}

test('年間日程：144試合・ホーム/ビジター均等・ID一意・同日重複なし・設定の不正値拒否', () => {
  const definitions = createAnnualDefinitions();
  assert.equal(definitions.schedule.length, 144);
  assert.deepEqual(createAnnualDefinitions(), definitions);
  assert.equal(new Set(definitions.schedule.map((game) => game.gameId)).size, 144);
  for (const squad of definitions.squads) {
    assert.equal(
      definitions.schedule.filter((game) => game.homeSquadId === squad.squadId).length,
      36,
    );
    assert.equal(
      definitions.schedule.filter((game) => game.awaySquadId === squad.squadId).length,
      36,
    );
    const dates = definitions.schedule
      .filter((game) => [game.awaySquadId, game.homeSquadId].includes(squad.squadId))
      .map((game) => game.date);
    assert.equal(new Set(dates).size, dates.length);
    for (const other of definitions.squads.filter((item) => item !== squad)) {
      assert.equal(
        definitions.schedule.filter(
          (game) => game.homeSquadId === squad.squadId && game.awaySquadId === other.squadId,
        ).length,
        12,
      );
    }
  }
  assert.throws(() => createAnnualDefinitions({ ...seasonConfig, daysBetweenRounds: 0 }));
  assert.throws(() => createAnnualDefinitions({ ...seasonConfig, closingDate: '2026-04-01' }));
  assert.throws(() => createAnnualDefinitions({ ...seasonConfig, openingDate: '2026-02-30' }));
  assert.throws(() => createAnnualDefinitions({ ...seasonConfig, homeAwayCycles: 21 }));
});

test('年間検証キャッシュ：凍結した照合済み記録だけ再利用し、別編成・改変・余分な試合を拒否', () => {
  let world = finishDate(createAnnualWorld());
  const validator: WorldValidator = new WorldValidator();
  validator.validate(world);
  const game = Object.values(world.games)[0]!;
  assert.equal(Object.isFrozen(game.events[0]), true);
  assert.throws(() => {
    game.state.score.home++;
  }, TypeError);
  world = finishDate(world);
  validator.validate(world);
  const tampered = structuredClone(world);
  Object.values(tampered.games)[0]!.state.rng.drawCount++;
  assert.throws(() => validator.validate(tampered));
  const extra = structuredClone(world);
  extra.games['extra-game'] = game;
  assert.throws(() => validator.validate(extra));
  const changedSeed = { ...world, seed: world.seed + 1 };
  assert.throws(() => validator.validate(changedSeed), /再現/);
});

test('年間圧縮：完全復元・切断破損・過少/過大な展開宣言を拒否', async () => {
  const bytes = new TextEncoder().encode('年間記録'.repeat(1000));
  const packed = await compress(bytes);
  assert.ok(packed.length < bytes.length);
  assert.deepEqual(await decompress(packed, bytes.length), bytes);
  await assert.rejects(decompress(packed, bytes.length - 1));
  await assert.rejects(decompress(packed, bytes.length + 1));
  await assert.rejects(decompress(packed.slice(0, 12), bytes.length));
  await assert.rejects(decompress(packed, 17 * 1024 * 1024));
});

test('年間完走：全日次・144試合・各72試合・年度要約・圧縮保存と再実行復元', async () => {
  const db = new WorldDatabase('annual-full-' + crypto.randomUUID());
  const storage = new DexieWorldStorage(db);
  let world: WorldRecord = createAnnualWorld();
  assert.throws(() => summarizeSeason(world), /終了/);
  try {
    while (worldPhase(world) !== 'scheduleComplete') world = finishDate(world);
    assert.equal(world.version, 'world-prototype-v3');
    assert.equal(world.currentDate, '2026-10-01');
    assert.equal(world.completedDates.length, 188);
    assert.equal(Object.keys(world.games).length, 144);
    assert.equal(Object.keys(world.statApplicationMarkers).length, 144);
    assert.ok(world.stats.teams.every((row) => row.games === 72));
    assert.equal(
      world.stats.teams.reduce((sum, row) => sum + row.runsFor, 0),
      world.stats.teams.reduce((sum, row) => sum + row.runsAgainst, 0),
    );
    if (world.version !== 'world-prototype-v3') throw new Error('annual world expected');
    assert.deepEqual(world.seasonSummary, summarizeSeason(world));
    const summary = structuredClone(world.seasonSummary);
    assert.throws(() => completeDay(world, world.currentDate));
    assert.deepEqual(world.seasonSummary, summary);
    await storage.save(world, 1, 'auto', 0);
    const blocks = await db.save_blocks.toArray();
    assert.ok(blocks.every((block) => block.codec === 'gzip'));
    const raw = blocks.reduce((sum, block) => sum + block.rawBytes, 0);
    const compressed = blocks.reduce((sum, block) => sum + block.payloadBytes.length, 0);
    assert.ok(compressed < raw / 2);
    const restored = (await new DexieWorldStorage(db).load('auto')).world;
    const { games: restoredGames, ...restoredCore } = restored;
    const { games: originalGames, ...originalCore } = world;
    assert.deepEqual(restoredCore, originalCore);
    assert.deepEqual(Object.keys(restoredGames).sort(), Object.keys(originalGames).sort());
    for (const gameId of Object.keys(originalGames)) {
      assert.equal(
        await sha256(canonicalJson(restoredGames[gameId])),
        await sha256(canonicalJson(originalGames[gameId])),
      );
    }
    const tampered = structuredClone(world);
    if (tampered.version === 'world-prototype-v3') tampered.seasonSummary!.games--;
    assert.throws(() => validateWorld(tampered), /一致/);
    console.log('年間保存（bytes）:', { raw, compressed, games: 144 });
  } finally {
    await db.delete();
  }
});

test('年度要約：同率首位を勝手に優勝1球団へ絞らず、集計と独立した確定コピーを残す', () => {
  const defs = createAnnualDefinitions();
  defs.schedule = [];
  defs.endDate = defs.startDate;
  let world: WorldRecord = finishDate(createAnnualWorld(42, undefined, defs));
  if (world.version !== 'world-prototype-v3') throw new Error('annual world expected');
  assert.equal(world.seasonSummary!.title.status, 'unresolved');
  world.stats.teams.forEach((row) => {
    row.wins = 1;
    row.games = 1;
  });
  const summary = summarizeSeason(world);
  assert.deepEqual(summary.title, {
    status: 'unresolved',
    squadIds: summary.clubs.map((row) => row.squadId),
  });
  world.stats.teams[0]!.wins++;
  assert.equal(summary.stats.teams[0]!.wins, 1);
});

test('年間互換性：5346d42の実v0.3保存と途中再開を維持する', async () => {
  const fixture = JSON.parse(
    gunzipSync(readFileSync(new URL('./fixtures/world-v2-save.json.gz', import.meta.url))).toString(
      'utf8',
    ),
  );
  assert.equal(fixture.digest, '0f4b3cea4b96ba3e968fc7226f819b6722677c34727c07a448553e5a4fa88c6c');
  const db = new WorldDatabase('annual-legacy-' + crypto.randomUUID());
  try {
    for (const table of db.tables) {
      await table.bulkPut(
        fixture.tables[table.name].map((row: Record<string, unknown>) =>
          table.name === 'save_blocks'
            ? { ...row, payloadBytes: new Uint8Array(row.payloadBytes as number[]) }
            : row,
        ),
      );
    }
    const storage = new DexieWorldStorage(db);
    const saved = await storage.load('auto');
    assert.equal(saved.world.version, 'world-prototype-v2');
    assert.equal(await sha256(canonicalJson(saved.world)), fixture.digest);
    const manual = await storage.load('manual');
    assert.equal(await sha256(canonicalJson(finishDate(manual.world))), fixture.digest);
  } finally {
    await db.delete();
  }
});

test('年度末Controller：保存失敗では要約と翌日を公開せず、再試行で一度だけ確定する', async () => {
  const defs = createAnnualDefinitions();
  defs.schedule = [];
  defs.endDate = defs.startDate;
  const initial = createAnnualWorld(42, undefined, defs);
  const db = new WorldDatabase('annual-failure-' + crypto.randomUUID());
  const storage = new DexieWorldStorage(db);
  try {
    await storage.save(initial, 1, 'manual', 0);
    const controller = new WorldController(storage);
    await controller.initialize();
    const loaded = await controller.dispatch({
      kind: 'load',
      slot: 'manual',
      commandId: 'load',
      localWorldId: 'v02-local',
      expectedStateRevision: 0,
    });
    const command = {
      kind: 'completeDay' as const,
      date: loaded.currentDate,
      commandId: 'finish',
      localWorldId: 'v02-local' as const,
      expectedStateRevision: loaded.revision,
    };
    const fail = () => {
      throw new Error('quota failure');
    };
    db.save_snapshots.hook('creating', fail);
    await assert.rejects(controller.dispatch(command), /quota failure/);
    assert.equal(controller.query().seasonSummary, null);
    assert.equal(controller.query().currentDate, initial.currentDate);
    db.save_snapshots.hook('creating').unsubscribe(fail);
    const complete = await controller.dispatch(command);
    assert.equal(complete.phase, 'scheduleComplete');
    assert.ok(complete.seasonSummary);
    assert.deepEqual(await controller.dispatch(command), complete);
    assert.equal((await storage.listSlots()).storageRevision, 2);
  } finally {
    await db.delete();
  }
});

test('年間圧縮保存：破損した自動枠を拒否し、手動枠は復旧できる', async () => {
  const db = new WorldDatabase('annual-corruption-' + crypto.randomUUID());
  const storage = new DexieWorldStorage(db);
  try {
    const start = createAnnualWorld();
    await storage.save(start, 1, 'manual', 0);
    const completed = finishDate(start);
    await storage.save(completed, 2, 'auto', 1);
    const block = (await db.save_blocks.toArray()).find((item) => item.kind === 'game')!;
    await db.save_blocks.update(block.blockId, { payloadBytes: block.payloadBytes.slice(0, 8) });
    await assert.rejects(storage.load('auto'));
    assert.deepEqual((await storage.load('manual')).world, start);
    await assert.rejects(storage.save(completed, 3, 'auto', 2), /破損/);
    assert.equal((await storage.listSlots()).storageRevision, 2);
  } finally {
    await db.delete();
  }
});

test('期間指示：応答キャッシュを超えた古い再送でも二重進行しない', async () => {
  const db = new WorldDatabase('annual-command-cache-' + crypto.randomUUID());
  const controller = new WorldController(new DexieWorldStorage(db));
  try {
    let view = await controller.initialize();
    const command = {
      kind: 'advance' as const,
      count: 1,
      commandId: 'first',
      localWorldId: 'v02-local' as const,
      expectedStateRevision: view.revision,
    };
    view = await controller.dispatch(command);
    for (let index = 0; index < 20; index++) {
      view = await controller.dispatch({
        ...command,
        commandId: 'later-' + index,
        expectedStateRevision: view.revision,
      });
    }
    assert.deepEqual(await controller.dispatch(command), view);
    assert.deepEqual(controller.query(), view);
    await assert.rejects(controller.dispatch({ ...command, count: 2 }), /内容が異なります/);
  } finally {
    await db.delete();
  }
});
