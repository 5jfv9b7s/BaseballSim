import type { PitchRecord, RngState } from '../engine/types.ts';
import type { GameFixture, TeamSide } from './types.ts';
import { CURRENT_GAME_MODEL, gameModel, type GameModelVersion } from './model-registry.ts';
import { generateBattedBall as generateV1 } from './batted-ball-v1.ts';
import { generateBattedBallV2 } from './batted-ball-v2.ts';

export function generateBattedBall(
  pitch: PitchRecord,
  fixture: GameFixture,
  defense: TeamSide,
  rng: RngState,
  version: GameModelVersion = CURRENT_GAME_MODEL,
) {
  gameModel(version);
  return version === 'game-prototype-v1'
    ? generateV1(pitch, fixture, defense, rng)
    : generateBattedBallV2(pitch, fixture, defense, rng);
}
