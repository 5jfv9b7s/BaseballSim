import { createTwoLeagueDefinitions } from './two-leagues.ts';
import { createPlayerDevelopmentCatalog } from '../development/index.ts';
import { validatePlayerDevelopment } from '../../world/player-development.ts';
import type { WorldDefinitions } from '../../world/types.ts';

/** 新規だけへ追加能力・適性を保存する。既存の11能力と試合計算は維持する。 */
export function createPlayerDevelopmentDefinitions(
  calendar: 'short' | 'annual' = 'short',
): WorldDefinitions {
  const definitions: WorldDefinitions = {
    ...createTwoLeagueDefinitions(calendar),
    version: 'world-definitions-v19',
    playerDevelopment: createPlayerDevelopmentCatalog(),
  };
  validatePlayerDevelopment(definitions);
  return definitions;
}
