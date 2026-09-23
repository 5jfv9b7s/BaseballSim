import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import defaults from '../config/errors.ts';
import baseline from './fixtures/match-v7-baseline.json' with { type: 'json' };
import { createErrorConfig, validateErrorConfig } from '../src/game/error-config.ts';
import { evaluateFieldingError } from '../src/game/fielding-error.ts';
import { recordFielding } from '../src/game/fielding.ts';
import { settleEarnedRuns } from '../src/game/earned-runs.ts';
import {
  createGame,
  advanceGameEvent,
  resolveAppearance,
  situation,
  runToCompletion,
} from '../src/game/engine.ts';
import { finalizeGame } from '../src/game/results.ts';
import { canonicalJson, validateCompletedRecord } from '../src/storage/codec.ts';
import { DexieStorageAdapter, GameDatabase } from '../src/storage/dexie-adapter.ts';
import type { AppearanceOutcome, BattedBall, GameEvent, GameRecord } from '../src/game/types.ts';

const disabled = { baseProbability: 0, inabilityProbability: 0, maximumProbability: 0 };
const certain = { baseProbability: 1, inabilityProbability: 0, maximumProbability: 1 };

function scenario() {
  const game = createGame(20260923, undefined, 'game-prototype-v10', baseline, disabled);
  const template = advanceGameEvent(game.state, game.fixture).event;
  const shortstop = game.fixture.teams.home.lineup.find((p) => p.position === 'SS')!.playerId;
  const ball: BattedBall = {
    sourcePitchSeq: 1,
    exitVelocityCentiKph: 10000,
    launchAngleCentiDegree: 0,
    launchSprayAngleCentiDegree: 0,
    fairBearingCentiDegree: 0,
    type: 'ground',
    isBunt: false,
    fairStatus: 'fair',
    directionCode: 'center',
    directionDefinitionVersion: 'design-v1.0',
    terminalLocation: { xMm: -10000, yMm: 24000 },
    flightTimeMs: 900,
    distanceMm: 26000,
    fenceDistanceMm: 120000,
    fielderId: shortstop,
    fieldingPosition: 'SS',
    fielderDistanceMm: 0,
    fielderReachMm: 20000,
    fieldingTimeMs: 2500,
    batterFirstBaseTimeMs: 4500,
    projectedBases: 0,
    fieldingContact: { timeMs: 900, location: { xMm: -10000, yMm: 24000 } },
    modelVersion: 'batted-ball-prototype-v4',
  };
  let pitcherIndex = 0;
  const play = (outcome: AppearanceOutcome): GameEvent => {
    const event = structuredClone(template);
    for (const key of [
      'fieldingActions',
      'defensiveAlignment',
      'fieldingEvaluation',
      'errorEvaluation',
    ] as const)
      delete event[key];
    event.credits = [];
    event.runnerActions = [];
    event.outDecisions = [];
    event.runDecisions = [];
    event.eventSeq = game.state.nextEventSeq;
    event.appearanceId = `${game.state.gameId}:appearance:${game.state.nextAppearanceNo}`;
    event.before = situation(game.state);
    event.battedBall =
      outcome === 'battedOut' || outcome === 'reachedOnError' ? structuredClone(ball) : null;
    event.pitch!.pitcherId = game.fixture.teams.home.pitcherIds[pitcherIndex]!;
    event.pitch!.batterId = game.fixture.teams.away.lineup[game.state.lineupIndex.away]!.playerId;
    if (outcome === 'reachedOnError')
      event.errorEvaluation = {
        modelVersion: 'fielding-error-prototype-v1',
        kind: 'groundFielding',
        playerId: shortstop,
        position: 'SS',
        probability: 1,
        draw: 0.5,
        occurred: true,
        expectedOuts: 1,
      };
    resolveAppearance(
      game.state,
      event,
      game.fixture,
      outcome,
      event.pitch!.batterId,
      event.pitch!.pitcherId,
    );
    event.after = situation(game.state);
    game.state.nextEventSeq++;
    game.events.push(event);
    return event;
  };
  const settle = () => {
    game.state.phase = 'gameComplete';
    settleEarnedRuns(game);
    return game.events.flatMap((event) => event.runDecisions);
  };
  return { game, ball, template, play, settle, relieve: () => pitcherIndex++ };
}

