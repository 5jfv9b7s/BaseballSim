import type { PitchRecord } from '../src/engine/types.ts';
import { generateBattedBall } from '../src/game/batted-ball.ts';
import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import {
  createGame,
  runToCompletion,
  advanceGameEvent,
  resolveAppearance,
} from '../src/game/engine.ts';
import { finalizeGame } from '../src/game/results.ts';
import { canonicalJson, sha256, validateCompletedRecord } from '../src/storage/codec.ts';
import { GameDatabase, DexieStorageAdapter } from '../src/storage/dexie-adapter.ts';
import { fielderTravel, fielderTravelTime, launchAngle } from '../src/game/batted-ball-v2.ts';
import { hitDestinations } from '../src/game/running.ts';
import type { BattedBall, Runner } from '../src/game/types.ts';

test('変更前に固定した4条件のv1全記録ハッシュを維持する', async () => {
  const digests = JSON.parse(
    readFileSync(new URL('./fixtures/v1-digests.json', import.meta.url), 'utf8'),
  );
  for (const [seed, digest] of Object.entries(digests)) {
    const record = createGame(Number(seed), undefined, 'game-prototype-v1');
    runToCompletion(record);
    finalizeGame(record);
    assert.equal(await sha256(canonicalJson(record)), digest);
    validateCompletedRecord(record);
  }
});

test('変更前の実セーブを復元し、v2保存後も前保存を同じv1として復元する', async () => {
  const frozen = JSON.parse(
    gunzipSync(
      readFileSync(new URL('./fixtures/completed-v1.json.gz', import.meta.url)),
    ).toString(),
  );
  const db = new GameDatabase('legacy-' + crypto.randomUUID());
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
    const storage = new DexieStorageAdapter(db);
    const old = (await storage.loadSnapshot()).record;
    assert.equal(old.kind, 'completed-game-prototype-v1');
    assert.equal(old.state.totalPitches, 234);
    assert.deepEqual(old.state.score, { away: 0, home: 0 });
    const next = createGame(20260923, undefined, 'game-prototype-v2');
    runToCompletion(next);
    finalizeGame(next);
    await storage.commitSnapshot(next, 1);
    assert.deepEqual((await storage.loadSnapshot()).record, next);
    assert.deepEqual((await storage.loadSnapshot(true)).record, old);
    assert.equal(await db.save_snapshots.count(), 2);
    const mislabeled = structuredClone(next);
    mislabeled.state.simulationVersion = 'game-prototype-v1';
    assert.throws(() => validateCompletedRecord(mislabeled), /一致しません/);
  } finally {
    await db.delete();
  }
});

test('守備は停止状態から加速し、移動時間は距離の逆関数になる', () => {
  assert.equal(fielderTravel(0, 8), 0);
  assert.equal(fielderTravel(1, 8), 4);
  assert.equal(fielderTravel(2, 8), 12);
  for (const speed of [4, 6, 8])
    for (const time of [0.2, 0.5, 1, 2, 5]) {
      const distance = fielderTravel(time, speed);
      assert.ok(distance <= speed * time);
      assert.ok(Math.abs(fielderTravelTime(distance, speed) - time) < 1e-10);
    }
  assert.equal(launchAngle(0), -45);
  assert.equal(launchAngle(50 / 120), 5);
  assert.equal(launchAngle(1), 75);
});

function runnerCase() {
  const game = createGame();
  const { event } = advanceGameEvent(game.state, game.fixture);
  const batter = game.fixture.teams.away.lineup[0]!.playerId;
  const pitcher = game.fixture.teams.home.pitcherIds[0]!;
  const runner = (i: number): Runner => ({
    runInstanceId: 'run-' + i,
    currentRunnerId: game.fixture.teams.away.lineup[i]!.playerId,
    originalRunnerId: game.fixture.teams.away.lineup[i]!.playerId,
    responsiblePitcherId: pitcher,
    reachedEventSeq: i,
    reachedReason: 'single',
  });
  // 走塁判断が参照する返球時間だけを用意する固定入力。
  const ball = { returnTimeMs: { second: 7200, third: 7200, home: 7200 } } as BattedBall;
  return { game, event, batter, pitcher, runner, ball };
}

test('単打の追加進塁は走力と返球時間で決まり、前走者を追い越さない', () => {
  const { game, runner, ball } = runnerCase();
  const lead = runner(2);
  game.state.baseOccupants = [null, lead, null];
  const player = game.fixture.players.find((p) => p.playerId === lead.currentRunnerId)!;
  player.runningSpeed = { valueMilli: 0, ceilingMilli: 120000 };
  assert.equal(hitDestinations(game.state, game.fixture, 1, ball)[1], 3);
  player.runningSpeed.valueMilli = 120000;
  assert.equal(hitDestinations(game.state, game.fixture, 1, ball)[1], 4);
  player.runningSpeed.valueMilli = 0;
  game.state.baseOccupants[0] = runner(1);
  game.fixture.players.find((p) => p.playerId === runner(1).currentRunnerId)!.runningSpeed = {
    valueMilli: 120000,
    ceilingMilli: 120000,
  };
  assert.deepEqual(hitDestinations(game.state, game.fixture, 1, ball), [2, 3, 0]);
});

