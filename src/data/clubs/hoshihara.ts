import type { ClubHomeInput } from '../../world/league-structure-types.ts';

/** 星原の所在地と一軍・二軍の本拠地。球団名・編成はteams/とfarm/で編集する。 */
export const home: ClubHomeInput = {
  clubId: 'club-a',
  regionId: 'hoshihara-region',
  firstStadiumId: 'hoshihara-stadium',
  farmStadiumId: 'hoshihara-farm-ground',
};
