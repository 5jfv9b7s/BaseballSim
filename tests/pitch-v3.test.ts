import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game/engine.ts';
import { simulatePitchV3, contactChance, swingChance } from '../src/engine/pitch-v3.ts';
import { simulatePitchV2, type PitchContext } from '../src/engine/pitch-v2.ts';
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

test('追い込まれたらストライクを守り、ボール球への積極性は増やさない', () => {
  for (const aggression of [0, 0.5, 1]) {
    for (const discipline of [0, 0.5, 1]) {
      const normal = { balls: 0, strikes: 1 };
      const protect = { balls: 0, strikes: 2 };
      assert.ok(
        swingChance(true, aggression, discipline, protect) >
          swingChance(true, aggression, discipline, normal),
      );
      assert.equal(
        swingChance(false, aggression, discipline, protect),
        swingChance(false, aggression, discipline, normal),
      );
      for (const inside of [true, false]) {
        for (const balls of [0, 3]) {
          const p = swingChance(inside, aggression, discipline, { balls, strikes: 2 });
          assert.ok(p >= 0 && p <= 1);
        }
      }
    }
  }

  const count = { balls: 3, strikes: 2 };
  assert.ok(swingChance(true, 0.5, 1, count) > swingChance(true, 0.5, 0, count));
  assert.ok(swingChance(false, 0.5, 1, count) < swingChance(false, 0.5, 0, count));
  // 積極性はストライクにもボール球にも振りやすくする傾向で、能力とは区別する。
  for (const inside of [true, false])
    assert.ok(swingChance(inside, 1, 0.5, count) > swingChance(inside, 0, 0.5, count));
});

test('接触優先は2ストライク限定で、ミート・球速・ゾーン外の差を維持する', () => {
  for (const inside of [true, false]) {
    for (const ability of [0, 0.5, 1]) {
      for (const speed of [5000, 15000, 20000]) {
        const normal = contactChance(inside, ability, speed, 1);
        const protect = contactChance(inside, ability, speed, 2);
        assert.equal(normal, contactChance(inside, ability, speed, 0));
        assert.ok(protect >= normal);
        assert.ok(protect >= 0.05 && protect <= 0.98);
      }
    }
  }

  for (const strikes of [0, 1, 2]) {
    assert.ok(contactChance(true, 1, 15000, strikes) > contactChance(true, 0, 15000, strikes));
    assert.ok(contactChance(true, 0.5, 13000, strikes) > contactChance(true, 0.5, 16000, strikes));
    assert.ok(contactChance(true, 0.5, 15000, strikes) > contactChance(false, 0.5, 15000, strikes));
  }
});

test('0・1ストライク時はv3と同じ投球・判断・乱数消費を保つ', () => {
  for (let i = 1; i <= 200; i++) {
    const { fixture, context } = setup(Math.imul(i, 2654435761) >>> 0);
    context.count = { balls: i % 4, strikes: i % 2 };
    const old = simulatePitchV2(context, fixture, 'same');
    const next = simulatePitchV3(context, fixture, 'same');
    assert.deepEqual(next.state, old.state);
    assert.deepEqual(next.trace, old.trace);
    assert.deepEqual(next.event.pitch, old.event.pitch);
    assert.deepEqual({ ...next.decision, modelVersion: old.decision.modelVersion }, old.decision);
    assert.equal(next.event.simulationVersion, 'pitch-prototype-v3');
  }
});

test('2ストライク後の左右ミートを使い、全状態を再現し入力を変更しない', () => {
  let contactChecks = 0;
  let fouls = 0;
  let fair = 0;
  for (let i = 1; i <= 1000; i++) {
    const { fixture, context } = setup(Math.imul(i, 2654435761) >>> 0);
    context.count = { balls: i % 4, strikes: 2 };
    const pitcher = fixture.players.find((p) => p.playerId === fixture.matchup.pitcherId)!;
    pitcher.throwingHand = i % 2 ? 'L' : 'R';
    const batter = fixture.players.find((p) => p.playerId === fixture.matchup.batterId)!;
    batter.batting.contactVsLeft = { valueMilli: 30000, ceilingMilli: 120000 };
    batter.batting.contactVsRight = { valueMilli: 100000, ceilingMilli: 120000 };
    const before = structuredClone({ context, fixture });
    const next = simulatePitchV3(context, fixture, 'protected');
    assert.deepEqual(next, simulatePitchV3(context, fixture, 'protected'));
    assert.deepEqual({ context, fixture }, before);
    assert.deepEqual(JSON.parse(JSON.stringify(next)), next);
    assert.deepEqual(next.trace.rngAfter, next.state.rng);
    assert.ok(next.state.rng.drawCount >= 7 && next.state.rng.drawCount <= 9);
    const pitch = next.event.pitch;
    if (pitch.action === 'swing') {
      contactChecks++;
      assert.equal(
        next.decision.contactProbability,
        contactChance(
          pitch.zoneCode.startsWith('S_'),
          (pitcher.throwingHand === 'L' ? 30000 : 100000) / 120000,
          pitch.velocityCentiKph,
          2,
        ),
      );
    }
    if (pitch.contact === 'foul') {
      fouls++;
      assert.equal(next.state.count.strikes, 2);
      assert.equal(next.state.phase, 'readyForPitch');
    }
    if (pitch.contact === 'fair') fair++;
  }
  assert.ok(contactChecks > 0 && fouls > 0 && fair > 0);
});
