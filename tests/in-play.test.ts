import baseline from './fixtures/match-v7-baseline.json' with { type: 'json' };
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceGameEvent,
  createGame,
  resolveAppearance,
  runToCompletion,
} from '../src/game/engine.ts';
import { finalizeGame } from '../src/game/results.ts';
import { evaluateInPlay } from '../src/game/in-play.ts';
import type { BattedBall, Runner } from '../src/game/types.ts';

function setup(type: 'ground' | 'fly' = 'ground') {
  const game = createGame(20260923, undefined, 'game-prototype-v7', baseline);
  const { state, fixture } = game;
  const { event } = advanceGameEvent(state, fixture);
  event.credits = [];
  const pitcherId = fixture.teams.home.pitcherIds[0]!;
  const batterId = fixture.teams.away.lineup[0]!.playerId;
  const runner = (index: number, responsible = pitcherId): Runner => ({
    runInstanceId: 'test-runner-' + index,
    originalRunnerId: fixture.teams.away.lineup[index]!.playerId,
    currentRunnerId: fixture.teams.away.lineup[index]!.playerId,
    responsiblePitcherId: responsible,
    reachedEventSeq: index,
    reachedReason: 'single',
  });
  const position = type === 'ground' ? 'SS' : 'CF';
  const ball: BattedBall = {
    sourcePitchSeq: 1,
    exitVelocityCentiKph: 10000,
    launchAngleCentiDegree: type === 'ground' ? 0 : 4000,
    launchSprayAngleCentiDegree: 0,
    fairBearingCentiDegree: 0,
    type,
    isBunt: false,
    fairStatus: 'fair',
    directionCode: 'center',
    directionDefinitionVersion: 'design-v1.0',
    terminalLocation: { xMm: 0, yMm: 110000 },
    flightTimeMs: 4000,
    distanceMm: 110000,
    fenceDistanceMm: 120000,
    fielderId: fixture.teams.home.lineup.find((p) => p.position === position)!.playerId,
    fieldingPosition: position,
    fielderDistanceMm: 0,
    fielderReachMm: 20000,
    fieldingTimeMs: 4000,
    batterFirstBaseTimeMs: 4500,
    projectedBases: 0,
    modelVersion: 'batted-ball-prototype-v4',
    fieldingContact:
      type === 'ground'
        ? { timeMs: 900, location: { xMm: -10000, yMm: 24000 } }
        : { timeMs: 4000, location: { xMm: 0, yMm: 110000 } },
  };
  event.battedBall = ball;
  const resolve = () => resolveAppearance(state, event, fixture, 'battedOut', batterId, pitcherId);
  return { game, state, fixture, event, pitcherId, batterId, runner, ball, resolve };
}

test('無死・一死の満塁ゴロ併殺は2アウト、打数1、打点0。後続走者と責任投手を保持する', () => {
  for (const outs of [0, 1]) {
    const { state, event, pitcherId, runner, resolve } = setup();
    state.outs = outs;
    state.baseOccupants = [runner(1), runner(2), runner(3)];
    const rng = structuredClone(state.rng);
    resolve();
    assert.equal(event.fieldingEvaluation?.completed, true);
    assert.equal(event.outcome, 'battedOut');
    assert.equal(state.outs, outs + 2);
    assert.equal(state.phase, outs === 1 ? 'halfComplete' : 'readyForPitch');
    assert.deepEqual(
      event.outDecisions.map((o) => [o.playerId, o.atBase, o.orderInPlay]),
      [
        [runner(1).currentRunnerId, 2, 1],
        [event.pitch!.batterId, 1, 2],
      ],
    );
    assert.equal(
      event.credits
        .filter((c) => c.metricCode === 'outsRecorded' && c.playerId === pitcherId)
        .reduce((n, c) => n + c.amount, 0),
      2,
    );
    assert.equal(event.credits.find((c) => c.metricCode === 'atBats')?.amount, 1);
    assert.equal(event.credits.find((c) => c.metricCode === 'groundedIntoDoublePlays')?.amount, 1);
    assert.equal(
      event.credits.some((c) => c.metricCode === 'runsBattedIn'),
      false,
    );
    assert.deepEqual(state.baseOccupants, [null, runner(2), runner(3)]);
    assert.deepEqual(state.score, { home: 0, away: 0 });
    assert.equal(state.nextAppearanceNo, 2);
    assert.deepEqual(state.rng, rng);
  }
});

test('二死・一塁走者なし・対象外捕球では併殺にせず、間に合わない送球は一塁アウトだけにする', () => {
  for (const scenario of ['twoOuts', 'noFirst', 'outfield', 'slow', 'tie'] as const) {
    const t = setup();
    t.state.baseOccupants = [t.runner(1), null, null];
    if (scenario === 'twoOuts') t.state.outs = 2;
    if (scenario === 'noFirst') t.state.baseOccupants = [null, t.runner(2), null];
    if (scenario === 'outfield') t.ball.fieldingPosition = 'CF';
    if (scenario === 'slow') t.ball.fieldingContact!.timeMs = 4000;
    if (scenario === 'tie') {
      const evaluation = evaluateInPlay(t.state, t.fixture, t.ball, t.event.pitch)!;
      t.ball.batterFirstBaseTimeMs = evaluation.defenseArrivalMs[1]!;
    }
    t.resolve();
    assert.equal(t.event.outDecisions.length, 1, scenario);
    assert.equal(
      t.event.credits.some((c) => c.metricCode === 'groundedIntoDoublePlays'),
      false,
    );
    assert.ok(t.state.outs <= 3);
  }
});