test('追加進塁の得点を責任投手へ付け、サヨナラで後続の得点を打ち切る', () => {
  const { game, event, batter, pitcher, runner, ball } = runnerCase();
  game.state.baseOccupants = [null, runner(2), null];
  game.fixture.players.find((p) => p.playerId === runner(2).currentRunnerId)!.runningSpeed = {
    valueMilli: 120000,
    ceilingMilli: 120000,
  };
  event.battedBall = ball;
  event.credits = [];
  resolveAppearance(game.state, event, game.fixture, 'single', batter, pitcher);
  assert.equal(game.state.score.away, 1);
  assert.equal(event.runDecisions[0]!.responsiblePitcherId, pitcher);
  assert.equal(event.credits.find((c) => c.metricCode === 'runsBattedIn')!.amount, 1);

  const h = runnerCase();
  h.game.state.inning = 9;
  h.game.state.half = 'bottom';
  h.game.state.innings = { away: Array(9).fill(0), home: Array(9).fill(0) };
  h.game.state.baseOccupants = [1, 2, 3].map((i) => ({
    ...h.runner(i),
    currentRunnerId: h.game.fixture.teams.home.lineup[i]!.playerId,
    originalRunnerId: h.game.fixture.teams.home.lineup[i]!.playerId,
    responsiblePitcherId: h.game.fixture.teams.away.pitcherIds[0]!,
  })) as typeof h.game.state.baseOccupants;
  h.event.battedBall = { ...h.ball, returnTimeMs: { second: 20000, third: 20000, home: 20000 } };
  resolveAppearance(
    h.game.state,
    h.event,
    h.game.fixture,
    'double',
    h.game.fixture.teams.home.lineup[0]!.playerId,
    h.game.fixture.teams.away.pitcherIds[0]!,
  );
  assert.equal(h.game.state.endReason, 'walkOff');
  assert.equal(h.game.state.score.home, 1);
  assert.equal(h.event.runDecisions.length, 1);
  assert.ok(h.game.state.baseOccupants.every(Boolean));
});

test('未知モデルを新規試合の入力として受け付けない', () => {
  assert.throws(() => createGame(1, undefined, 'unknown' as never), /未対応/);
});

test('同一の投球・乱数でパワーは打球速度、守備範囲は到達判定へ寄与する', () => {
  const game = createGame();
  const pitch = advanceGameEvent(game.state, game.fixture).event.pitch! as PitchRecord;
  const low = structuredClone(game.fixture);
  const high = structuredClone(game.fixture);
  for (const p of low.players) p.fieldingRange = { valueMilli: 0, ceilingMilli: 120000 };
  for (const p of high.players) p.fieldingRange = { valueMilli: 120000, ceilingMilli: 120000 };
  let lowOuts = 0;
  let highOuts = 0;
  for (let i = 1; i <= 200; i++) {
    const rng = { ...game.state.rng, fullState: { word: Math.imul(i, 2654435761) >>> 0 } };
    const a = generateBattedBall(pitch, low, 'home', rng);
    const b = generateBattedBall(pitch, high, 'home', rng);
    assert.deepEqual(a.rng, b.rng);
    assert.equal(a.ball.exitVelocityCentiKph, b.ball.exitVelocityCentiKph);
    assert.equal(a.ball.launchAngleCentiDegree, b.ball.launchAngleCentiDegree);
    if (a.ball.projectedBases === 0) assert.equal(b.ball.projectedBases, 0);
    lowOuts += a.ball.projectedBases === 0 ? 1 : 0;
    highOuts += b.ball.projectedBases === 0 ? 1 : 0;
  }
  assert.ok(highOuts > lowOuts);
  const batter = high.players.find((p) => p.playerId === pitch.batterId)!;
  batter.powerVsRight = batter.powerVsLeft = { valueMilli: 0, ceilingMilli: 120000 };
  const a = generateBattedBall(pitch, high, 'home', game.state.rng);
  batter.powerVsRight = batter.powerVsLeft = { valueMilli: 120000, ceilingMilli: 120000 };
  const b = generateBattedBall(pitch, high, 'home', game.state.rng);
  assert.equal(b.ball.exitVelocityCentiKph - a.ball.exitVelocityCentiKph, 5500);
  assert.deepEqual(a.rng, b.rng);
});

test('変更前に固定した4条件のv2全記録ハッシュを維持する', async () => {
  const digests = JSON.parse(
    readFileSync(new URL('./fixtures/v2-digests.json', import.meta.url), 'utf8'),
  );
  for (const [seed, digest] of Object.entries(digests)) {
    const record = createGame(Number(seed), undefined, 'game-prototype-v2');
    runToCompletion(record);
    finalizeGame(record);
    assert.equal(await sha256(canonicalJson(record)), digest);
    validateCompletedRecord(record);
  }
});

test('変更前の実v2保存を読み込み、v3保存後に同じv2へ戻せる', async () => {
  const frozen = JSON.parse(
    gunzipSync(
      readFileSync(new URL('./fixtures/completed-v2.json.gz', import.meta.url)),
    ).toString(),
  );
  const db = new GameDatabase('legacy-v2-' + crypto.randomUUID());
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
    const storage = new DexieStorageAdapter(db);
    const old = (await storage.loadSnapshot()).record;
    assert.equal(old.state.simulationVersion, 'game-prototype-v2');
    assert.equal(old.state.totalPitches, 235);
    assert.deepEqual(old.state.score, { away: 9, home: 1 });
    const next = createGame(20260923);
    runToCompletion(next);
    finalizeGame(next);
    assert.equal(next.state.simulationVersion, 'game-prototype-v3');
    await storage.commitSnapshot(next, 1);
    assert.deepEqual((await storage.loadSnapshot()).record, next);
    assert.deepEqual((await storage.loadSnapshot(true)).record, old);
  } finally {
    await db.delete();
  }
});
