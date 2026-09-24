import { nextRandom } from '../engine/rng.ts';
import { ensure } from '../engine/validation.ts';
import { evaluateInPlayV2 } from './in-play-v2.ts';
import { getPlayer } from './fixture.ts';
import type { BattedBall, ErrorEvaluation, GameEvent, GameFixture, GameState } from './types.ts';

/** 一塁への単独アウト候補に限った捕球失策。送球失策・併殺崩れ失策は未対応。 */
export function evaluateFieldingError(
  state: GameState,
  fixture: GameFixture,
  ball: BattedBall,
  pitch: GameEvent['pitch'],
) {
  if (
    state.simulationVersion !== 'game-prototype-v10' ||
    ball.projectedBases !== 0 ||
    ball.type !== 'ground' ||
    !ball.fielderId ||
    !['P', 'C', '1B', '2B', '3B', 'SS'].includes(ball.fieldingPosition ?? '')
  )
    return undefined;
  const play = evaluateInPlayV2(state, fixture, ball, pitch);
  if (play?.resolution === 'doublePlay' || play?.resolution === 'fieldersChoice') return undefined;
  const catching = getPlayer(fixture, ball.fielderId).fielding?.catching;
  ensure(catching && state.errorConfig, '捕球能力または失策設定がありません');
  const config = state.errorConfig;
  const probability = Math.min(
    config.maximumProbability,
    config.baseProbability + config.inabilityProbability * (1 - catching.valueMilli / 120000),
  );
  const random = probability > 0 ? nextRandom(state.rng) : null;
  const evaluation: ErrorEvaluation = {
    modelVersion: 'fielding-error-prototype-v1',
    playerId: ball.fielderId,
    position: ball.fieldingPosition as ErrorEvaluation['position'],
    kind: 'groundFielding',
    probability,
    draw: random?.value ?? null,
    occurred: random !== null && random.value < probability,
    expectedOuts: 1,
  };
  return { evaluation, rng: random?.state ?? structuredClone(state.rng) };
}
