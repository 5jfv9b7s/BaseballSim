import { simulatePitchV4 } from '../engine/pitch-v4.ts';
import { simulatePitchV3 } from '../engine/pitch-v3.ts';
import { simulatePitchV2 } from '../engine/pitch-v2.ts';
import type { Fixture, PrototypeState } from '../engine/types.ts';
import { simulatePitch } from '../engine/pitch.ts';
import { MODEL as PITCH_MODEL } from '../engine/model.ts';
import { ensure, integer, validateFixture, validateRng } from '../engine/validation.ts';
import { generateBattedBall } from './batted-ball.ts';
import { createGameFixture } from './fixture.ts';
import { GAME_MODEL as m } from './model.ts';
import { CURRENT_GAME_MODEL, gameModel, type GameModelVersion } from './model-registry.ts';
import { hitDestinations } from './running.ts';
import type {
  AppearanceOutcome,
  GameEvent,
  GameFixture,
  GameRecord,
  GameState,
  Runner,
  Situation,
  TeamSide,
} from './types.ts';

export const offenseSide = (state: Situation): TeamSide => (state.half === 'top' ? 'away' : 'home');
export const defenseSide = (state: Situation): TeamSide => (state.half === 'top' ? 'home' : 'away');
export function situation(state: GameState): Situation {
  return structuredClone({
    inning: state.inning,
    half: state.half,
    outs: state.outs,
    count: state.count,
    score: state.score,
    baseOccupants: state.baseOccupants,
  });
}

export function validateGameFixture(fixture: GameFixture): void {
  ensure(fixture.initialDatasetVersion === m.datasetVersion, '未対応の試合データ版です');
  for (const side of ['away', 'home'] as const) {
    const team = fixture.teams[side];
    ensure(
      team.side === side && team.lineup.length === 9 && team.pitcherIds.length === 3,
      '打順9人・投手3人が必要です',
    );
    const positions = new Set(team.lineup.map((p) => p.position));
    ensure(
      positions.size === 9 &&
        ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'].every((p) =>
          positions.has(p as never),
        ),
      '守備位置が不正です',
    );
    const roster = [...team.lineup.map((p) => p.playerId), ...team.pitcherIds];
    ensure(new Set(roster).size === 12, '名簿が重複しています');
    const club = fixture.clubs.find((c) => c.clubId === team.clubId);
    ensure(
      club &&
        roster.length === club.playerIds.length &&
        roster.every((id) => club.playerIds.includes(id)),
      '球団の名簿参照が不正です',
    );
    for (const pitcherId of team.pitcherIds) {
      validateFixture({
        ...fixture,
        matchup: {
          pitcherId,
          catcherId: team.lineup.find((p) => p.position === 'C')!.playerId,
          batterId: fixture.teams[side === 'home' ? 'away' : 'home'].lineup[0]!.playerId,
        },
      });
    }
  }
  for (const player of fixture.players) {
    for (const a of [
      player.powerVsRight,
      player.powerVsLeft,
      player.runningSpeed,
      player.fieldingRange,
      player.armStrength,
    ]) {
      integer(a.valueMilli, 0, 120000, '試合能力');
      integer(a.ceilingMilli, a.valueMilli, 120000, '試合能力上限');
    }
  }
}