test('失策設定・捕球能力を検査して複製し、旧モデルに失策設定を混入させない', () => {
  validateErrorConfig(createErrorConfig());
  for (const value of [
    null,
    {},
    { ...disabled, extra: 1 },
    { ...disabled, baseProbability: NaN },
    { ...disabled, maximumProbability: 1.1 },
    { ...disabled, inabilityProbability: -0.1 },
  ])
    assert.throws(() => validateErrorConfig(value));
  const config = createErrorConfig();
  const game = createGame(1, undefined, 'game-prototype-v10', baseline, config);
  config.baseProbability = 1;
  assert.notDeepEqual(game.state.errorConfig, config);
  delete game.fixture.players[0]!.fielding;
  assert.throws(() => createGame(1, game.fixture, 'game-prototype-v10'), /捕球/);
  assert.throws(
    () => createGame(1, undefined, 'game-prototype-v9', baseline, disabled),
    /旧モデル/,
  );
});

test('単独内野ゴロだけで捕球能力と設定を使い、0確率は乱数を消費しない', () => {
  const t = scenario();
  const before = canonicalJson(t.game.state);
  const zero = evaluateFieldingError(t.game.state, t.game.fixture, t.ball, t.template.pitch)!;
  assert.equal(zero.evaluation.occurred, false);
  assert.equal(zero.evaluation.draw, null);
  assert.deepEqual(zero.rng, t.game.state.rng);
  assert.equal(canonicalJson(t.game.state), before);
  t.game.state.errorConfig = certain;
  const error = evaluateFieldingError(t.game.state, t.game.fixture, t.ball, t.template.pitch)!;
  assert.equal(error.evaluation.occurred, true);
  assert.equal(error.rng.drawCount, t.game.state.rng.drawCount + 1);
  for (const changed of [
    { type: 'fly' as const },
    { projectedBases: 1 as const },
    { fieldingPosition: 'RF' as const },
    { fielderId: null },
  ])
    assert.equal(
      evaluateFieldingError(
        t.game.state,
        t.game.fixture,
        { ...t.ball, ...changed },
        t.template.pitch,
      ),
      undefined,
    );
  t.game.state.errorConfig = createErrorConfig();
  const player = t.game.fixture.players.find((p) => p.playerId === t.ball.fielderId)!;
  player.fielding!.catching.valueMilli = 0;
  const low = evaluateFieldingError(t.game.state, t.game.fixture, t.ball, t.template.pitch)!;
  player.fielding!.catching.valueMilli = 120000;
  const high = evaluateFieldingError(t.game.state, t.game.fixture, t.ball, t.template.pitch)!;
  assert.ok(low.evaluation.probability > high.evaluation.probability);
  assert.equal(low.evaluation.draw, high.evaluation.draw);
});

test('満塁の捕球失策は強制進塁・安打なし・打点なし・失策1、アウトを増やさない', () => {
  const t = scenario();
  t.play('walk');
  t.play('walk');
  t.play('walk');
  const event = t.play('reachedOnError');
  recordFielding(event, t.game.fixture);
  assert.equal(t.game.state.outs, 0);
  assert.equal(event.runDecisions.length, 1);
  assert.equal(event.runDecisions[0]!.earned, null);
  assert.equal(event.runnerActions.length, 4);
  assert.equal(event.credits.find((c) => c.metricCode === 'atBats')!.amount, 1);
  for (const metric of [
    'hits',
    'hitsAllowed',
    'runsBattedIn',
    'outsRecorded',
    'putouts',
    'assists',
  ])
    assert.equal(
      event.credits.some((c) => c.metricCode === metric),
      false,
    );
  assert.equal(event.credits.find((c) => c.metricCode === 'errors')!.playerId, t.ball.fielderId);
  assert.equal(event.fieldingActions![0]!.kind, 'error');
});

