import 'fake-indexeddb/auto';
import baseline from './fixtures/match-v7-baseline.json' with { type: 'json' };
import test from 'node:test';
import assert from 'node:assert/strict';
import defaults from '../config/match.ts';
import { createMatchConfig, validateMatchConfig, type MatchConfig } from '../src/game/config.ts';
import { createGame, runToCompletion, advanceGameEvent } from '../src/game/engine.ts';
import { finalizeGame } from '../src/game/results.ts';
import { canonicalJson, definitionsFor, validateCompletedRecord } from '../src/storage/codec.ts';
import { DexieStorageAdapter, GameDatabase } from '../src/storage/dexie-adapter.ts';
import { simulateConfiguredPitch } from '../src/engine/pitch-configured.ts';
import { simulatePitchV4, type PitchContext } from '../src/engine/pitch-v4.ts';
import { generateBattedBall } from '../src/game/batted-ball.ts';
import type { Fixture } from '../src/engine/types.ts';

test('設定は不足・未知項目・非有限数・順序逆転・非正速度を拒否し、開始時に複製する', () => {
  validateMatchConfig(createMatchConfig());
  const invalid: ((c: MatchConfig) => void)[] = [
    (c) => {
      c.pitch.contactBase = NaN;
    },
    (c) => {
      c.pitch.contactMax = Infinity;
    },
    (c) => {
      c.pitch.aimXMm = [0, 100];
    },
    (c) => {
      c.pitch.aimXMm = [100, 0, -100];
    },
    (c) => {
      c.pitch.aimXMm = [-100, 0.5, 100];
    },
    (c) => {
      c.pitch.contactMin = 0.99;
    },
    (c) => {
      c.pitch.zone.bottomMm = 1200;
    },
    (c) => {
      c.battedBall.angleModeDegrees = -60;
    },
    (c) => {
      c.battedBall.fielderAccelerationMetersPerSecond2 = 0;
    },
    (c) => {
      c.battedBall.exitSpeedBaseKph = 1;
    },
    (c) => {
      c.battedBall.protectContactRecoveryCentiKph = 1300;
    },
    (c) => {
      c.running.runnerBaseMetersPerSecond = 0;
    },
    (c) => {
      c.plays.pivotSeconds = -1;
    },
    (c) => {
      (c as unknown as Record<string, unknown>).extra = 1;
    },
    (c) => {
      delete (c.pitch as Partial<MatchConfig['pitch']>).baseWeights;
    },
  ];
  for (const mutate of invalid) {
    const config = structuredClone(baseline);
    mutate(config);
    assert.throws(() => createGame(1, undefined, 'game-prototype-v7', config));
  }
  const config = createMatchConfig();
  const game = createGame(1, undefined, 'game-prototype-v7', config);
  const snapshot = structuredClone(game.state.config);
  config.pitch.contactBase = 0.7;
  assert.deepEqual(game.state.config, snapshot);
  assert.throws(() => createGame(1, undefined, 'game-prototype-v6', config));
});