export function createGame(
  seed = 20260923,
  fixture = createGameFixture(),
  version: GameModelVersion = CURRENT_GAME_MODEL,
): GameRecord {
  gameModel(version);
  integer(seed, 1, 0xffffffff, 'seed');
  validateGameFixture(fixture);
  const gameId = `game-${seed}`;
  const state: GameState = {
    gameId,
    ...(version === 'game-prototype-v1' ? {} : { simulationVersion: version }),
    phase: 'readyForPitch',
    inning: 1,
    half: 'top',
    outs: 0,
    score: { home: 0, away: 0 },
    count: { balls: 0, strikes: 0 },
    baseOccupants: [null, null, null],
    nextEventSeq: 1,
    nextAppearanceNo: 1,
    appearanceStartSeq: 1,
    paPitches: 0,
    totalPitches: 0,
    lineupIndex: { home: 0, away: 0 },
    pitcherIndex: { home: 0, away: 0 },
    pitcherPitchCounts: Object.fromEntries(
      [...fixture.teams.home.pitcherIds, ...fixture.teams.away.pitcherIds].map((id) => [id, 0]),
    ),
    innings: { away: [0], home: [null] },
    rng: {
      streamId: `${gameId}:attempt:1`,
      algorithmVersion: 'xorshift32-v1',
      fullState: { word: seed },
      drawCount: 0,
    },
    endReason: null,
  };
  return {
    kind: `running-${version}`,
    seed,
    fixture: structuredClone(fixture),
    state,
    events: [],
    result: null,
  };
}

function emptyEvent(state: GameState, kind: GameEvent['kind']): GameEvent {
  const m = gameModel(state.simulationVersion);
  return {
    gameId: state.gameId,
    attemptNo: 1,
    eventSeq: state.nextEventSeq,
    kind,
    before: situation(state),
    after: situation(state),
    appearanceId: kind === 'pitch' ? `${state.gameId}:appearance:${state.nextAppearanceNo}` : null,
    pitch: null,
    battedBall: null,
    outcome: null,
    runnerActions: [],
    outDecisions: [],
    runDecisions: [],
    substitution: null,
    credits: [],
    rngAfter: structuredClone(state.rng),
    simulationVersion: m.version,
    rulesetVersion: m.rulesetVersion,
  };
}

function addCredit(
  event: GameEvent,
  fixture: GameFixture,
  playerId: string,
  category: 'batting' | 'pitching',
  metricCode: string,
  amount = 1,
): void {
  if (amount === 0) return;
  const club = fixture.clubs.find((c) => c.playerIds.includes(playerId));
  ensure(club, '成績の所属参照が不正です');
  event.credits.push({
    creditId: `${event.gameId}:credit:${event.eventSeq}:${event.credits.length + 1}`,
    playerId,
    clubId: club.clubId,
    category,
    metricCode,
    amount,
    sourceEventSeq: event.eventSeq,
    ruleRef: event.rulesetVersion,
  });
}

