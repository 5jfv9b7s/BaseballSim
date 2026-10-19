import { createIndividualPitchDefinitions } from './individual-pitches.ts';
import { createProfileCatalog } from '../profiles/index.ts';
import { validatePlayerProfiles } from '../../world/player-profiles.ts';
import type { WorldDefinitions } from '../../world/types.ts';

/** 新規プレイ専用。旧定義v15へプロフィールを後付けしない。 */
export function createPlayerProfileDefinitions(
  calendar: 'short' | 'annual' = 'short',
): WorldDefinitions {
  const definitions: WorldDefinitions = {
    ...createIndividualPitchDefinitions(calendar),
    version: 'world-definitions-v16',
    playerProfiles: createProfileCatalog(),
  };
  validatePlayerProfiles(definitions);
  return definitions;
}
