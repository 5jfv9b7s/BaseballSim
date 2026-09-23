import { createGameFixture } from './fixture.ts';
import type { GameFixture } from './types.ts';

/** v10専用の架空捕球能力。旧名簿の値・版・保存は変更しない。 */
export function createErrorFixture(): GameFixture {
  const fixture = createGameFixture();
  fixture.initialDatasetVersion = 'game-fixture-v2';
  fixture.players.forEach((player, index) => {
    player.fielding = {
      catching: { valueMilli: 62000 + (index % 5) * 7000, ceilingMilli: 110000 },
    };
  });
  return fixture;
}
