import type { PitchRecord, RngState } from '../engine/types.ts';
import type { GameFixture, TeamSide } from './types.ts';
import { CURRENT_GAME_MODEL, gameModel, type GameModelVersion } from './model-registry.ts';
import { generateBattedBall as generateV1 } from './batted-ball-v1.ts';
import { generateBattedBallV3 } from './batted-ball-v3.ts';
import { generateBattedBallV2 } from './batted-ball-v2.ts';
import { generateConfiguredBattedBall } from './batted-ball-configured.ts';
import { createMatchConfig, validateMatchConfig, type MatchConfig } from './config.ts';

export function generateBattedBall(
  pitch: PitchRecord,
  fixture: GameFixture,
  defense: TeamSide,
  rng: RngState,
  version: GameModelVersion = CURRENT_GAME_MODEL,
  config?: MatchConfig,
) {
  gameModel(version);
  if (version === 'game-prototype-v7') {
    config ??= createMatchConfig();
    validateMatchConfig(config);
    return generateConfiguredBattedBall(pitch, fixture, defense, rng, config);
  }
  return version === 'game-prototype-v5' || version === 'game-prototype-v6'
    ? generateBattedBallV3(pitch, fixture, defense, rng)
    : version === 'game-prototype-v1'
      ? generateV1(pitch, fixture, defense, rng)
      : generateBattedBallV2(pitch, fixture, defense, rng);
}
