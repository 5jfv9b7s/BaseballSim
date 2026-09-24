import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceGameEvent,
  createGame,
  resolveAppearance,
  runToCompletion,
  stepRecord,
} from '../src/game/engine.ts';
import { aggregateResult, finalizeGame } from '../src/game/results.ts';
import { GAME_MODEL } from '../src/game/model.ts';
import { generateBattedBall } from '../src/game/batted-ball.ts';
import { GameController } from '../src/game/controller.ts';
import { canonicalJson, validateCompletedRecord } from '../src/storage/codec.ts';
import type { GameState, Runner } from '../src/game/types.ts';
import type { StorageAdapter } from '../src/storage/adapter.ts';

function setup() {
  const record = createGame(20260923);
  const { event } = advanceGameEvent(record.state, record.fixture);
  event.credits = [];
  event.runnerActions = [];
  event.outDecisions = [];
  event.runDecisions = [];
  const side = record.fixture.teams.away;
  const pitcherId = record.fixture.teams.home.pitcherIds[0]!;
  const batterId = side.lineup[0]!.playerId;
  const runner = (index: number, responsible = pitcherId): Runner => ({
    runInstanceId: 'runner-' + index,
    originalRunnerId: side.lineup[index]!.playerId,
    currentRunnerId: side.lineup[index]!.playerId,
    responsiblePitcherId: responsible,
    reachedEventSeq: index,
    reachedReason: 'single',
  });
  return {
    record,
    state: record.state,
    fixture: record.fixture,
    event,
    pitcherId,
    batterId,
    runner,
  };
}

test('満塁四球は強制進塁だけを処理し、走者の責任投手へ失点を付ける', () => {
  const { state, fixture, event, pitcherId, batterId, runner } = setup();
  const oldPitcher = fixture.teams.home.pitcherIds[1]!;
  state.baseOccupants = [runner(1), runner(2), runner(3, oldPitcher)];
  resolveAppearance(state, event, fixture, 'walk', batterId, pitcherId);
  assert.equal(state.score.away, 1);
  assert.deepEqual(
    state.baseOccupants.map((r) => r?.currentRunnerId),
    [batterId, runner(1).currentRunnerId, runner(2).currentRunnerId],
  );
  assert.equal(event.runDecisions[0]!.responsiblePitcherId, oldPitcher);
  assert.equal(event.credits.find((c) => c.metricCode === 'runsAllowed')!.playerId, oldPitcher);
  assert.equal(
    event.credits.some((c) => c.metricCode === 'atBats'),
    false,
  );
  assert.equal(event.credits.find((c) => c.metricCode === 'runsBattedIn')!.amount, 1);
});

test('一・三塁の死球は三塁を進めず、三振は走者を進めない', () => {
  const { state, fixture, event, pitcherId, batterId, runner } = setup();
  state.baseOccupants = [runner(1), null, runner(3)];
  resolveAppearance(state, event, fixture, 'hitByPitch', batterId, pitcherId);
  assert.equal(state.score.away, 0);
  assert.equal(state.baseOccupants[2]!.runInstanceId, 'runner-3');
  assert.equal(state.baseOccupants[1]!.runInstanceId, 'runner-1');
  const bases = structuredClone(state.baseOccupants);
  event.credits = [];
  event.runnerActions = [];
  state.outs = 2;
  resolveAppearance(
    state,
    event,
    fixture,
    'strikeout',
    fixture.teams.away.lineup[4]!.playerId,
    pitcherId,
  );
  assert.deepEqual(state.baseOccupants, bases);
  assert.equal(state.outs, 3);
  assert.equal(state.phase, 'halfComplete');
  assert.equal(event.credits.find((c) => c.metricCode === 'outsRecorded')!.amount, 1);
});

test('満塁本塁打は4得点、二塁打は塁の重複なしで進塁する', () => {
  for (const outcome of ['homeRun', 'double'] as const) {
    const { state, fixture, event, pitcherId, batterId, runner } = setup();
    state.baseOccupants = [runner(1), runner(2), runner(3)];
    resolveAppearance(state, event, fixture, outcome, batterId, pitcherId);
    assert.equal(state.score.away, outcome === 'homeRun' ? 4 : 2);
    assert.equal(
      event.credits.find((c) => c.metricCode === 'runsBattedIn')!.amount,
      state.score.away,
    );
    if (outcome === 'homeRun') assert.deepEqual(state.baseOccupants, [null, null, null]);
    else
      assert.deepEqual(
        state.baseOccupants.map((r) => r?.currentRunnerId ?? null),
        [null, batterId, runner(1).currentRunnerId],
      );
  }
});