/** 採用した結果の走者解決。固定入力テストでも同じ処理を使う。 */
export function resolveAppearance(
  state: GameState,
  event: GameEvent,
  fixture: GameFixture,
  inputOutcome: AppearanceOutcome,
  batterId: string,
  pitcherId: string,
): void {
  const offense = offenseSide(state);
  let outcome = inputOutcome;
  let hitBases =
    ({ single: 1, double: 2, triple: 3, homeRun: 4 } as Record<string, number>)[outcome] ?? 0;

  let destinations =
    hitBases > 0 ? hitDestinations(state, fixture, hitBases, event.battedBall) : [0, 0, 0];

  // 本塁打以外のサヨナラは決勝走者が必要とした塁数を上限にする。
  if (hitBases > 0 && hitBases < 4 && offense === 'home' && state.inning >= m.regulationInnings) {
    let score = state.score.home;
    for (let i = 2; i >= 0; i--) {
      if (state.baseOccupants[i] && destinations[i]! >= 4 && ++score > state.score.away) {
        hitBases = Math.min(hitBases, 3 - i);
        outcome = (['single', 'double', 'triple'] as const)[hitBases - 1]!;
        if (
          state.simulationVersion !== undefined &&
          state.simulationVersion !== 'game-prototype-v1'
        ) {
          // 決勝走者より後ろの走者を重複しない塁で止め、余分な得点を付けない。
          let vacant = 3;
          for (let j = i - 1; j >= 0; j--) {
            if (!state.baseOccupants[j]) continue;
            destinations[j] = Math.min(destinations[j]!, vacant);
            vacant = destinations[j]! - 1;
          }
        } else destinations = hitDestinations(state, fixture, hitBases, event.battedBall);
        break;
      }
    }
  }
  event.outcome = outcome;
  const newRunner: Runner = {
    runInstanceId: `${state.gameId}:runner:${state.nextAppearanceNo}`,
    originalRunnerId: batterId,
    currentRunnerId: batterId,
    responsiblePitcherId: pitcherId,
    reachedEventSeq: event.eventSeq,
    reachedReason: outcome,
  };
  const move = (runner: Runner, from: 'batter' | 1 | 2 | 3, to: 1 | 2 | 3 | 'home') => {
    event.runnerActions.push({
      runInstanceId: runner.runInstanceId,
      runnerId: runner.currentRunnerId,
      from,
      to,
      responsiblePitcherId: runner.responsiblePitcherId,
      reason: outcome,
      orderInPlay: event.runnerActions.length + 1,
    });
    if (to === 'home') {
      state.score[offense]++;
      const runs = state.innings[offense][state.inning - 1];
      ensure(typeof runs === 'number', '開始していないイニングへの得点です');
      state.innings[offense][state.inning - 1] = runs + 1;
      event.runDecisions.push({
        runInstanceId: runner.runInstanceId,
        playerId: runner.currentRunnerId,
        responsiblePitcherId: runner.responsiblePitcherId,
        earned: true,
      });
      addCredit(event, fixture, runner.currentRunnerId, 'batting', 'runs');
      addCredit(event, fixture, runner.responsiblePitcherId, 'pitching', 'runsAllowed');
      // 失策・捕逸を生成しない採用規則に限った自責点判定。
      addCredit(event, fixture, runner.responsiblePitcherId, 'pitching', 'earnedRuns');
    } else state.baseOccupants[to - 1] = runner;
  };

  if (outcome === 'walk' || outcome === 'hitByPitch') {
    let forced = 0;
    while (forced < 3 && state.baseOccupants[forced]) forced++;
    for (let i = forced - 1; i >= 0; i--) {
      const runner = state.baseOccupants[i]!;
      state.baseOccupants[i] = null;
      move(runner, (i + 1) as 1 | 2 | 3, i === 2 ? 'home' : ((i + 2) as 2 | 3));
    }
    move(newRunner, 'batter', 1);
  } else if (hitBases > 0) {
    const previous = [...state.baseOccupants];
    state.baseOccupants = [null, null, null];
    for (let i = 2; i >= 0; i--) {
      const runner = previous[i];
      if (runner)
        move(
          runner,
          (i + 1) as 1 | 2 | 3,
          destinations[i]! >= 4 ? 'home' : (destinations[i] as 1 | 2 | 3),
        );
    }
    move(newRunner, 'batter', hitBases === 4 ? 'home' : (hitBases as 1 | 2 | 3));
  } else {
    state.outs++;
    const kind = outcome === 'strikeout' ? 'strikeout' : 'battedOut';
    event.outDecisions.push({
      playerId: batterId,
      creditedPitcherId: pitcherId,
      kind,
      countsTowardInning: true,
    });
    addCredit(event, fixture, pitcherId, 'pitching', 'outsRecorded');
  }

  addCredit(event, fixture, batterId, 'batting', 'plateAppearances');
  addCredit(event, fixture, pitcherId, 'pitching', 'battersFaced');
  if (outcome !== 'walk' && outcome !== 'hitByPitch')
    addCredit(event, fixture, batterId, 'batting', 'atBats');
  if (hitBases > 0) {
    addCredit(event, fixture, batterId, 'batting', 'hits');
    addCredit(event, fixture, pitcherId, 'pitching', 'hitsAllowed');
    if (hitBases >= 2)
      addCredit(
        event,
        fixture,
        batterId,
        'batting',
        ({ 2: 'doubles', 3: 'triples', 4: 'homeRuns' } as Record<number, string>)[hitBases]!,
      );
    if (hitBases === 4) addCredit(event, fixture, pitcherId, 'pitching', 'homeRunsAllowed');
  }
  if (outcome === 'strikeout') {
    addCredit(event, fixture, batterId, 'batting', 'strikeouts');
    addCredit(event, fixture, pitcherId, 'pitching', 'strikeouts');
  }
  if (outcome === 'walk') {
    addCredit(event, fixture, batterId, 'batting', 'walks');
    addCredit(event, fixture, pitcherId, 'pitching', 'walks');
  }
  if (outcome === 'hitByPitch') {
    addCredit(event, fixture, batterId, 'batting', 'hitByPitch');
    addCredit(event, fixture, pitcherId, 'pitching', 'hitBatters');
  }
  addCredit(event, fixture, batterId, 'batting', 'runsBattedIn', event.runDecisions.length);
  state.lineupIndex[offense] = (state.lineupIndex[offense] + 1) % 9;
  state.nextAppearanceNo++;
  state.appearanceStartSeq = state.nextEventSeq + 1;
  state.paPitches = 0;
  state.count = { balls: 0, strikes: 0 };
  if (
    offense === 'home' &&
    state.inning >= m.regulationInnings &&
    state.score.home > state.score.away
  ) {
    state.phase = 'gameComplete';
    state.endReason = 'walkOff';
  } else if (state.outs === 3) state.phase = 'halfComplete';
}

