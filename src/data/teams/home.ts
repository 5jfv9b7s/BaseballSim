import type { Team } from '../../game/types.ts';

/** 打順はlineupの順、継投はpitcherIdsの順。選手IDで参照します。 */
export const team: Team = {
  side: 'home',
  clubId: 'club-h',
  name: '青凪ハーバーズ',
  lineup: [
    {
      playerId: 'player-h-01',
      position: 'CF',
    },
    {
      playerId: 'player-h-02',
      position: 'SS',
    },
    {
      playerId: 'player-h-03',
      position: 'RF',
    },
    {
      playerId: 'player-h-04',
      position: 'DH',
    },
    {
      playerId: 'player-h-05',
      position: '1B',
    },
    {
      playerId: 'player-h-06',
      position: 'LF',
    },
    {
      playerId: 'player-h-07',
      position: '3B',
    },
    {
      playerId: 'player-h-08',
      position: 'C',
    },
    {
      playerId: 'player-h-09',
      position: '2B',
    },
  ],
  pitcherIds: ['player-h-10', 'player-h-11', 'player-h-12'],
};