test('非本塁打サヨナラは決勝走者が必要な塁数まで、本塁打は全走者を数える', () => {
  for (const outcome of ['double', 'homeRun'] as const) {
    const { state, fixture, event } = setup();
    state.inning = 9;
    state.half = 'bottom';
    state.innings = { away: Array(9).fill(0), home: Array(9).fill(0) };
    const batter = fixture.teams.home.lineup[0]!.playerId;
    const pitcher = fixture.teams.away.pitcherIds[0]!;
    const ids = fixture.teams.home.lineup.slice(1, 4).map((p) => p.playerId);
    state.baseOccupants = ids.map((id, i) => ({
      runInstanceId: 'h-' + i,
      originalRunnerId: id,
      currentRunnerId: id,
      responsiblePitcherId: pitcher,
      reachedEventSeq: i + 1,
      reachedReason: 'single',
    })) as GameState['baseOccupants'];
    resolveAppearance(state, event, fixture, outcome, batter, pitcher);
    assert.equal(state.phase, 'gameComplete');
    assert.equal(state.endReason, 'walkOff');
    assert.equal(state.score.home, outcome === 'homeRun' ? 4 : 1);
    assert.equal(event.outcome, outcome === 'homeRun' ? 'homeRun' : 'single');
  }
});

test('9回裏省略・延長・12回引分・打順継続・走者リセット', () => {
  const r = createGame();
  const state = {
    ...r.state,
    inning: 9,
    outs: 3,
    phase: 'halfComplete' as const,
    innings: { away: Array(9).fill(0), home: [...Array(8).fill(0), null] },
  };
  assert.equal(
    advanceGameEvent({ ...state, score: { home: 1, away: 0 } }, r.fixture).state.phase,
    'gameComplete',
  );
  const bottom = advanceGameEvent(state, r.fixture).state;
  assert.equal(bottom.half, 'bottom');
  assert.equal(bottom.outs, 0);
  const extra = advanceGameEvent({ ...bottom, outs: 3, phase: 'halfComplete' }, r.fixture).state;
  assert.equal(extra.inning, 10);
  assert.equal(extra.half, 'top');
  assert.deepEqual(extra.baseOccupants, [null, null, null]);
  const draw = advanceGameEvent(
    { ...bottom, inning: 12, outs: 3, phase: 'halfComplete' },
    r.fixture,
  ).state;
  assert.equal(draw.endReason, 'draw');
});

test('自動継投は打席間のみ。投球を捏造せず乱数を消費しない', () => {
  const r = createGame();
  const pitcher = r.fixture.teams.home.pitcherIds[0]!;
  r.state.pitcherPitchCounts[pitcher] = GAME_MODEL.starterPitchLimit;
  const next = advanceGameEvent(r.state, r.fixture);
  assert.equal(next.event.kind, 'substitution');
  assert.equal(next.event.pitch, null);
  assert.equal(next.state.pitcherIndex.home, 1);
  assert.deepEqual(next.state.rng, r.state.rng);
  const during = advanceGameEvent({ ...r.state, paPitches: 1 }, r.fixture);
  assert.equal(during.event.kind, 'pitch');
  assert.equal(during.event.pitch!.pitcherId, pitcher);
});

test('異常上限は正常終了と区別し、保存可能な成績にしない', () => {
  const r = createGame();
  r.state.paPitches = GAME_MODEL.maxAppearancePitches;
  stepRecord(r);
  assert.equal(r.state.phase, 'aborted');
  assert.equal(r.state.endReason, 'pitchLimit');
  assert.throws(() => finalizeGame(r));
  assert.throws(() => validateCompletedRecord(r));
});

test('固定入力の逐次進行と一括進行が一致し、結果確定を重ねても増えない', () => {
  const a = createGame(20260923);
  const b = createGame(20260923);
  runToCompletion(a);
  while (b.state.phase !== 'gameComplete') stepRecord(b);
  assert.deepEqual(a, b);
  const result = structuredClone(finalizeGame(a));
  assert.deepEqual(finalizeGame(a), result);
  assert.deepEqual(aggregateResult(a), result);
  const completed = canonicalJson(a);
  validateCompletedRecord(a);
  assert.equal(canonicalJson(a), completed);
  assert.deepEqual(JSON.parse(completed), a);
  const corrupt = structuredClone(a);
  corrupt.result!.batting[0]!.hits++;
  assert.throws(() => validateCompletedRecord(corrupt));
});

