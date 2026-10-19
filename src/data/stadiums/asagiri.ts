import type { StadiumDefinition } from '../../world/league-structure-types.ts';
import { prototypeGeometry } from './geometry.ts';

/** 架空名・仮の収容人数。観客数や収入の計算には未使用。 */
export const stadiums: StadiumDefinition[] = [
  {
    stadiumId: 'asagiri-stadium',
    version: 1,
    displayName: '朝霧スタジアム',
    modelSourceId: 'shared-prototype-field-v1',
    regionId: 'asagiri-region',
    capacity: 34000,
    roofType: 'open',
    geometry: { ...prototypeGeometry },
  },
  {
    stadiumId: 'asagiri-farm-ground',
    version: 1,
    displayName: '朝霧第二球場',
    modelSourceId: 'shared-prototype-field-v1',
    regionId: 'asagiri-region',
    capacity: 4000,
    roofType: 'open',
    geometry: { ...prototypeGeometry },
  },
];
