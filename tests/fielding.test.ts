import test from 'node:test';
import assert from 'node:assert/strict';
import baseline from './fixtures/match-v7-baseline.json' with { type: 'json' };
import { advanceGameEvent, createGame, runToCompletion } from '../src/game/engine.ts';
import { recordFielding } from '../src/game/fielding.ts';
import { finalizeGame } from '../src/game/results.ts';
import { canonicalJson, validateCompletedRecord } from '../src/storage/codec.ts';
import type { BattedBall, GameRecord, DefensivePosition } from '../src/game/types.ts';

function setup(position: DefensivePosition = 'SS', type: BattedBall['type'] = 'ground') {
  const game = createGame(20260923, undefined, 'game-prototype-v9', baseline);
  const event = advanceGameEvent(game.state, game.fixture).event;
  delete event.defensiveAlignment;
  delete event.fieldingActions;
  event.credits = [];
  const team = game.fixture.teams.home;
  const at = (position: DefensivePosition) => ({
    playerId:
      position === 'P'
        ? event.pitch!.pitcherId
        : team.lineup.find((p) => p.position === position)!.playerId,
    position,
  });
  event.outcome = 'battedOut';
  event.outDecisions = [
    {
      playerId: event.pitch!.batterId,
      creditedPitcherId: event.pitch!.pitcherId,
      kind: 'battedOut',
      countsTowardInning: true,
    },
  ];
  // 記録層に必要な打球条件だけを固定。時間式の試験とは分離する。
  event.battedBall = {
    sourcePitchSeq: event.eventSeq,
    exitVelocityCentiKph: 10000,
    launchAngleCentiDegree: type === 'ground' ? 0 : 4000,
    launchSprayAngleCentiDegree: 0,
    fairBearingCentiDegree: 0,
    type,
    isBunt: false,
    fairStatus: 'fair',
    directionCode: 'center',
    directionDefinitionVersion: 'design-v1.0',
    terminalLocation: { xMm: 0, yMm: 50000 },
    flightTimeMs: 3000,
    distanceMm: 50000,
    fenceDistanceMm: 120000,
    fielderId: at(position).playerId,
    fieldingPosition: position,
    fielderDistanceMm: 0,
    fielderReachMm: 20000,
    fieldingTimeMs: 3000,
    batterFirstBaseTimeMs: 4500,
    projectedBases: 0,
    modelVersion: 'batted-ball-prototype-v4',
  };
  const credits = (metric: string) => event.credits.filter((c) => c.metricCode === metric);
  const record = () => recordFielding(event, game.fixture);
  return { game, event, at, credits, record };
}

test('三振は捕手の刺殺だけを記録し、投手に補殺を付けない', () => {
  const t = setup();
  t.event.outcome = 'strikeout';
  t.event.battedBall = null;
  t.event.outDecisions[0]!.kind = 'strikeout';
  const before = canonicalJson(t.game.state);
  t.record();
  assert.deepEqual(
    t.credits('putouts').map((c) => [c.playerId, c.amount]),
    [[t.at('C').playerId, 1]],
  );
  assert.equal(t.credits('assists').length, 0);
  assert.equal(t.credits('fieldingOuts').length, 9);
  assert.equal(canonicalJson(t.game.state), before);
  assert.equal(
    t.event.defensiveAlignment!.some((p) => (p.position as string) === 'DH'),
    false,
  );
  assert.throws(t.record, /二重適用/);
});

test('ゴロの送球者へ補殺・一塁手へ刺殺、一塁手の自己処理は補殺なし', () => {
  for (const position of ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'] as const) {
    const t = setup(position);
    t.record();
    assert.equal(t.credits('putouts')[0]!.playerId, t.at('1B').playerId);
    assert.deepEqual(
      t.credits('assists').map((c) => c.playerId),
      position === '1B' ? [] : [t.at(position).playerId],
    );
    assert.deepEqual(
      t.event
        .fieldingActions!.filter((a) => a.kind === 'putout')
        .map((a) => [a.outDecisionIndex, a.targetBase]),
      [[0, 1]],
    );
    assert.equal(t.credits('doublePlayParticipations').length, 0);
  }
});

