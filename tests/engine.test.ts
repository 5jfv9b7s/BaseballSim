import test from 'node:test';
import assert from 'node:assert/strict';
import { FIXTURE, createInitialState } from '../src/data/fixture.ts';
import { MODEL } from '../src/engine/model.ts';
import { simulatePitch, advanceCount, selectWeightedIndex } from '../src/engine/pitch.ts';
import { nextRandom } from '../src/engine/rng.ts';
import { classifyZone } from '../src/engine/zone.ts';
import { PitchSession } from '../src/engine/session.ts';
import type { Command } from '../src/engine/session.ts';
import { validateFixture } from '../src/engine/validation.ts';

test('固定seedの既知結果と全状態を再現し、入力を変更しない', () => {
  const state = createInitialState(); const before = structuredClone(state); const fixtureBefore = structuredClone(FIXTURE);
  const step = simulatePitch(state, FIXTURE, 'test-1');
  assert.deepEqual(step, simulatePitch(state, FIXTURE, 'test-1'));
  assert.deepEqual(state, before); assert.deepEqual(FIXTURE, fixtureBefore);
  assert.equal(step.event.pitch.ruling, 'swingingStrike'); assert.equal(step.event.pitch.velocityCentiKph, 14659);
  assert.deepEqual(step.event.pitch.intendedLocation, { xMm: -144, zMm: 600 });
  assert.deepEqual(step.event.pitch.actualLocation, { xMm: -187, zMm: 675 });
  assert.equal(step.state.rng.fullState.word, 3295023023); assert.equal(step.state.rng.drawCount, 8);
});

test('xorshift32の既知ベクトル、完全な状態からの継続', () => {
  let rng = createInitialState(1).rng;
  for (const word of [270369, 67634689, 2647435461]) { rng = nextRandom(rng).state; assert.equal(rng.fullState.word, word); }
  const first = simulatePitch(createInitialState(), FIXTURE, '1');
  const restored = JSON.parse(JSON.stringify(first.state));
  assert.deepEqual(simulatePitch(first.state, FIXTURE, '2'), simulatePitch(restored, FIXTURE, '2'));
});

test('17区画、分割線は右・上、矩形端点は内側', () => {
  const b = MODEL.zone;
  const expected = [['S_LL', 'S_LC', 'S_LR'], ['S_ML', 'S_MC', 'S_MR'], ['S_HL', 'S_HC', 'S_HR']];
  [500, 700, 900].forEach((zMm, row) => [-216, -72, 72].forEach((xMm, col) => assert.equal(classifyZone({ xMm, zMm }, b), expected[row]![col])));
  assert.equal(classifyZone({ xMm: 216, zMm: 1100 }, b), 'S_HR');
  const cases = [[-217, 1101, 'B_NW'], [0, 1101, 'B_N'], [217, 1101, 'B_NE'], [217, 800, 'B_E'], [217, 499, 'B_SE'], [0, 499, 'B_S'], [-217, 499, 'B_SW'], [-217, 800, 'B_W']] as const;
  cases.forEach(([xMm, zMm, expectedZone]) => assert.equal(classifyZone({ xMm, zMm }, b), expectedZone));
});

test('2ストライク後の通常ファウル、四球・三振・フェアの未解決停止', () => {
  const count = { balls: 3, strikes: 2 };
  assert.deepEqual(advanceCount(count, 'foul'), { count, stopReason: null });
  assert.deepEqual(advanceCount(count, 'ball'), { count, stopReason: 'walkPending' });
  assert.deepEqual(advanceCount(count, 'calledStrike'), { count, stopReason: 'strikeoutPending' });
  assert.deepEqual(advanceCount(count, 'swingingStrike'), { count, stopReason: 'strikeoutPending' });
  assert.deepEqual(advanceCount(count, 'inPlay'), { count, stopReason: 'inPlayPending' });
});

test('重みの端点、0重み、負・非有限・全0・空を検査', () => {
  assert.equal(selectWeightedIndex([0, 1, 1], 0), 1);
  assert.equal(selectWeightedIndex([0, 1, 1], .5), 2);
  assert.equal(selectWeightedIndex([1, 0], .9999999), 0);
  for (const weights of [[], [0, 0], [-1, 2], [NaN], [Infinity]]) assert.throws(() => selectWeightedIndex(weights, .5));
  assert.throws(() => selectWeightedIndex([1], 1));
});

