import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, advanceGameEvent, runToCompletion } from '../src/game/engine.ts';
import { finalizeGame } from '../src/game/results.ts';
import { generateBattedBall } from '../src/game/batted-ball.ts';
import { contactQualityFor } from '../src/game/batted-ball-v3.ts';
import { canonicalJson, validateCompletedRecord } from '../src/storage/codec.ts';
import type { PitchRecord, RngState } from '../src/engine/types.ts';

function setup() {
  const game = createGame(20260923, undefined, 'game-prototype-v5');
  const pitch = structuredClone(
    advanceGameEvent(game.state, game.fixture).event.pitch!,
  ) as PitchRecord;
  // 投球判断の試験とは分け、フェア接触済みの打球入力を作る。
  pitch.action = 'swing';
  pitch.contact = 'fair';
  pitch.ruling = 'inPlay';
  return { game, pitch };
}

function rngFor(input: RngState, i: number): RngState {
  return { ...structuredClone(input), fullState: { word: Math.imul(i, 2654435761) >>> 0 } };
}

test('0・1ストライクの打球はv4と同じ軌道・守備・乱数を保持する', () => {
  const { game, pitch } = setup();
  for (let i = 1; i <= 200; i++) {
    pitch.countBefore = { balls: i % 4, strikes: i % 2 };
    const rng = rngFor(game.state.rng, i);
    const old = generateBattedBall(pitch, game.fixture, 'home', rng, 'game-prototype-v4');
    const next = generateBattedBall(pitch, game.fixture, 'home', rng, 'game-prototype-v5');
    const { contactQuality, ...ball } = next.ball;
    assert.deepEqual(contactQuality, { approach: 'normal', exitSpeedPenaltyCentiKph: 0 });
    assert.deepEqual({ ...ball, modelVersion: old.ball.modelVersion }, old.ball);
    assert.deepEqual(next.rng, old.rng);
  }
});

test('接触優先の減速は左右ミートを使い、打球の軌道から再計算する', () => {
  const { game, pitch } = setup();
  pitch.countBefore = { balls: 3, strikes: 2 };
  const batter = game.fixture.players.find((p) => p.playerId === pitch.batterId)!;
  batter.batting.contactVsRight = { valueMilli: 0, ceilingMilli: 120000 };
  batter.batting.contactVsLeft = { valueMilli: 120000, ceilingMilli: 120000 };
  let trajectoryChanges = 0;
  let fieldingChanges = 0;
  for (let i = 1; i <= 200; i++) {
    pitch.throwingSide = i % 2 ? 'R' : 'L';
    const rng = rngFor(game.state.rng, i);
    const before = structuredClone({ pitch, fixture: game.fixture, rng });
    const old = generateBattedBall(pitch, game.fixture, 'home', rng, 'game-prototype-v4');
    const next = generateBattedBall(pitch, game.fixture, 'home', rng, 'game-prototype-v5');
    const penalty = pitch.throwingSide === 'R' ? 1200 : 600;
    assert.equal(next.ball.contactQuality?.exitSpeedPenaltyCentiKph, penalty);
    assert.equal(old.ball.exitVelocityCentiKph - next.ball.exitVelocityCentiKph, penalty);
    assert.equal(old.ball.launchAngleCentiDegree, next.ball.launchAngleCentiDegree);
    assert.equal(old.ball.fairBearingCentiDegree, next.ball.fairBearingCentiDegree);
    assert.deepEqual(old.rng, next.rng);
    assert.equal(next.rng.drawCount - rng.drawCount, 3);
    assert.deepEqual({ pitch, fixture: game.fixture, rng }, before);
    assert.deepEqual(
      next,
      generateBattedBall(pitch, game.fixture, 'home', rng, 'game-prototype-v5'),
    );
    if (old.ball.distanceMm !== next.ball.distanceMm) trajectoryChanges++;
    if (old.ball.projectedBases !== next.ball.projectedBases) fieldingChanges++;
  }
  assert.ok(trajectoryChanges > 0 && fieldingChanges > 0);
});

test('ミート・パワー・球速の境界で有限な打球を生成し、不正カウントを拒否する', () => {
  const { game, pitch } = setup();
  const batter = game.fixture.players.find((p) => p.playerId === pitch.batterId)!;
  for (const ability of [0, 60000, 120000]) {
    batter.batting.contactVsRight = batter.batting.contactVsLeft = {
      valueMilli: ability,
      ceilingMilli: 120000,
    };
    for (const power of [0, 120000]) {
      batter.powerVsRight = batter.powerVsLeft = { valueMilli: power, ceilingMilli: 120000 };
      for (const speed of [5000, 20000]) {
        pitch.velocityCentiKph = speed;
        for (let i = 1; i <= 100; i++) {
          pitch.countBefore.strikes = 2;
          const rng = rngFor(game.state.rng, i);
          const protect = generateBattedBall(pitch, game.fixture, 'home', rng, 'game-prototype-v5');
          assert.ok(protect.ball.exitVelocityCentiKph > 0);
          assert.ok(protect.ball.contactQuality!.exitSpeedPenaltyCentiKph >= 600);
          assert.ok(protect.ball.contactQuality!.exitSpeedPenaltyCentiKph <= 1200);
          assert.doesNotThrow(() => canonicalJson(protect));
          assert.deepEqual(JSON.parse(JSON.stringify(protect)), protect);
        }
      }
    }
  }
  pitch.countBefore.strikes = 3;
  assert.throws(() => contactQualityFor(pitch, game.fixture));
});

test('v5は投球判断v3を継承し、接触優先の記録も保存再実行で検査する', () => {
  const game = createGame(20260923, undefined, 'game-prototype-v5');
  runToCompletion(game);
  finalizeGame(game);
  validateCompletedRecord(game);
  const balls = game.events.filter((e) => e.battedBall);
  assert.ok(balls.some((e) => e.battedBall!.contactQuality!.approach === 'protect'));
  assert.ok(balls.some((e) => e.battedBall!.contactQuality!.approach === 'normal'));
  for (const event of balls) {
    assert.equal(event.pitchDecision!.modelVersion, 'pitch-prototype-v3');
    assert.equal(event.battedBall!.modelVersion, 'batted-ball-prototype-v3');
    assert.equal(
      event.battedBall!.contactQuality!.approach,
      event.pitch!.countBefore.strikes === 2 ? 'protect' : 'normal',
    );
  }
  const altered = structuredClone(game);
  altered.events.find((e) => e.battedBall)!.battedBall!.contactQuality!.exitSpeedPenaltyCentiKph++;
  assert.throws(() => validateCompletedRecord(altered), /一致しません/);
});
