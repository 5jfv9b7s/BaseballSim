import { profiles as hoshihara } from './hoshihara.ts';
import { profiles as aonagi } from './aonagi.ts';
import { profiles as kohaku } from './kohaku.ts';
import { profiles as asagiri } from './asagiri.ts';
import { countries, regions } from './locations.ts';
import type { PlayerProfileCatalog } from '../../world/player-profile-types.ts';

export function createProfileCatalog(): PlayerProfileCatalog {
  return structuredClone({
    version: 'player-profiles-v1',
    countries,
    regions,
    players: [...hoshihara, ...aonagi, ...kohaku, ...asagiri],
  });
}