test('外野フライのタッチアップは捕球後に生還し、打数を増やさず走者の責任投手へ失点を付ける', () => {
  for (const outs of [0, 1]) {
    const t = setup('fly');
    const oldPitcher = t.fixture.teams.home.pitcherIds[1]!;
    const runner = t.runner(3, oldPitcher);
    t.fixture.players.find((p) => p.playerId === runner.currentRunnerId)!.runningSpeed.valueMilli =
      120000;
    t.state.outs = outs;
    t.state.baseOccupants = [t.runner(1), t.runner(2), runner];
    t.resolve();
    assert.equal(t.event.outcome, 'sacrificeFly');
    assert.equal(t.state.outs, outs + 1);
    assert.equal(t.state.score.away, 1);
    assert.deepEqual(t.state.baseOccupants, [t.runner(1), t.runner(2), null]);
    assert.equal(t.event.outDecisions.length, 1);
    assert.equal(
      t.event.credits.some((c) => c.metricCode === 'atBats'),
      false,
    );
    for (const metric of ['sacrificeFlies', 'plateAppearances', 'runsBattedIn']) {
      assert.equal(t.event.credits.find((c) => c.metricCode === metric)?.amount, 1);
    }
    assert.equal(t.event.runDecisions[0]!.responsiblePitcherId, oldPitcher);
    assert.equal(t.event.credits.find((c) => c.metricCode === 'runsAllowed')!.playerId, oldPitcher);
    assert.ok(t.event.fieldingEvaluation!.runnerArrivalMs[0]! > t.ball.fieldingContact!.timeMs);
  }
});

test('二死の捕球・浅い飛球・ライナー・ポップでは犠飛と得点を生成しない', () => {
  for (const scenario of ['twoOuts', 'shallow', 'line', 'popup', 'noThird'] as const) {
    const t = setup('fly');
    t.state.baseOccupants = [null, null, t.runner(3)];
    if (scenario === 'twoOuts') t.state.outs = 2;
    if (scenario === 'shallow') t.ball.fieldingContact!.location.yMm = 40000;
    if (scenario === 'line' || scenario === 'popup') t.ball.type = scenario;
    if (scenario === 'noThird') t.state.baseOccupants[2] = null;
    t.resolve();
    assert.equal(t.event.outcome, 'battedOut', scenario);
    assert.equal(t.state.score.away, 0);
    assert.equal(t.event.credits.find((c) => c.metricCode === 'atBats')?.amount, 1);
  }
});

test('犠飛でサヨナラを確定し、2アウトからは終了させない', () => {
  for (const outs of [1, 2]) {
    const t = setup('fly');
    t.state.half = 'bottom';
    t.state.inning = 9;
    t.state.outs = outs;
    t.state.innings.home = Array(9).fill(0);
    t.state.innings.away = Array(9).fill(0);
    t.ball.fielderId = t.fixture.teams.away.lineup.find((p) => p.position === 'CF')!.playerId;
    const runner = t.runner(3);
    runner.currentRunnerId = t.fixture.teams.home.lineup[3]!.playerId;
    runner.originalRunnerId = runner.currentRunnerId;
    runner.responsiblePitcherId = t.fixture.teams.away.pitcherIds[0]!;
    t.fixture.players.find((p) => p.playerId === runner.currentRunnerId)!.runningSpeed.valueMilli =
      120000;
    t.state.baseOccupants = [null, null, runner];
    resolveAppearance(
      t.state,
      t.event,
      t.fixture,
      'battedOut',
      t.fixture.teams.home.lineup[0]!.playerId,
      runner.responsiblePitcherId,
    );
    assert.equal(t.state.phase, outs === 1 ? 'gameComplete' : 'halfComplete');
    assert.equal(t.state.endReason, outs === 1 ? 'walkOff' : null);
    assert.equal(t.state.score.home, outs === 1 ? 1 : 0);
  }
});

test('複数条件の試合で併殺と犠飛を生成し、打席内訳・有効アウト・全成績が整合する', () => {
  let doublePlays = 0;
  let sacrificeFlies = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const game = createGame(
      Math.imul(seed, 2654435761) >>> 0,
      undefined,
      'game-prototype-v7',
      baseline,
    );
    runToCompletion(game);
    const result = finalizeGame(game);
    for (const event of game.events) {
      assert.ok(event.after.outs <= 3);
      if (event.kind === 'pitch')
        assert.equal(event.after.outs - event.before.outs, event.outDecisions.length);
      if (event.fieldingEvaluation?.play === 'doublePlay' && event.fieldingEvaluation.completed) {
        doublePlays++;
        assert.equal(event.outDecisions.length, 2);
        assert.equal(event.runDecisions.length, 0);
      }
      if (event.outcome === 'sacrificeFly') {
        sacrificeFlies++;
        assert.ok(event.before.outs < 2);
        assert.equal(event.runDecisions.length, 1);
      }
    }
    assert.equal(
      result.batting.reduce((n, p) => n + p.groundedIntoDoublePlays!, 0),
      game.events.filter(
        (e) => e.fieldingEvaluation?.play === 'doublePlay' && e.fieldingEvaluation.completed,
      ).length,
    );
    assert.equal(
      result.batting.reduce((n, p) => n + p.sacrificeFlies!, 0),
      game.events.filter((e) => e.outcome === 'sacrificeFly').length,
    );
    for (const p of result.batting)
      assert.equal(p.plateAppearances, p.atBats + p.walks + p.hitByPitch + p.sacrificeFlies!);
  }
  assert.ok(doublePlays > 0 && sacrificeFlies > 0);
});
