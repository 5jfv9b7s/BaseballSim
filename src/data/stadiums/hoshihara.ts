import type { StadiumDefinition } from '../../world/league-structure-types.ts';
import { prototypeGeometry } from './geometry.ts';

/** 架空名・仮の収容人数。観客数や収入の計算には未使用。 */
export const stadiums: StadiumDefinition[] = [
  {
    stadiumId: 'hoshihara-stadium',
    version: 1,
    displayName: '星原スタジアム',
    modelSourceId: 'shared-prototype-field-v1',
    regionId: 'hoshihara-region',
    capacity: 32000,
    roofType: 'open',
    geometry: { ...prototypeGeometry },
  },
  {
    stadiumId: 'hoshihara-farm-ground',
    version: 1,
    displayName: '星原第二球場',
    modelSourceId: 'shared-prototype-field-v1',
    regionId: 'hoshihara-region',
    capacity: 3500,
    roofType: 'open',
    geometry: { ...prototypeGeometry },
  },
];
