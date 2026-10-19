import type { ClubHomeInput } from '../../world/league-structure-types.ts';

/** 青凪の所在地と一軍・二軍の本拠地。球団名・編成はteams/とfarm/で編集する。 */
export const home: ClubHomeInput = {
  clubId: 'club-h',
  regionId: 'aonagi-region',
  firstStadiumId: 'aonagi-stadium',
  farmStadiumId: 'aonagi-farm-ground',
};
