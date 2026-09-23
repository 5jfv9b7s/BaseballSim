import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, runToCompletion } from '../src/game/engine.ts';
import { finalizeGame } from '../src/game/results.ts';
import { validateCompletedRecord } from '../src/storage/codec.ts';
import { simulatePitchV4 } from '../src/engine/pitch-v4.ts';
import { simulatePitchV3 } from '../src/engine/pitch-v3.ts';
import type { PitchContext } from '../src/engine/pitch-v3.ts';
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

test('3ボール未満では旧v5と同じ投球・判断・乱数消費を保つ', () => {
  for (let i = 1; i <= 300; i++) {
    const { fixture, context } = setup(Math.imul(i, 2654435761) >>> 0);
    context.count = { balls: i % 3, strikes: Math.floor(i / 3) % 3 };
    const old = simulatePitchV3(context, fixture, 'same');
    const next = simulatePitchV4(context, fixture, 'same');
    assert.deepEqual(next.state, old.state);
    assert.deepEqual(next.event.pitch, old.event.pitch);
    assert.deepEqual(next.trace, old.trace);
    assert.deepEqual({ ...next.decision, modelVersion: old.decision.modelVersion }, old.decision);
    assert.equal(next.event.simulationVersion, 'pitch-prototype-v4');
  }
});

test('3ボールでは狙いだけを変更し、同じ誤差・球速・配球を使う', () => {
  let changed = 0;
  for (let i = 1; i <= 300; i++) {
    const { fixture, context } = setup(Math.imul(i, 2654435761) >>> 0);
    context.count = { balls: 3, strikes: i % 3 };
    const before = structuredClone({ fixture, context });
    const old = simulatePitchV3(context, fixture, 'target');
    const next = simulatePitchV4(context, fixture, 'target');
    const a = old.event.pitch;
    const p = next.event.pitch;
    assert.ok([-100, 0, 100].includes(p.intendedLocation.xMm));
    assert.ok([650, 800, 950].includes(p.intendedLocation.zMm));
    assert.equal(p.pitchId, a.pitchId);
    assert.equal(p.velocityCentiKph, a.velocityCentiKph);
    assert.equal(
      p.actualLocation.xMm - p.intendedLocation.xMm,
      a.actualLocation.xMm - a.intendedLocation.xMm,
    );
    assert.equal(
      p.actualLocation.zMm - p.intendedLocation.zMm,
      a.actualLocation.zMm - a.intendedLocation.zMm,
    );
    assert.deepEqual(next.trace.selectionWeights, old.trace.selectionWeights);
    assert.equal(next.trace.positionErrorHalfWidthMm, old.trace.positionErrorHalfWidthMm);
    if (
      p.intendedLocation.xMm !== a.intendedLocation.xMm ||
      p.intendedLocation.zMm !== a.intendedLocation.zMm
    )
      changed++;
    assert.deepEqual({ fixture, context }, before);
    assert.deepEqual(next, simulatePitchV4(context, fixture, 'target'));
    assert.deepEqual(JSON.parse(JSON.stringify(next)), next);
  }
  assert.ok(changed > 0);
});

test('制球が低ければ中央狙いでも外れ、四球を生成できる', () => {
  let lowInside = 0;
  let highInside = 0;
  let walks = 0;
  let fouls = 0;
  for (let i = 1; i <= 1000; i++) {
    const { fixture, context } = setup(Math.imul(i, 2654435761) >>> 0);
    context.count = { balls: 3, strikes: 2 };
    const low = structuredClone(fixture);
    const high = structuredClone(fixture);
    for (const p of low.pitches) p.control = { valueMilli: 0, ceilingMilli: 120000 };
    for (const p of high.pitches) p.control = { valueMilli: 120000, ceilingMilli: 120000 };
    const a = simulatePitchV4(context, low, 'control');
    const z = simulatePitchV4(context, high, 'control');
    lowInside += a.event.pitch.zoneCode.startsWith('S_') ? 1 : 0;
    highInside += z.event.pitch.zoneCode.startsWith('S_') ? 1 : 0;
    assert.deepEqual(a.event.pitch.intendedLocation, z.event.pitch.intendedLocation);
    for (const step of [a, z]) {
      assert.ok(step.state.rng.drawCount >= 7 && step.state.rng.drawCount <= 9);
      if (step.event.stopReason === 'walkPending') walks++;
      if (step.event.pitch.ruling === 'foul') {
        fouls++;
        assert.deepEqual(step.state.count, { balls: 3, strikes: 2 });
      }
    }
  }
  assert.ok(highInside > lowInside && walks > 0 && fouls > 0);
  assert.equal(highInside, 1000); // 最大制球では今回の中央狙いと±35mm誤差が全て矩形内。
  const { fixture, context } = setup(1);
  assert.throws(() =>
    simulatePitchV4({ ...context, count: { balls: 4, strikes: 2 } }, fixture, 'invalid'),
  );
});

test('v6は新投球とv5打球を接続し、投球の版改変を保存検査で拒否する', () => {
  const game = createGame(20260923, undefined, 'game-prototype-v6');
  runToCompletion(game);
  finalizeGame(game);
  assert.equal(game.state.simulationVersion, 'game-prototype-v6');
  validateCompletedRecord(game);
  for (const event of game.events) {
    if (event.pitch) assert.equal(event.pitchDecision!.modelVersion, 'pitch-prototype-v4');
    if (event.battedBall) {
      assert.equal(event.battedBall.modelVersion, 'batted-ball-prototype-v3');
      assert.equal(
        event.battedBall.contactQuality!.approach,
        event.pitch!.countBefore.strikes === 2 ? 'protect' : 'normal',
      );
    }
  }
  const altered = structuredClone(game);
  altered.events.find((e) => e.pitch)!.pitchDecision!.modelVersion = 'pitch-prototype-v3';
  assert.throws(() => validateCompletedRecord(altered), /一致しません/);
});
