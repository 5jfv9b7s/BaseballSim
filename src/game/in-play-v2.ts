import { usesFieldersChoice } from './model-registry.ts';
import { evaluateInPlayTiming } from './in-play.ts';
import type { BattedBall, FieldingEvaluation, GameEvent, GameFixture, GameState } from './types.ts';

/** 到達時間を変えず、二塁フォースだけが成立する場合を野手選択として採用する。 */
export function evaluateInPlayV2(
  state: GameState,
  fixture: GameFixture,
  ball: BattedBall | null,
  pitch: GameEvent['pitch'],
): FieldingEvaluation | undefined {
  if (!usesFieldersChoice(state.simulationVersion)) return undefined;

  const timing = evaluateInPlayTiming(state, fixture, ball, pitch);
  if (!timing) return undefined;

  let resolution: NonNullable<FieldingEvaluation['resolution']>;
  if (timing.play === 'tagUp') {
    resolution = timing.completed ? 'sacrificeFly' : 'battedOut';
  } else if (timing.completed) {
    resolution = 'doublePlay';
  } else {
    const forceSucceeds = timing.defenseArrivalMs[0]! < timing.runnerArrivalMs[0]!;
    resolution = forceSucceeds ? 'fieldersChoice' : 'battedOut';
  }

  return {
    ...timing,
    modelVersion: 'in-play-prototype-v2',
    resolution,
  };
}
