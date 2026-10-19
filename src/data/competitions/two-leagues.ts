import type { LeagueStructure } from '../../world/league-structure-types.ts';

/** 12球団化に先立つ4球団の試作所属。実在リーグとの対応ではない。 */
export const twoLeagueCatalog: LeagueStructure['leagues'] = [
  {
    leagueId: 'fictional-sky-league',
    displayName: '架空スカイリーグ',
    level: 'first',
    rankingRuleRef: 'win-percentage-shared-rank-v1',
  },
  {
    leagueId: 'fictional-ocean-league',
    displayName: '架空オーシャンリーグ',
    level: 'first',
    rankingRuleRef: 'win-percentage-shared-rank-v1',
  },
  {
    leagueId: 'fictional-farm-league',
    displayName: '架空二軍リーグ',
    level: 'farm',
    rankingRuleRef: 'win-percentage-shared-rank-v1',
  },
];

/** 所属は順序や球団名から推測せず、チームIDで明示する。 */
export const firstLeagueMemberships = [
  { squadId: 'hoshihara-first', leagueId: 'fictional-sky-league' },
  { squadId: 'kohaku-first', leagueId: 'fictional-sky-league' },
  { squadId: 'aonagi-first', leagueId: 'fictional-ocean-league' },
  { squadId: 'asagiri-first', leagueId: 'fictional-ocean-league' },
];