test('100条件で正常終了、成績整合、主な生成結果と継投を確認', () => {
  const outcomes = new Set<string>();
  let substitutions = 0;
  for (let i = 1; i <= 100; i++) {
    const r = createGame(Math.imul(i, 2654435761) >>> 0);
    runToCompletion(r);
    const result = finalizeGame(r);
    assert.ok(r.state.inning >= 9 && r.state.inning <= 12);
    assert.ok(result.totalPitches < GAME_MODEL.maxGamePitches);
    for (const e of r.events) {
      assert.ok(e.after.count.balls <= 3 && e.after.count.strikes <= 2 && e.after.outs <= 3);
      const runners = e.after.baseOccupants.filter(Boolean).map((r) => r!.runInstanceId);
      assert.equal(new Set(runners).size, runners.length);
      if (e.outcome) outcomes.add(e.outcome);
      if (e.substitution) substitutions++;
    }
  }
  for (const outcome of [
    'single',
    'double',
    'homeRun',
    'walk',
    'hitByPitch',
    'strikeout',
    'battedOut',
  ])
    assert.ok(outcomes.has(outcome), outcome);
  assert.ok(substitutions > 0);
});

test('打球の到達判定から三塁打も生成可能。未校正の極端な能力で分岐検証', () => {
  const r = createGame();
  const pitch = advanceGameEvent(r.state, r.fixture).event.pitch!;
  const fixture = structuredClone(r.fixture);
  for (const p of fixture.players) {
    p.runningSpeed = {
      valueMilli: p.playerId === pitch.batterId ? 120000 : 0,
      ceilingMilli: 120000,
    };
    p.armStrength = { valueMilli: 0, ceilingMilli: 120000 };
    p.fieldingRange = { valueMilli: 0, ceilingMilli: 120000 };
  }
  let triple = false;
  for (let i = 1; i <= 500; i++) {
    const rng = { ...r.state.rng, fullState: { word: Math.imul(i, 2654435761) >>> 0 } };
    const ball = generateBattedBall(pitch as never, fixture, 'home', rng).ball;
    if (ball.projectedBases === 3) {
      triple = true;
      break;
    }
  }
  assert.ok(triple);
});

test('指示再送・表示で状態を進めず、保存失敗で正本を変えない', async () => {
  const unavailable: StorageAdapter = {
    listSlots: async () => ({
      snapshotId: null,
      previousSnapshotId: null,
      storageRevision: 0,
      updatedAt: null,
    }),
    commitSnapshot: async () => {
      throw new Error('disk full');
    },
    loadSnapshot: async () => {
      throw new Error('no save');
    },
  };
  const c = new GameController(unavailable);
  await c.initialize();
  const command = {
    kind: 'advance' as const,
    count: 25,
    commandId: 'advance-1',
    expectedStateRevision: 0,
  };
  const first = await c.dispatch(command);
  assert.deepEqual(await c.dispatch(command), first);
  assert.deepEqual(c.query(), first);
  await assert.rejects(c.dispatch({ ...command, count: 1 }), /異なります/);
  let view = first;
  while (view.state.phase !== 'gameComplete')
    view = await c.dispatch({
      kind: 'advance',
      count: 25,
      commandId: 'run-' + view.revision,
      expectedStateRevision: view.revision,
    });
  await assert.rejects(
    c.dispatch({ kind: 'save', commandId: 'save-1', expectedStateRevision: view.revision }),
    /disk full/,
  );
  assert.deepEqual(c.query(), view);
  await assert.rejects(
    c.dispatch({
      kind: 'load',
      previous: false,
      commandId: 'load-1',
      expectedStateRevision: view.revision,
    }),
    /no save/,
  );
  assert.deepEqual(c.query(), view);
  const baseline = createGame(view.seed);
  runToCompletion(baseline);
  finalizeGame(baseline);
  assert.deepEqual(view.state, baseline.state);
  assert.deepEqual(view.result, baseline.result);
});