test('二死失策後は非自責点。継投後は投手個人とチームで判定が異なる', () => {
  const t = scenario();
  t.play('strikeout');
  t.play('strikeout');
  t.play('walk');
  t.play('reachedOnError');
  t.relieve();
  t.play('homeRun');
  t.play('strikeout');
  const runs = t.settle();
  assert.equal(runs.length, 3);
  assert.deepEqual(
    runs.map((r) => r.earnedForTeam),
    [false, false, false],
  );
  assert.deepEqual(
    runs.map((r) => r.earnedForPitcher),
    [false, false, true],
  );
  assert.equal(new Set(runs.map((r) => r.responsiblePitcherId)).size, 2);
  assert.ok(t.game.earnedRunEvaluation!.contexts.every((c) => c.trace.length > 0));
  assert.throws(t.settle, /二重/);
});

test('継投後の失策は前任者の残した走者の自責点判定にも影響する', () => {
  const t = scenario();
  t.play('strikeout');
  t.play('strikeout');
  t.play('walk');
  t.play('walk');
  t.relieve();
  t.play('reachedOnError');
  t.play('homeRun');
  t.play('strikeout');
  const runs = t.settle();
  assert.equal(runs.length, 4);
  assert.ok(runs.every((r) => r.earnedForPitcher === false && r.earnedForTeam === false));
});

test('失策で早く生還した走者を残し、後続安打で生還できた場合だけ自責点にする', () => {
  for (const laterHit of [false, true]) {
    const t = scenario();
    t.play('walk');
    t.play('walk');
    t.play('walk');
    const error = t.play('reachedOnError');
    const scoredId = error.runDecisions[0]!.runInstanceId;
    t.play('strikeout');
    if (laterHit) t.play('homeRun');
    t.play('strikeout');
    t.play('strikeout');
    const runs = t.settle();
    const early = runs.find((r) => r.runInstanceId === scoredId)!;
    assert.equal(early.earnedForPitcher, laterHit);
    const trace = t.game.earnedRunEvaluation!.contexts[0]!.trace;
    assert.ok(
      trace
        .find((step) => step.eventSeq === error.eventSeq)!
        .bases.some((runner) => runner?.runInstanceId === scoredId),
    );
  }
});

test('失策出塁者が野選で入れ替わっても、存在しない仮想走者を出塁させない', () => {
  const t = scenario();
  t.play('reachedOnError');
  t.ball.batterFirstBaseTimeMs = 3500;
  const choice = t.play('battedOut');
  assert.equal(choice.outcome, 'fieldersChoice');
  t.play('homeRun');
  t.play('strikeout');
  t.play('strikeout');
  const runs = t.settle();
  assert.deepEqual(
    runs.map((r) => r.earnedForPitcher),
    [false, true],
  );
});

test('失策無効時はv9と投球・打球・進行・乱数・投手成績が一致する', () => {
  for (let i = 1; i <= 20; i++) {
    const seed = Math.imul(i, 2654435761) >>> 0;
    const old = createGame(seed, undefined, 'game-prototype-v9', baseline);
    const game = createGame(seed, undefined, 'game-prototype-v10', baseline, disabled);
    runToCompletion(old);
    runToCompletion(game);
    const oldResult = finalizeGame(old);
    const result = finalizeGame(game);
    assert.deepEqual(result.pitching, oldResult.pitching);
    assert.deepEqual(result.batting, oldResult.batting);
    assert.deepEqual(game.state.rng, old.state.rng);
    assert.deepEqual(
      game.events.map((e) => [e.pitch, e.battedBall, e.before, e.after, e.outcome]),
      old.events.map((e) => [e.pitch, e.battedBall, e.before, e.after, e.outcome]),
    );
  }
});