test('飛球・ライナー・ポップ・犠飛は捕球者の刺殺。犠飛の返球に補殺を付けない', () => {
  for (const type of ['fly', 'line', 'popup'] as const) {
    for (const position of ['P', '1B', 'SS', 'LF', 'CF', 'RF'] as const) {
      const t = setup(position, type);
      if (type === 'fly') t.event.outcome = 'sacrificeFly';
      t.record();
      assert.equal(t.credits('putouts')[0]!.playerId, t.at(position).playerId);
      assert.equal(t.credits('assists').length, 0);
    }
  }
});

test('併殺と野選は二塁刺殺を共有し、失敗した転送には補殺・併殺関与を付けない', () => {
  for (const position of ['P', '3B', 'SS', '2B'] as const) {
    for (const completed of [true, false]) {
      const t = setup(position);
      const pivot = t.at(position === '2B' ? 'SS' : '2B');
      t.event.outcome = completed ? 'battedOut' : 'fieldersChoice';
      t.event.fieldingEvaluation = {
        modelVersion: 'in-play-prototype-v2',
        play: 'doublePlay',
        completed,
        resolution: completed ? 'doublePlay' : 'fieldersChoice',
        preparationTimeMs: 400,
        participants: [
          { ...t.at(position), role: 'field' },
          { ...pivot, role: 'pivot' },
          { ...t.at('1B'), role: 'receive' },
        ],
        defenseArrivalMs: [2500, 3800],
        runnerArrivalMs: [3500, completed ? 4000 : 3500],
      };
      const batterOut = t.event.outDecisions[0]!;
      t.event.outDecisions = [
        {
          ...batterOut,
          playerId: t.game.fixture.teams.away.lineup[3]!.playerId,
          kind: 'forceOut',
          atBase: 2,
          orderInPlay: 1,
        },
        ...(completed ? [{ ...batterOut, atBase: 1 as const, orderInPlay: 2 }] : []),
      ];
      t.record();
      assert.deepEqual(
        t.credits('putouts').map((c) => c.playerId),
        completed ? [pivot.playerId, t.at('1B').playerId] : [pivot.playerId],
      );
      assert.deepEqual(
        t.credits('assists').map((c) => c.playerId),
        completed ? [t.at(position).playerId, pivot.playerId] : [t.at(position).playerId],
      );
      assert.equal(t.credits('doublePlayParticipations').length, completed ? 3 : 0);
      assert.ok(t.credits('assists').every((c) => c.amount === 1));
      assert.ok(t.credits('fieldingOuts').every((c) => c.amount === (completed ? 2 : 1)));
      assert.equal(t.event.fieldingActions!.filter((a) => a.kind === 'throw').length, 2);
      assert.deepEqual(
        t.event.fieldingActions!.map((a) => a.actionSeq),
        t.event.fieldingActions!.map((_, i) => i + 1),
      );
    }
  }
});

function normalize(record: GameRecord): unknown {
  const plain = structuredClone(record);
  delete plain.result!.fielding;
  for (const event of plain.events) {
    delete event.defensiveAlignment;
    delete event.fieldingActions;
    event.credits = event.credits.filter((credit) => credit.category !== 'fielding');
  }
  return JSON.parse(
    canonicalJson(plain)
      .replaceAll('game-prototype-v9', 'game-prototype-v8')
      .replaceAll('game-rules-prototype-v9', 'game-rules-prototype-v8'),
  );
}