test('既定設定は旧v6の投球・打球・乱数を維持し、指定係数の変更だけが計算に届く', () => {
  const game = createGame(20260923, undefined, 'game-prototype-v7', baseline);
  const config = game.state.config!;
  const home = game.fixture.teams.home;
  const fixture: Fixture = {
    ...game.fixture,
    matchup: {
      pitcherId: home.pitcherIds[0]!,
      catcherId: home.lineup.find((p) => p.position === 'C')!.playerId,
      batterId: game.fixture.teams.away.lineup[0]!.playerId,
    },
  };
  const context: PitchContext = {
    gameId: game.state.gameId,
    attemptNo: 1,
    activeAppearanceId: game.state.gameId + ':appearance:1',
    phase: 'readyForPitch',
    count: { balls: 3, strikes: 2 },
    nextEventSeq: 1,
    rng: game.state.rng,
    initialDatasetVersion: fixture.initialDatasetVersion,
  };
  for (let seed = 1; seed <= 100; seed++) {
    context.rng.fullState.word = Math.imul(seed, 2654435761) >>> 0;
    context.count = { balls: seed % 4, strikes: seed % 3 };
    const old = simulatePitchV4(context, fixture, 'comparison');
    const next = simulateConfiguredPitch(context, fixture, 'comparison', config.pitch);
    assert.deepEqual(next.event.pitch, old.event.pitch);
    assert.deepEqual(next.state, old.state);
    const { modelVersion: _old, ...oldDecision } = old.decision;
    const { modelVersion: _next, ...nextDecision } = next.decision;
    assert.deepEqual(nextDecision, oldDecision);
    const oldBall = generateBattedBall(
      old.event.pitch,
      game.fixture,
      'home',
      old.state.rng,
      'game-prototype-v6',
    );
    const nextBall = generateBattedBall(
      old.event.pitch,
      game.fixture,
      'home',
      old.state.rng,
      'game-prototype-v7',
      config,
    );
    const { modelVersion: _oldBall, ...oldProperties } = oldBall.ball;
    const { modelVersion: _nextBall, fieldingContact: _contact, ...newProperties } = nextBall.ball;
    assert.deepEqual(newProperties, oldProperties);
    assert.deepEqual(nextBall.rng, oldBall.rng);
  }

  context.count.balls = 3;
  const modified = structuredClone(config);
  modified.pitch.threeBallAimXMm = [0, 0, 0];
  const step = simulateConfiguredPitch(context, fixture, 'modified', modified.pitch);
  assert.equal(step.event.pitch.intendedLocation.xMm, 0);

  const pitch = step.event.pitch;
  const before = generateBattedBall(
    pitch,
    game.fixture,
    'home',
    step.state.rng,
    'game-prototype-v7',
    config,
  );
  modified.battedBall.exitSpeedBaseKph += 10;
  const after = generateBattedBall(
    pitch,
    game.fixture,
    'home',
    step.state.rng,
    'game-prototype-v7',
    modified,
  );
  assert.equal(after.ball.exitVelocityCentiKph - before.ball.exitVelocityCentiKph, 1000);
  assert.deepEqual(after.rng, before.rng);
  const input = canonicalJson(game.state);
  advanceGameEvent(game.state, game.fixture);
  assert.equal(canonicalJson(game.state), input);
});

for (const version of ['game-prototype-v7', 'game-prototype-v8', 'game-prototype-v9'] as const) {
  test(`${version}は開始時の設定を保存し、既定ファイル変更後も同じ試合を復元・再実行する`, async () => {
    const db = new GameDatabase('config-' + crypto.randomUUID());
    const previousDefault = defaults.pitch.contactBase;
    try {
      const config = createMatchConfig();
      config.pitch.contactBase = 0.65;
      config.running.runnerLeadMeters = 2;
      config.plays.pivotSeconds = 0.4;
      const game = createGame(20260923, undefined, version, config);
      runToCompletion(game);
      finalizeGame(game);
      const storage = new DexieStorageAdapter(db);
      await storage.commitSnapshot(game, 0);
      const definitions = definitionsFor(version, config);
      assert.deepEqual('config' in definitions ? definitions.config : null, config);

      // 設定オブジェクトを一時変更し、ファイルを再ビルドした後の既定値変更と同じ条件を作る。
      defaults.pitch.contactBase = 0.75;
      assert.equal(createGame(20260923).state.config!.pitch.contactBase, 0.75);
      const loaded = (await storage.loadSnapshot()).record;
      assert.deepEqual(loaded, game);
      validateCompletedRecord(loaded);
      const replay = createGame(loaded.seed, undefined, version, loaded.state.config);
      runToCompletion(replay);
      finalizeGame(replay);
      assert.deepEqual(replay, game);

      const wrong = structuredClone(game);
      wrong.state.config!.pitch.contactBase = 0.1;
      assert.throws(() => validateCompletedRecord(wrong), /一致しません/);
      delete wrong.state.config;
      assert.throws(() => validateCompletedRecord(wrong), /設定/);
    } finally {
      defaults.pitch.contactBase = previousDefault;
      await db.delete();
    }
  });
}

test('新プレーの判定記録と成績の改変を再実行照合で拒否する', () => {
  const game = createGame(1, undefined, 'game-prototype-v7', baseline);
  runToCompletion(game);
  finalizeGame(game);
  const event = game.events.find((e) => e.fieldingEvaluation)!;
  assert.ok(event);
  event.fieldingEvaluation!.defenseArrivalMs[0]! += 1;
  assert.throws(() => validateCompletedRecord(game), /一致しません/);
});
