import test from 'node:test';
import { completedRecordDay } from './record-sample.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { canonicalJson, sha256 } from '../src/storage/codec.ts';
import { consecutiveHitlessAtBats } from '../src/world/hitless-streaks.ts';
import type { WorldRecord } from '../src/world/types.ts';
import type { GameEvent } from '../src/game/types.ts';

function original(): WorldRecord {
  return JSON.parse(
    gunzipSync(
      readFileSync(new URL('./fixtures/world-v19-in-progress.json.gz', import.meta.url)),
    ).toString('utf8'),
  );
}
// 打席順の境界専用の投影。改変した試合を保存互換の検体には使わない。
function sequence(outcomes: GameEvent['outcome'][]) {
  const world = completedRecordDay();
  const match = world.definitions.schedule.find(
    (m) => world.games[m.gameId]?.result && world.games[m.gameId]?.state.phase === 'gameComplete',
  )!;
  const game = world.games[match.gameId]!;
  const template = game.events.find((e) => e.pitch && e.outcome)!;
  const playerId = game.fixture.teams.away.lineup[0]!.playerId;
  game.events = outcomes.map((outcome) => ({
    ...structuredClone(template),
    pitch: { ...template.pitch!, batterId: playerId },
    outcome,
  }));
  world.definitions.schedule = [match];
  world.games = { [match.gameId]: game };
  const person = () =>
    consecutiveHitlessAtBats(world).overall.players.find((p) => p.playerId === playerId)!;
  return { world, game, match, person, playerId };
}

test('連続打数無安打：四死球・犠飛・未完了打席を除外し、安打で終了する', () => {
  const { person } = sequence([
    'strikeout',
    'walk',
    'hitByPitch',
    'sacrificeFly',
    null,
    'battedOut',
    'single',
    'strikeout',
  ]);
  const p = person();
  assert.equal(p.maximum, 2);
  assert.equal(p.current!.length, 1);
  assert.equal(p.longest[0]!.status, 'ended');
  assert.equal(p.longest[0]!.endedBy!.outcome, 'single');
  assert.equal(p.longest[0]!.lastAtBat.eventIndex, 5);
});
test('連続打数無安打：同一試合の全同率期間を別IDで保持、野手選択・失策出塁も打数', () => {
  const { person } = sequence([
    'fieldersChoice',
    'reachedOnError',
    'homeRun',
    'strikeout',
    'battedOut',
  ]);
  const p = person();
  assert.equal(p.maximum, 2);
  assert.equal(p.longest.length, 2);
  assert.notEqual(p.longest[0]!.recordId, p.longest[1]!.recordId);
  assert.equal(p.longest[1]!.status, 'ongoing');
});
test('連続打数無安打：0件の達成者を作らず、未確定結果を読まない', () => {
  const { world, game } = sequence(['single', 'double', 'triple', 'homeRun', 'walk']);
  assert.equal(consecutiveHitlessAtBats(world).overall.maximum, null);
  game.events[0]!.outcome = 'strikeout';
  game.state.phase = 'readyForPitch';
  assert.equal(consecutiveHitlessAtBats(world).overall.completedGames, 0);
});
test('連続打数無安打：試合間で接続、同日ID順、試合結果の版違いは拒否', () => {
  const { world, game, match, person } = sequence(['strikeout', 'battedOut']);
  const clone = structuredClone(game),
    gameId = 'zz-hitless';
  clone.result!.gameId = gameId;
  world.games[gameId] = clone;
  world.statApplicationMarkers[gameId] = structuredClone(
    world.statApplicationMarkers[match.gameId]!,
  );
  world.definitions.schedule.unshift({ ...match, gameId });
  assert.equal(person().maximum, 4);
  assert.equal(person().current!.lastAtBat.gameId, gameId);
  world.statApplicationMarkers[gameId]!.resultRevision++;
  assert.throws(() => person(), /確定版/);
});
test('連続打数無安打：球団内の独立最長、終了時の継続、一二軍の分離', () => {
  const { world, game, person, match } = sequence(['strikeout', 'single', 'battedOut']);
  const clubId = game.fixture.teams.away.clubId;
  world.currentDate = '2026-10-01';
  world.completedDates.push(world.definitions.endDate);
  assert.equal(person().current!.status, 'seasonClosed');
  assert.equal(person().longest[0]!.status, 'ended');
  assert.equal(consecutiveHitlessAtBats(world).byClub[clubId]!.maximum, 1);
  assert.equal(consecutiveHitlessAtBats(world, 'farmRegular').overall.maximum, null);
  const home = game.fixture.teams.home.lineup[0]!.playerId;
  game.events.push({
    ...structuredClone(game.events[0]!),
    pitch: { ...game.events[0]!.pitch!, batterId: home },
  });
  assert.equal(consecutiveHitlessAtBats(world).overall.players.length, 2);
  assert.ok(person().longest.every((e) => e.lastAtBat.gameId === match.gameId));
});
test('連続打数無安打：独立固定の旧保存のSHAと当時情報を維持、返却値を分離', async () => {
  const world = original(),
    before = await sha256(canonicalJson(world));
  assert.equal(before, 'd5d3ffb05563f11e039dbea7c5625673a73341a94deeaae2741ad6e7b815a823');
  assert.equal(consecutiveHitlessAtBats(world).overall.maximum, null);
  const played = completedRecordDay();
  const playedBefore = canonicalJson(played);
  const record = consecutiveHitlessAtBats(played);
  assert.ok(record.overall.players.length > 0);
  const p = record.overall.players[0]!;
  const point = p.longest[0]!.lastAtBat;
  const player = played.games[point.gameId]!.fixture.players.find(
    (p) => p.playerId === point.playerId,
  )!;
  assert.equal(point.display.playerName, player.familyName + ' ' + player.givenName);
  p.longest[0]!.length = 999;
  assert.notEqual(consecutiveHitlessAtBats(played).overall.players[0]!.maximum, 999);
  assert.equal(canonicalJson(played), playedBefore);
  assert.equal(await sha256(canonicalJson(world)), before);
});
