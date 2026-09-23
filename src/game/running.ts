import { getPlayer } from './fixture.ts';
import { GAME_MODEL_V2 as m } from './model-v2.ts';
import type { BattedBall, GameFixture, GameState } from './types.ts';

/** 前の走者から順に解決し、追越しや同じ塁への重複を防ぐ。 */
export function hitDestinations(
  state: GameState,
  fixture: GameFixture,
  bases: number,
  ball: BattedBall | null,
): number[] {
  const destinations = [0, 0, 0];
  let leadingDestination = 4;
  for (let i = 2; i >= 0; i--) {
    const runner = state.baseOccupants[i];
    if (!runner) continue;
    let destination = Math.min(4, i + 1 + bases);
    if (
      state.simulationVersion !== undefined &&
      state.simulationVersion !== 'game-prototype-v1' &&
      bases < 4 &&
      destination < 4 &&
      ball?.returnTimeMs
    ) {
      const next = destination + 1;
      const player = getPlayer(fixture, runner.currentRunnerId);
      const speed =
        m.runnerBaseMetersPerSecond +
        (m.runnerAbilityMetersPerSecond * player.runningSpeed.valueMilli) / 120000;
      const travel =
        m.runnerReactionSeconds +
        ((next - i - 1) * m.baseDistanceMeters - m.runnerLeadMeters) / speed;
      const returnTime =
        next === 4
          ? ball.returnTimeMs.home
          : next === 3
            ? ball.returnTimeMs.third
            : ball.returnTimeMs.second;
      if (travel + m.extraBaseSafetySeconds < returnTime / 1000) destination = next;
    }
    if (leadingDestination < 4) destination = Math.min(destination, leadingDestination - 1);
    destinations[i] = destination;
    leadingDestination = destination;
  }
  return destinations;
}
