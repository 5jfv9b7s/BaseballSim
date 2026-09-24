import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createCurrentFixture } from '../src/data/datasets/current.ts';
import { players as awayPlayers } from '../src/data/players/hoshihara.ts';
import { repertoires as awayPitches } from '../src/data/repertoires/hoshihara.ts';
import { squad as awaySquad } from '../src/data/teams/hoshihara.ts';
const awayTeam = awaySquad.team;
import { createGame, runToCompletion, validateGameFixture } from '../src/game/engine.ts';
import { createGameFixture } from '../src/game/fixture.ts';
import { finalizeGame } from '../src/game/results.ts';
import { GameController } from '../src/game/controller.ts';
import { canonicalJson, sha256, validateCompletedRecord } from '../src/storage/codec.ts';
import { DexieStorageAdapter, GameDatabase } from '../src/storage/dexie-adapter.ts';
import type { GameFixture } from '../src/game/types.ts';

const baseline: GameFixture = JSON.parse(
  readFileSync(new URL('./fixtures/game-fixture-v2.json', import.meta.url), 'utf8'),
);

test('データ分離前のv10名簿と4seedの全記録を維持する', async () => {
  assert.deepEqual(createCurrentFixture(), baseline);
  const digests = JSON.parse(
    readFileSync(new URL('./fixtures/v10-digests.json', import.meta.url), 'utf8'),
  );
  for (const [seed, expected] of Object.entries(digests)) {
    // 凍結した名簿を使い、今後の新規データ編集と互換性試験を分離する。
    const game = createGame(Number(seed), baseline);
    runToCompletion(game);
    finalizeGame(game);
    assert.equal(await sha256(canonicalJson(game)), expected);
  }
});

test('編集元と開始済み試合を分離し、名簿変更後も保存内の選手・持ち球・編成で復元する', async () => {
  const db = new GameDatabase('data-snapshot-' + crypto.randomUUID());
  const storage = new DexieStorageAdapter(db);
  const legacy = createGameFixture();
  const game = createGame(3668339987);
  runToCompletion(game);
  finalizeGame(game);
  const original = structuredClone(game);
  await storage.commitSnapshot(game, 0);
  const player = structuredClone(awayPlayers[0]!);
  const pitch = structuredClone(awayPitches[0]!);
  const team = structuredClone(awayTeam);

  try {
    awayPlayers[0]!.familyName = '編集後';
    awayPlayers[0]!.powerVsRight.valueMilli = 110000;
    awayPitches[0]!.velocity.typicalCentiKph = 14000;
    awayTeam.name = '変更後球団';
    awayTeam.lineup.reverse();

    const next = createGame(3668339987);
    assert.equal(next.fixture.players[0]!.familyName, '編集後');
    assert.equal(next.fixture.teams.away.name, '変更後球団');
    assert.notDeepEqual(next.fixture, game.fixture);
    assert.deepEqual(game, original);
    assert.deepEqual(createGameFixture(), legacy);
    assert.deepEqual((await storage.loadSnapshot()).record, original);

    const controller = new GameController(storage);
    await controller.initialize();
    const loaded = await controller.dispatch({
      kind: 'load',
      previous: false,
      commandId: 'load',
      expectedStateRevision: 0,
    });
    assert.deepEqual(loaded.fixture, original.fixture);
    loaded.fixture.players[0]!.familyName = '表示用の改変';
    assert.deepEqual(controller.query().fixture, original.fixture);
  } finally {
    Object.assign(awayPlayers[0]!, player);
    Object.assign(awayPitches[0]!, pitch);
    Object.assign(awayTeam, team);
    await db.delete();
  }
});

test('追加投手・持ち球・打順を持つv10名簿を保存し、再実行と表示用名簿を再現する', async () => {
  const fixture = createCurrentFixture();
  const pitcher = structuredClone(fixture.players.find((p) => p.playerId === 'player-a-10')!);
  pitcher.playerId = 'player-a-13';
  pitcher.familyName = '追加';
  pitcher.givenName = '投手';
  fixture.players.push(pitcher);
  const pitch = structuredClone(fixture.pitches.find((p) => p.playerId === 'player-a-10')!);
  pitch.playerId = pitcher.playerId;
  pitch.pitchId = 'repertoire-player-a-13-fastball';
  fixture.pitches.push(pitch);
  fixture.teams.away.pitcherIds.unshift(pitcher.playerId);
  fixture.clubs
    .find((club) => club.clubId === fixture.teams.away.clubId)!
    .playerIds.push(pitcher.playerId);
  fixture.teams.away.lineup.reverse();

  const game = createGame(20260923, fixture);
  runToCompletion(game);
  finalizeGame(game);
  validateCompletedRecord(game);
  const db = new GameDatabase('added-player-' + crypto.randomUUID());
  try {
    const storage = new DexieStorageAdapter(db);
    await storage.commitSnapshot(game, 0);
    assert.deepEqual((await storage.loadSnapshot()).record, game);
    assert.ok(game.result!.pitching.find((row) => row.playerId === pitcher.playerId)!.pitches > 0);
  } finally {
    await db.delete();
  }
});

test('データ編集時のID重複・名簿参照・能力範囲・未対応球種・持ち球不足を拒否する', () => {
  const cases = [
    (f: GameFixture) => {
      f.players[1]!.playerId = f.players[0]!.playerId;
    },
    (f: GameFixture) => {
      f.teams.away.lineup[0]!.playerId = 'missing';
    },
    (f: GameFixture) => {
      f.players[0]!.fielding!.catching.valueMilli = 120001;
    },
    (f: GameFixture) => {
      f.pitches[0]!.pitchTypeCode = 'unknown' as never;
    },
    (f: GameFixture) => {
      f.pitches = f.pitches.filter((p) => p.playerId !== 'player-a-10');
    },
    (f: GameFixture) => {
      f.teams.away.pitcherIds = [];
    },
  ];
  for (const change of cases) {
    const fixture = createCurrentFixture();
    change(fixture);
    assert.throws(() => validateGameFixture(fixture));
  }
});

test('分離前の実v10保存を、現在の編集元とは独立して復元する', async () => {
  const frozen = JSON.parse(
    gunzipSync(
      readFileSync(new URL('./fixtures/completed-v10.json.gz', import.meta.url)),
    ).toString(),
  );
  const db = new GameDatabase('frozen-v10-' + crypto.randomUUID());
  const original = awayPlayers[0]!.familyName;
  try {
    for (const [name, rows] of Object.entries(frozen)) {
      await db.table(name).bulkPut(
        (rows as Record<string, unknown>[]).map((row) => ({
          ...row,
          ...(row.payloadBytes
            ? { payloadBytes: new Uint8Array(row.payloadBytes as number[]) }
            : {}),
        })),
      );
    }
    awayPlayers[0]!.familyName = '新しい苗字';
    const restored = (await new DexieStorageAdapter(db).loadSnapshot()).record;
    assert.deepEqual(restored.fixture, baseline);
    assert.deepEqual(restored.state.score, { away: 2, home: 3 });
  } finally {
    awayPlayers[0]!.familyName = original;
    await db.delete();
  }
});
