import type { StadiumDefinition } from '../../world/league-structure-types.ts';
import { prototypeGeometry } from './geometry.ts';

/** 架空名・仮の収容人数。観客数や収入の計算には未使用。 */
export const stadiums: StadiumDefinition[] = [
  {
    stadiumId: 'aonagi-stadium',
    version: 1,
    displayName: '青凪スタジアム',
    modelSourceId: 'shared-prototype-field-v1',
    regionId: 'aonagi-region',
    capacity: 30000,
    roofType: 'open',
    geometry: { ...prototypeGeometry },
  },
  {
    stadiumId: 'aonagi-farm-ground',
    version: 1,
    displayName: '青凪第二球場',
    modelSourceId: 'shared-prototype-field-v1',
    regionId: 'aonagi-region',
    capacity: 3000,
    roofType: 'open',
    geometry: { ...prototypeGeometry },
  },
];
