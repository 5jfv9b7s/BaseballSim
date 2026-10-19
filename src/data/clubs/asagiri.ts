import type { ClubHomeInput } from '../../world/league-structure-types.ts';

/** 朝霧の所在地と一軍・二軍の本拠地。球団名・編成はteams/とfarm/で編集する。 */
export const home: ClubHomeInput = {
  clubId: 'asagiri',
  regionId: 'asagiri-region',
  firstStadiumId: 'asagiri-stadium',
  farmStadiumId: 'asagiri-farm-ground',
};
