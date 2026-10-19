import type { ClubHomeInput } from '../../world/league-structure-types.ts';

/** 湖白の所在地と一軍・二軍の本拠地。球団名・編成はteams/とfarm/で編集する。 */
export const home: ClubHomeInput = {
  clubId: 'kohaku',
  regionId: 'kohaku-region',
  firstStadiumId: 'kohaku-stadium',
  farmStadiumId: 'kohaku-farm-ground',
};