test('モデルの版、seed、カウント、能力・ID・球種参照の不正入力を拒否', () => {
  for (const seed of [0, -1, 1.1, NaN, Infinity, 0x100000000]) assert.throws(() => createInitialState(seed));
  assert.throws(() => createInitialState(1, { balls: 4, strikes: 0 }));
  const badVersion = { ...createInitialState(), simulationVersion: 'unknown' } as never;
  assert.throws(() => simulatePitch(badVersion, FIXTURE, '1'));
  for (const mutate of [
    (f: typeof FIXTURE) => { f.players[0]!.batting.contactVsRight.valueMilli = 120001; },
    (f: typeof FIXTURE) => { f.players[0]!.batting.contactVsRight.ceilingMilli = 0; },
    (f: typeof FIXTURE) => { f.players[0]!.playerId = f.players[1]!.playerId; },
    (f: typeof FIXTURE) => { f.pitches[0]!.playerId = 'missing'; },
    (f: typeof FIXTURE) => { f.pitches.forEach(p => { p.acquisitionProgressMilli = 99999; }); },
    (f: typeof FIXTURE) => { f.pitches[0]!.velocity.spreadCentiKph = NaN; },
  ]) { const f = structuredClone(FIXTURE); mutate(f); assert.throws(() => validateFixture(f)); }
});

test('未習得球を選択せず、両打ちを実際の打席側に変換', () => {
  const f = structuredClone(FIXTURE); f.pitches[0]!.acquisitionProgressMilli = 99999;
  f.players[2]!.battingHand = 'S';
  const step = simulatePitch(createInitialState(), f, '1');
  assert.notEqual(step.event.pitch.pitchId, 'pitch-001'); assert.equal(step.event.pitch.battingSide, 'L');
  assert.equal(step.trace.selectionWeights.length, 2);
});

test('制球は位置誤差、再現性は球速幅へ別々に寄与する', () => {
  const base = simulatePitch(createInitialState(), FIXTURE, '1');
  const control = structuredClone(FIXTURE); control.pitches[0]!.control = { valueMilli: 120000, ceilingMilli: 120000 };
  const stable = structuredClone(FIXTURE); stable.pitches[0]!.repeatability = { valueMilli: 120000, ceilingMilli: 120000 };
  const a = simulatePitch(createInitialState(), control, '1'); const b = simulatePitch(createInitialState(), stable, '1');
  assert.ok(a.trace.positionErrorHalfWidthMm < base.trace.positionErrorHalfWidthMm);
  assert.equal(a.event.pitch.velocityCentiKph, base.event.pitch.velocityCentiKph);
  assert.ok(b.trace.velocityHalfWidthCentiKph < base.trace.velocityHalfWidthCentiKph);
  assert.deepEqual(b.event.pitch.actualLocation, base.event.pitch.actualLocation);
});

test('読み取り・再送は乱数や投球数を進めず、衝突・古い指示は原子的に拒否', () => {
  const session = new PitchSession();
  const command: Command = { commandId: '1', localWorldId: 'pitch-lab-local', expectedStateRevision: 0, kind: 'advance', payload: null };
  const first = session.dispatch(command);
  assert.deepEqual(session.query(), first); assert.deepEqual(session.dispatch(command), first);
  first.state.count.balls = 3; assert.equal(session.query().state.count.balls, 0);
  const before = session.query();
  assert.throws(() => session.dispatch({ ...command, commandId: '2' }));
  assert.throws(() => session.dispatch({ ...command, expectedStateRevision: 1 }));
  assert.deepEqual(session.query(), before);
  const malformed = { commandId: '3', localWorldId: 'pitch-lab-local', expectedStateRevision: 1, kind: 'reset', payload: { seed: 0, count: { balls: 0, strikes: 0 } } } as Command;
  assert.throws(() => session.dispatch(malformed)); assert.deepEqual(session.query(), before);
});

test('複数乱数2000条件で全5分岐・停止3種・有限出力・JSON再現性を確認', () => {
  const rulings = new Set(); const stops = new Set();
  for (let i = 1; i <= 2000; i++) {
    const seed = Math.imul(i, 2654435761) >>> 0;
    const input = createInitialState(seed, { balls: 3, strikes: 2 });
    const step = simulatePitch(input, FIXTURE, `case-${i}`);
    rulings.add(step.event.pitch.ruling);
    if (step.event.stopReason) {
      stops.add(step.event.stopReason);
      assert.throws(() => simulatePitch(step.state, FIXTURE, 'next'));
      assert.equal(step.state.phase, 'prototypeStopped');
    }
    assert.ok(step.state.count.balls <= 3 && step.state.count.strikes <= 2);
    assert.ok(step.state.rng.drawCount >= 7 && step.state.rng.drawCount <= 9);
    assert.deepEqual(JSON.parse(JSON.stringify(step)), step);
    assert.equal(step.event.pitch.eventSeq, step.event.eventSeq);
  }
  assert.deepEqual([...rulings].sort(), ['ball', 'calledStrike', 'foul', 'inPlay', 'swingingStrike']);
  assert.deepEqual([...stops].sort(), ['inPlayPending', 'strikeoutPending', 'walkPending']);
});