test('100条件で失策・得点・自責点・刺殺が整合し、保存と確定を再現する', () => {
  let errors = 0,
    unearned = 0;
  for (let i = 1; i <= 100; i++) {
    const game = createGame(Math.imul(i, 2654435761) >>> 0);
    runToCompletion(game);
    const result = finalizeGame(game);
    const before = canonicalJson(game);
    assert.strictEqual(finalizeGame(game), result);
    assert.equal(canonicalJson(game), before);
    for (const side of ['away', 'home'] as const) {
      const ids = game.fixture.clubs.find(
        (c) => c.clubId === game.fixture.teams[side].clubId,
      )!.playerIds;
      const fielding = result.fielding!.filter((line) => ids.includes(line.playerId));
      assert.equal(
        fielding.reduce((s, line) => s + line.errors!, 0),
        result.teamStats![side].errors,
      );
      assert.equal(
        fielding.reduce((s, line) => s + line.putouts, 0),
        result.pitching
          .filter((line) => ids.includes(line.playerId))
          .reduce((s, p) => s + p.outsRecorded, 0),
      );
      errors += result.teamStats![side].errors;
    }
    for (const p of result.pitching) {
      assert.ok(p.earnedRuns >= 0 && p.earnedRuns <= p.runsAllowed);
      unearned += p.runsAllowed - p.earnedRuns;
    }
    for (const e of game.events)
      for (const r of e.runDecisions) assert.equal(typeof r.earnedForTeam, 'boolean');
  }
  assert.ok(errors > 0 && unearned > 0);
});

test('失策設定の既定値変更後も保存設定で復元し、再構成や帰属の改変を拒否する', async () => {
  const db = new GameDatabase('error-config-' + crypto.randomUUID());
  const original = structuredClone(defaults);
  try {
    const game = createGame(3668339987);
    runToCompletion(game);
    finalizeGame(game);
    const adapter = new DexieStorageAdapter(db);
    await adapter.commitSnapshot(game, 0);
    Object.assign(defaults, disabled);
    assert.deepEqual((await adapter.loadSnapshot()).record, game);
    validateCompletedRecord(game);
    const mutations: ((r: GameRecord) => void)[] = [
      (r) => {
        delete r.state.errorConfig;
      },
      (r) => {
        r.earnedRunEvaluation!.contexts[0]!.trace[0]!.outs++;
      },
      (r) => {
        r.events.find((e) => e.runDecisions.length)!.runDecisions[0]!.earnedForTeam =
          !r.events.find((e) => e.runDecisions.length)!.runDecisions[0]!.earnedForTeam;
      },
      (r) => {
        r.events.find((e) => e.errorEvaluation?.occurred)!.errorEvaluation!.probability = 1;
      },
    ];
    for (const mutate of mutations) {
      const altered = structuredClone(game);
      mutate(altered);
      assert.throws(() => validateCompletedRecord(altered));
    }
  } finally {
    Object.assign(defaults, original);
    await db.delete();
  }
});

test('併殺・野選候補では捕球失策を追加せず、一三塁の失策は三塁走者を進めない', () => {
  const t = scenario();
  t.play('walk');
  t.game.state.errorConfig = certain;
  assert.equal(
    evaluateFieldingError(t.game.state, t.game.fixture, t.ball, t.template.pitch),
    undefined,
  );
  t.ball.batterFirstBaseTimeMs = 3500;
  assert.equal(
    evaluateFieldingError(t.game.state, t.game.fixture, t.ball, t.template.pitch),
    undefined,
  );
  const third = structuredClone(t.game.state.baseOccupants[0]!);
  third.runInstanceId = 'fixed-third';
  third.currentRunnerId = t.game.fixture.teams.away.lineup[5]!.playerId;
  t.game.state.baseOccupants[2] = third;
  const event = t.play('reachedOnError');
  assert.deepEqual(t.game.state.baseOccupants[2], third);
  assert.equal(event.runDecisions.length, 0);
  assert.equal(event.runnerActions.length, 2);
});

test('異常停止や不整合な試合の自責点確定は正本に部分反映しない', () => {
  const game = createGame(3668339987);
  assert.throws(() => finalizeGame(game), /正常終了/);
  runToCompletion(game);
  game.state.totalPitches++;
  const before = canonicalJson(game);
  assert.throws(() => finalizeGame(game), /投球数/);
  assert.equal(canonicalJson(game), before);
});
