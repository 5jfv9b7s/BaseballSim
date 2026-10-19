import type { LeagueStructure } from '../../world/league-structure-types.ts';

/** 現行4球団の検証用大会。正式な一軍2リーグ12球団とは区別する。 */
export const leagues: LeagueStructure['leagues'] = [
  {
    leagueId: 'fictional-first-league',
    displayName: '架空一軍リーグ',
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