export function advanceGameEvent(
  input: GameState,
  fixture: GameFixture,
): { state: GameState; event: GameEvent } {
  ensure(
    input.phase !== 'gameComplete' && input.phase !== 'aborted',
    '終了した試合は進められません',
  );
  validateRng(input.rng);
  const state = structuredClone(input);
  const offense = offenseSide(state);
  const defense = defenseSide(state);
  let event: GameEvent;

  if (state.phase === 'halfComplete') {
    event = emptyEvent(state, 'halfEnd');
    if (
      state.inning >= m.regulationInnings &&
      (state.half === 'top'
        ? state.score.home > state.score.away
        : state.score.home !== state.score.away || state.inning >= m.maximumInnings)
    ) {
      state.phase = 'gameComplete';
      state.endReason = state.score.home === state.score.away ? 'draw' : 'regulation';
    } else {
      state.outs = 0;
      state.baseOccupants = [null, null, null];
      state.count = { balls: 0, strikes: 0 };
      state.paPitches = 0;
      state.phase = 'readyForPitch';
      if (state.half === 'top') {
        state.half = 'bottom';
        state.innings.home[state.inning - 1] = 0;
      } else {
        state.half = 'top';
        state.inning++;
        state.innings.away.push(0);
        state.innings.home.push(null);
      }
      state.appearanceStartSeq = state.nextEventSeq + 1;
    }
  } else if (state.totalPitches >= m.maxGamePitches || state.paPitches >= m.maxAppearancePitches) {
    event = emptyEvent(state, 'aborted');
    state.phase = 'aborted';
    state.endReason = 'pitchLimit';
  } else {
    const team = fixture.teams[defense];
    const pitcherId = team.pitcherIds[state.pitcherIndex[defense]]!;
    const pitchCount = state.pitcherPitchCounts[pitcherId]!;
    const threshold =
      state.pitcherIndex[defense] === 0 ? m.starterPitchLimit : m.relieverPitchLimit;
    if (
      state.paPitches === 0 &&
      pitchCount >= threshold &&
      state.pitcherIndex[defense] < team.pitcherIds.length - 1
    ) {
      event = emptyEvent(state, 'substitution');
      state.pitcherIndex[defense]++;
      event.substitution = {
        side: defense,
        outPlayerId: pitcherId,
        inPlayerId: team.pitcherIds[state.pitcherIndex[defense]]!,
      };
      state.appearanceStartSeq = state.nextEventSeq + 1;
    } else {
      event = emptyEvent(state, 'pitch');
      const batterId = fixture.teams[offense].lineup[state.lineupIndex[offense]]!.playerId;
      const pitchFixture: Fixture = {
        ...fixture,
        matchup: {
          pitcherId,
          batterId,
          catcherId: team.lineup.find((p) => p.position === 'C')!.playerId,
        },
      };
      const pitchState: PrototypeState = {
        kind: 'pitch-lab-v1',
        gameId: state.gameId,
        attemptNo: 1,
        activeAppearanceId: event.appearanceId!,
        phase: 'readyForPitch',
        count: state.count,
        nextEventSeq: state.nextEventSeq,
        rng: state.rng,
        simulationVersion: PITCH_MODEL.version,
        rulesetVersion: PITCH_MODEL.rulesetVersion,
        initialDatasetVersion: fixture.initialDatasetVersion,
      };
      const {
        kind: _kind,
        simulationVersion: _version,
        rulesetVersion: _rules,
        ...context
      } = pitchState;
      const commandId = `${state.gameId}:pitch:${state.nextEventSeq}`;
      const step =
        state.simulationVersion === 'game-prototype-v6'
          ? simulatePitchV4(context, pitchFixture, commandId)
          : state.simulationVersion === 'game-prototype-v4' ||
              state.simulationVersion === 'game-prototype-v5'
            ? simulatePitchV3(context, pitchFixture, commandId)
            : state.simulationVersion === 'game-prototype-v3'
              ? simulatePitchV2(context, pitchFixture, commandId)
              : simulatePitch(pitchState, pitchFixture, commandId);
      if ('decision' in step) event.pitchDecision = step.decision;
      event.pitch = step.event.pitch;
      state.rng = step.state.rng;
      state.totalPitches++;
      state.paPitches++;
      state.pitcherPitchCounts[pitcherId] = pitchCount + 1;
      addCredit(event, fixture, pitcherId, 'pitching', 'pitches');
      const pitch = event.pitch;
      const bodyX = pitch.battingSide === 'R' ? -410 : 410;
      const hbp = event.pitchDecision
        ? event.pitchDecision.hitByPitch
        : pitch.action === 'take' &&
          Math.abs(pitch.actualLocation.xMm - bodyX) <= 75 &&
          pitch.actualLocation.zMm >= 400 &&
          pitch.actualLocation.zMm <= 1500;
      if (hbp) {
        pitch.ruling = 'hitByPitch';
        resolveAppearance(state, event, fixture, 'hitByPitch', batterId, pitcherId);
      } else if (
        step.event.stopReason === 'walkPending' ||
        step.event.stopReason === 'strikeoutPending'
      ) {
        resolveAppearance(
          state,
          event,
          fixture,
          step.event.stopReason === 'walkPending' ? 'walk' : 'strikeout',
          batterId,
          pitcherId,
        );
      } else if (step.event.stopReason === 'inPlayPending') {
        const generated = generateBattedBall(
          step.event.pitch,
          fixture,
          defense,
          state.rng,
          gameModel(state.simulationVersion).version,
        );
        state.rng = generated.rng;
        event.battedBall = generated.ball;
        const outcome = (['battedOut', 'single', 'double', 'triple', 'homeRun'] as const)[
          generated.ball.projectedBases
        ]!;
        resolveAppearance(state, event, fixture, outcome, batterId, pitcherId);
      } else state.count = step.state.count;
    }
  }

  state.nextEventSeq++;
  event.after = situation(state);
  event.rngAfter = structuredClone(state.rng);
  return { state, event };
}

export function stepRecord(record: GameRecord): void {
  // 正本所有者内のみで使用。1イベントの計算・検査が成功してからまとめて反映する。
  const next = advanceGameEvent(record.state, record.fixture);
  record.state = next.state;
  record.events.push(next.event);
}

export function runToCompletion(record: GameRecord): void {
  while (record.state.phase !== 'gameComplete' && record.state.phase !== 'aborted')
    stepRecord(record);
}
