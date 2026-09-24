import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game/engine.ts';
import { simulatePitchV2, swingChance, avoidBodyContact } from '../src/engine/pitch-v2.ts';
import type { PitchContext } from '../src/engine/pitch-v2.ts';
import type { Fixture } from '../src/engine/types.ts';

function setup(seed: number) {
  const game = createGame(seed);
  const home = game.fixture.teams.home;
  const fixture: Fixture = {
    ...game.fixture,
    matchup: {
      pitcherId: home.pitcherIds[0]!,
      batterId: game.fixture.teams.away.lineup[0]!.playerId,
      catcherId: home.lineup.find((p) => p.position === 'C')!.playerId,
    },
  };
  const context: PitchContext = {
    gameId: game.state.gameId,
    attemptNo: 1,
    activeAppearanceId: game.state.gameId + ':appearance:1',
    phase: 'readyForPitch',
    count: { balls: 0, strikes: 0 },
    nextEventSeq: 1,
    rng: game.state.rng,
    initialDatasetVersion: fixture.initialDatasetVersion,
  };
  return { fixture, context };
}

test('カウント別の見極めと選球眼を確率の段階で分離する', () => {
  const zero = { balls: 0, strikes: 0 };
  for (const inside of [false, true]) {
    const normal = swingChance(inside, 0.5, 0.5, zero);
    assert.ok(swingChance(inside, 0.5, 0.5, { balls: 3, strikes: 0 }) < normal);
    assert.ok(swingChance(inside, 0.5, 0.5, { balls: 0, strikes: 2 }) > normal);
    for (const aggression of [0, 1])
      for (const discipline of [0, 1])
        for (const balls of [0, 3])
          for (const strikes of [0, 2]) {
            const p = swingChance(inside, aggression, discipline, { balls, strikes });
            assert.ok(p >= 0 && p <= 1);
          }
  }
  assert.ok(swingChance(false, 0.5, 1, zero) < swingChance(false, 0.5, 0, zero));
  assert.ok(swingChance(true, 0.5, 1, zero) > swingChance(true, 0.5, 0, zero));
});

test('回避は身体へ向かう見送りだけで乱数を使い、左右で鏡像になる', () => {
  let draws = 0;
  const draw = () => {
    draws++;
    return 0;
  };
  assert.equal(avoidBodyContact({ xMm: 0, zMm: 800 }, 'R', 14000, 0.5, draw).bodyThreat, false);
  assert.equal(draws, 0);
  const location = { xMm: -410, zMm: 800 };
  assert.equal(avoidBodyContact(location, 'R', 14000, 0.5, null).hitByPitch, false);
  assert.equal(draws, 0);
  const slowReaction = avoidBodyContact(location, 'R', 14000, 0.5, draw);
  assert.equal(draws, 1);
  assert.equal(slowReaction.hitByPitch, true);
  const earlyReaction = avoidBodyContact(location, 'R', 14000, 0.5, () => 0.999);
  assert.equal(earlyReaction.hitByPitch, false);
  assert.ok(earlyReaction.avoidanceShiftMm! > slowReaction.avoidanceShiftMm!);
  assert.deepEqual(
    earlyReaction,
    avoidBodyContact({ xMm: 410, zMm: 800 }, 'L', 14000, 0.5, () => 0.999),
  );
});

test('v3用投球は入力を変えず、版・判断過程・完全乱数状態を再現する', () => {
  const { fixture, context } = setup(20260923);
  const before = structuredClone({ fixture, context });
  const a = simulatePitchV2(context, fixture, 'pitch-1');
  const b = simulatePitchV2(context, fixture, 'pitch-1');
  assert.deepEqual(a, b);
  assert.deepEqual({ fixture, context }, before);
  assert.equal(a.event.simulationVersion, 'pitch-prototype-v2');
  assert.equal(a.decision.modelVersion, 'pitch-prototype-v2');
  assert.deepEqual(a.trace.rngAfter, a.state.rng);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
  assert.throws(() =>
    simulatePitchV2({ ...context, count: { balls: 4, strikes: 0 } }, fixture, 'bad'),
  );
});

test('2ストライクでは外側も狙い、3ボールではゾーンへ戻す', () => {
  const { fixture, context } = setup(20260923);
  const chase = simulatePitchV2({ ...context, count: { balls: 0, strikes: 2 } }, fixture, 'chase');
  const full = simulatePitchV2({ ...context, count: { balls: 3, strikes: 2 } }, fixture, 'full');
  assert.ok([-245, 0, 245].includes(chase.event.pitch.intendedLocation.xMm));
  assert.ok([460, 800, 1140].includes(chase.event.pitch.intendedLocation.zMm));
  assert.ok([-144, 0, 144].includes(full.event.pitch.intendedLocation.xMm));
  assert.ok([600, 800, 1000].includes(full.event.pitch.intendedLocation.zMm));
});

test('2000条件で死球の成立と回避を生成し、条件外の死球を出さない', () => {
  let hits = 0;
  let avoided = 0;
  for (let i = 1; i <= 2000; i++) {
    const { fixture, context } = setup(Math.imul(i, 2654435761) >>> 0);
    const step = simulatePitchV2(context, fixture, 'sample-' + i);
    const d = step.decision;
    if (d.hitByPitch) {
      hits++;
      assert.equal(d.bodyThreat, true);
      assert.equal(step.event.pitch.action, 'take');
      assert.notEqual(d.avoidanceShiftMm, null);
    }
    if (d.bodyThreat && d.avoidanceShiftMm !== null && !d.hitByPitch) avoided++;
    assert.ok(step.state.rng.drawCount >= 7 && step.state.rng.drawCount <= 9);
  }
  assert.ok(hits > 0);
  assert.ok(avoided > hits);
});
