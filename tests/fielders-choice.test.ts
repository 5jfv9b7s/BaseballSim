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
import { evaluateInPlayV2 as evaluateInPlay } from '../src/game/in-play-v2.ts';
import { evaluateInPlay as evaluateLegacy } from '../src/game/in-play.ts';
import { canonicalJson, validateCompletedRecord } from '../src/storage/codec.ts';
import type { BattedBall, Runner } from '../src/game/types.ts';

function setup(type: 'ground' | 'fly' = 'ground') {
  const game = createGame(20260923, undefined, 'game-prototype-v8', baseline);
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

function choiceSetup() {
  const t = setup();
  t.state.baseOccupants = [t.runner(3), null, null];
  // 一塁への直接送球は間に合うが、二塁を経由した送球には打者が先着する。
  t.ball.batterFirstBaseTimeMs = 3500;
  t.ball.fieldingTimeMs = 2500;
  return t;
}

test('二塁だけ間に合うゴロは走者をアウトにし、打者が野選で一塁に残る', () => {
  for (const outs of [0, 1]) {
    const t = choiceSetup();
    t.state.outs = outs;
    t.state.baseOccupants = [t.runner(3), t.runner(4), t.runner(5)];
    const rng = structuredClone(t.state.rng);
    t.resolve();

    assert.equal(t.event.outcome, 'fieldersChoice');
    assert.equal(t.event.fieldingEvaluation!.modelVersion, 'in-play-prototype-v2');
    assert.equal(t.event.fieldingEvaluation!.resolution, 'fieldersChoice');
    assert.equal(t.event.fieldingEvaluation!.completed, false);
    assert.equal(t.state.outs, outs + 1);
    assert.equal(t.state.phase, 'readyForPitch');
    assert.deepEqual(t.event.outDecisions, [
      {
        playerId: t.runner(3).currentRunnerId,
        runInstanceId: t.runner(3).runInstanceId,
        creditedPitcherId: t.pitcherId,
        kind: 'forceOut',
        atBase: 2,
        orderInPlay: 1,
        countsTowardInning: true,
      },
    ]);
    const replacement = t.state.baseOccupants[0]!;
    assert.equal(replacement.originalRunnerId, t.batterId);
    assert.equal(replacement.currentRunnerId, t.batterId);
    assert.equal(replacement.reachedReason, 'fieldersChoice');
    assert.notEqual(replacement.runInstanceId, t.runner(3).runInstanceId);
    assert.deepEqual(t.state.baseOccupants.slice(1), [t.runner(4), t.runner(5)]);
    assert.equal(t.event.runnerActions[0]!.orderInPlay, 2);
    assert.equal(t.event.runnerActions[0]!.from, 'batter');
    assert.equal(t.event.runnerActions[0]!.to, 1);

    for (const metric of [
      'plateAppearances',
      'atBats',
      'fieldersChoices',
      'battersFaced',
      'outsRecorded',
    ]) {
      assert.equal(t.event.credits.find((c) => c.metricCode === metric)?.amount, 1);
    }
    for (const metric of ['hits', 'hitsAllowed', 'groundedIntoDoublePlays', 'runsBattedIn']) {
      assert.equal(
        t.event.credits.some((c) => c.metricCode === metric),
        false,
      );
    }
    assert.deepEqual(t.state.score, { away: 0, home: 0 });
    assert.equal(t.state.nextAppearanceNo, 2);
    assert.deepEqual(t.state.count, { balls: 0, strikes: 0 });
    assert.deepEqual(t.state.rng, rng);
  }
});

test('二死・対象外の打球・一塁走者なし・二塁送球遅れでは野選を生成しない', () => {
  for (const scenario of [
    'twoOuts',
    'noFirst',
    'line',
    'outfield',
    'slowSecond',
    'tieSecond',
  ] as const) {
    const t = choiceSetup();
    if (scenario === 'twoOuts') t.state.outs = 2;
    if (scenario === 'noFirst') t.state.baseOccupants = [null, t.runner(4), null];
    if (scenario === 'line') t.ball.type = 'line';
    if (scenario === 'outfield') t.ball.fieldingPosition = 'CF';
    if (scenario === 'slowSecond') t.ball.fieldingContact!.timeMs = 5000;
    if (scenario === 'tieSecond') {
      t.state.config!.running.runnerLeadMeters = 10;
      const timing = evaluateInPlay(t.state, t.fixture, t.ball, t.event.pitch)!;
      const running = t.state.config!.running;
      const runner = t.fixture.players.find((p) => p.playerId === t.runner(3).currentRunnerId)!;
      const speed =
        running.runnerBaseMetersPerSecond +
        (running.runnerAbilityMetersPerSecond * runner.runningSpeed.valueMilli) / 120000;
      running.runnerReactionSeconds =
        timing.defenseArrivalMs[0]! / 1000 - (27.432 - running.runnerLeadMeters) / speed;
      assert.ok(running.runnerReactionSeconds >= 0);
      const tied = evaluateInPlay(t.state, t.fixture, t.ball, t.event.pitch)!;
      assert.equal(tied.defenseArrivalMs[0], tied.runnerArrivalMs[0]);
    }
    const first = structuredClone(t.state.baseOccupants[0]);
    t.resolve();
    assert.equal(t.event.outcome, 'battedOut', scenario);
    assert.deepEqual(t.state.baseOccupants[0], first, scenario);
    assert.equal(t.event.outDecisions.length, 1);
    assert.equal(t.event.outDecisions[0]!.playerId, t.batterId);
    assert.equal(t.state.outs, scenario === 'twoOuts' ? 3 : 1);
    assert.equal(
      t.event.credits.some((c) => c.metricCode === 'fieldersChoices'),
      false,
    );
  }
});

test('一塁の同時到達は野選、送球が先なら併殺。v7と到達時間は同じ', () => {
  const t = choiceSetup();
  const timing = evaluateInPlay(t.state, t.fixture, t.ball, t.event.pitch)!;
  t.ball.batterFirstBaseTimeMs = timing.defenseArrivalMs[1]!;
  const tied = evaluateInPlay(t.state, t.fixture, t.ball, t.event.pitch)!;
  assert.equal(tied.resolution, 'fieldersChoice');
  t.ball.batterFirstBaseTimeMs++;
  assert.equal(evaluateInPlay(t.state, t.fixture, t.ball, t.event.pitch)!.resolution, 'doublePlay');

  const legacyState = { ...t.state, simulationVersion: 'game-prototype-v7' as const };
  const old = evaluateLegacy(legacyState, t.fixture, t.ball, t.event.pitch)!;
  const next = evaluateInPlay(t.state, t.fixture, t.ball, t.event.pitch)!;
  const { modelVersion: _oldVersion, ...oldTiming } = old;
  const { modelVersion: _newVersion, resolution: _resolution, ...newTiming } = next;
  assert.deepEqual(newTiming, oldTiming);
});

test('野選が連続して走者が入れ替わっても元の投手への失点責任を引き継ぐ', () => {
  const t = choiceSetup();
  const originalPitcher = t.pitcherId;
  const secondPitcher = t.fixture.teams.home.pitcherIds[1]!;
  const thirdPitcher = t.fixture.teams.home.pitcherIds[2]!;
  t.event.pitch!.pitcherId = secondPitcher;
  resolveAppearance(t.state, t.event, t.fixture, 'battedOut', t.batterId, secondPitcher);
  const firstReplacement = structuredClone(t.state.baseOccupants[0]!);
  assert.equal(firstReplacement.responsiblePitcherId, originalPitcher);
  assert.equal(t.event.outDecisions[0]!.creditedPitcherId, secondPitcher);

  const nextEvent = advanceGameEvent(t.state, t.fixture).event;
  nextEvent.credits = [];
  nextEvent.runnerActions = [];
  nextEvent.outDecisions = [];
  nextEvent.runDecisions = [];
  nextEvent.battedBall = t.ball;
  nextEvent.pitch!.pitcherId = thirdPitcher;
  const nextBatter = t.fixture.teams.away.lineup[1]!.playerId;
  resolveAppearance(t.state, nextEvent, t.fixture, 'battedOut', nextBatter, thirdPitcher);
  assert.equal(nextEvent.outcome, 'fieldersChoice');
  const secondReplacement = t.state.baseOccupants[0]!;
  assert.equal(secondReplacement.responsiblePitcherId, originalPitcher);
  assert.notEqual(secondReplacement.runInstanceId, firstReplacement.runInstanceId);
  assert.equal(secondReplacement.currentRunnerId, nextBatter);
  assert.equal(nextEvent.outDecisions[0]!.creditedPitcherId, thirdPitcher);

  const homeRunEvent = advanceGameEvent(t.state, t.fixture).event;
  homeRunEvent.credits = [];
  homeRunEvent.runnerActions = [];
  homeRunEvent.outDecisions = [];
  homeRunEvent.runDecisions = [];
  resolveAppearance(
    t.state,
    homeRunEvent,
    t.fixture,
    'homeRun',
    t.fixture.teams.away.lineup[2]!.playerId,
    thirdPitcher,
  );
  assert.equal(t.state.score.away, 2);
  assert.deepEqual(
    homeRunEvent.runDecisions.map((r) => r.responsiblePitcherId),
    [originalPitcher, thirdPitcher],
  );
  assert.deepEqual(
    homeRunEvent.credits.filter((c) => c.metricCode === 'runsAllowed').map((c) => c.playerId),
    [originalPitcher, thirdPitcher],
  );
});

test('野選を打席結果だけで指定できず、入力を直接変更しない', () => {
  const t = choiceSetup();
  const before = canonicalJson(t.state);
  assert.throws(
    () => resolveAppearance(t.state, t.event, t.fixture, 'fieldersChoice', t.batterId, t.pitcherId),
    /判定から生成/,
  );
  assert.equal(canonicalJson(t.state), before);
  evaluateInPlay(t.state, t.fixture, t.ball, t.event.pitch);
  assert.equal(canonicalJson(t.state), before);
});

test('v8の100条件で野選・併殺・犠飛を生成し、走者と記録の内訳が整合する', () => {
  const generated = new Set<string>();
  for (let i = 1; i <= 100; i++) {
    const game = createGame(
      Math.imul(i, 2654435761) >>> 0,
      undefined,
      'game-prototype-v8',
      baseline,
    );
    runToCompletion(game);
    const result = finalizeGame(game);
    for (const event of game.events) {
      assert.ok(event.after.outs <= 3);
      if (event.kind !== 'pitch') continue;
      assert.equal(event.after.outs - event.before.outs, event.outDecisions.length);
      if (event.fieldingEvaluation?.resolution) generated.add(event.fieldingEvaluation.resolution);
      if (event.outcome !== 'fieldersChoice') continue;
      assert.equal(event.runDecisions.length, 0);
      assert.equal(event.outDecisions.length, 1);
      assert.equal(
        event.outDecisions[0]!.runInstanceId,
        event.before.baseOccupants[0]!.runInstanceId,
      );
      assert.equal(event.after.baseOccupants[0]!.currentRunnerId, event.pitch!.batterId);
      assert.equal(
        event.after.baseOccupants[0]!.responsiblePitcherId,
        event.before.baseOccupants[0]!.responsiblePitcherId,
      );
      assert.deepEqual(event.after.baseOccupants.slice(1), event.before.baseOccupants.slice(1));
    }
    assert.equal(
      result.batting.reduce((s, p) => s + p.fieldersChoices!, 0),
      game.events.filter((e) => e.outcome === 'fieldersChoice').length,
    );
    for (const p of result.batting)
      assert.equal(p.plateAppearances, p.atBats + p.walks + p.hitByPitch + p.sacrificeFlies!);
  }
  for (const play of ['fieldersChoice', 'doublePlay', 'sacrificeFly'])
    assert.ok(generated.has(play), play);
});

test('v8の野選記録を保存検証で再現し、アウト対象・責任投手の改変を拒否する', () => {
  const game = createGame(20260923, undefined, 'game-prototype-v8', baseline);
  runToCompletion(game);
  finalizeGame(game);
  validateCompletedRecord(game);
  const index = game.events.findIndex((e) => e.outcome === 'fieldersChoice');
  assert.ok(index >= 0);
  const altered = structuredClone(game);
  altered.events[index]!.outDecisions[0]!.playerId = altered.events[index]!.pitch!.batterId;
  assert.throws(() => validateCompletedRecord(altered), /一致しません/);
  const wrongResponsibility = structuredClone(game);
  wrongResponsibility.events[index]!.after.baseOccupants[0]!.responsiblePitcherId =
    'invalid-pitcher';
  assert.throws(() => validateCompletedRecord(wrongResponsibility), /一致しません/);
});