test('100条件でv8の試合・乱数を維持し、位置別守備回と刺殺・投球アウトが整合する', () => {
  const kinds = new Set<string>();
  for (let i = 1; i <= 100; i++) {
    const seed = Math.imul(i, 2654435761) >>> 0;
    const game = createGame(seed, undefined, 'game-prototype-v9', baseline);
    const old = createGame(seed, undefined, 'game-prototype-v8', baseline);
    runToCompletion(game);
    runToCompletion(old);
    const result = finalizeGame(game);
    finalizeGame(old);
    assert.deepEqual(normalize(game), JSON.parse(canonicalJson(old)));
    assert.strictEqual(finalizeGame(game), result);
    for (const event of game.events) {
      if (event.kind !== 'pitch') {
        assert.equal(event.defensiveAlignment, undefined);
        continue;
      }
      assert.equal(event.defensiveAlignment!.length, 9);
      assert.equal(new Set(event.defensiveAlignment!.map((p) => p.playerId)).size, 9);
      const actions = event.fieldingActions!;
      const references = actions.filter((a) => a.kind === 'putout').map((a) => a.outDecisionIndex);
      assert.deepEqual(
        references,
        event.outDecisions.map((_, index) => index),
      );
      for (const action of actions) {
        assert.ok(
          event.defensiveAlignment!.some(
            (p) => p.playerId === action.playerId && p.position === action.position,
          ),
        );
        for (const index of action.assistedOutIndices ?? []) assert.ok(event.outDecisions[index]);
      }
      if (!event.outDecisions.length) assert.deepEqual(actions, []);
      if (event.outcome) kinds.add(event.outcome);
    }
    for (const line of result.fielding!) {
      assert.equal(line.gamesAtPosition, 1);
      assert.equal('errors' in line, false);
      assert.notEqual(line.position as string, 'DH');
      if (line.position === 'P')
        assert.equal(
          line.fieldingOuts,
          result.pitching.find((p) => p.playerId === line.playerId)!.outsRecorded,
        );
    }
    for (const side of ['away', 'home'] as const) {
      const club = game.fixture.clubs.find((c) => c.clubId === game.fixture.teams[side].clubId)!;
      const lines = result.fielding!.filter((line) => club.playerIds.includes(line.playerId));
      const outs = result.pitching
        .filter((p) => club.playerIds.includes(p.playerId))
        .reduce((sum, p) => sum + p.outsRecorded, 0);
      assert.equal(
        lines.reduce((sum, p) => sum + p.putouts, 0),
        outs,
      );
      assert.equal(
        lines.reduce((sum, p) => sum + p.fieldingOuts, 0),
        outs * 9,
      );
    }
  }
  for (const kind of [
    'strikeout',
    'battedOut',
    'fieldersChoice',
    'sacrificeFly',
    'single',
    'homeRun',
  ])
    assert.ok(kinds.has(kind), kind);
});

test('アウトを取れないまま交代した投手も守備出場1・守備アウト0として残る', () => {
  const game = createGame(20260923, undefined, 'game-prototype-v9', baseline);
  // 初球はアウトにならない固定seed。次イベントから打席間継投を起こす。
  const first = advanceGameEvent(game.state, game.fixture);
  assert.equal(first.event.outDecisions.length, 0);
  game.state = first.state;
  game.events.push(first.event);
  const pitcher = first.event.pitch!.pitcherId;
  game.state.paPitches = 0;
  game.state.pitcherPitchCounts[pitcher] = 90;
  runToCompletion(game);
  const result = finalizeGame(game);
  const line = result.fielding!.find((p) => p.playerId === pitcher)!;
  assert.equal(line.gamesAtPosition, 1);
  assert.equal(line.fieldingOuts, 0);
  assert.equal(line.putouts, 0);
});

test('v9の保存再実行で守備動作・位置・刺殺帰属・成績の改変を拒否する', () => {
  const game = createGame(20260923, undefined, 'game-prototype-v9', baseline);
  runToCompletion(game);
  finalizeGame(game);
  validateCompletedRecord(game);
  const index = game.events.findIndex((e) => e.outDecisions.length);
  const mutations: ((record: GameRecord) => void)[] = [
    (r) => {
      delete r.events[index]!.fieldingActions;
    },
    (r) => {
      r.events[index]!.defensiveAlignment![0]!.position = 'C';
    },
    (r) => {
      r.events[index]!.fieldingActions!.find((a) => a.kind === 'putout')!.outDecisionIndex = 9;
    },
    (r) => {
      r.events[index]!.credits.find((c) => c.metricCode === 'putouts')!.position = 'SS';
    },
    (r) => {
      r.result!.fielding![0]!.putouts++;
    },
  ];
  for (const mutate of mutations) {
    const altered = structuredClone(game);
    mutate(altered);
    assert.throws(() => validateCompletedRecord(altered), /一致しません/);
  }
});
