import type { StadiumDefinition } from '../../world/league-structure-types.ts';
import { prototypeGeometry } from './geometry.ts';

/** 架空名・仮の収容人数。観客数や収入の計算には未使用。 */
export const stadiums: StadiumDefinition[] = [
  {
    stadiumId: 'kohaku-stadium',
    version: 1,
    displayName: '湖白スタジアム',
    modelSourceId: 'shared-prototype-field-v1',
    regionId: 'kohaku-region',
    capacity: 28000,
    roofType: 'open',
    geometry: { ...prototypeGeometry },
  },
  {
    stadiumId: 'kohaku-farm-ground',
    version: 1,
    displayName: '湖白第二球場',
    modelSourceId: 'shared-prototype-field-v1',
    regionId: 'kohaku-region',
    capacity: 2500,
    roofType: 'open',
    geometry: { ...prototypeGeometry },
  },
];
