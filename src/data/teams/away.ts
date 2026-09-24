import type { Team } from '../../game/types.ts';

/** 打順はlineupの順、継投はpitcherIdsの順。選手IDで参照します。 */
export const team: Team = {
  side: 'away',
  clubId: 'club-a',
  name: '星原フォックス',
  lineup: [
    {
      playerId: 'player-a-01',
      position: 'CF',
    },
    {
      playerId: 'player-a-02',
      position: 'SS',
    },
    {
      playerId: 'player-a-03',
      position: 'RF',
    },
    {
      playerId: 'player-a-04',
      position: 'DH',
    },
    {
      playerId: 'player-a-05',
      position: '1B',
    },
    {
      playerId: 'player-a-06',
      position: 'LF',
    },
    {
      playerId: 'player-a-07',
      position: '3B',
    },
    {
      playerId: 'player-a-08',
      position: 'C',
    },
    {
      playerId: 'player-a-09',
      position: '2B',
    },
  ],
  pitcherIds: ['player-a-10', 'player-a-11', 'player-a-12'],
};
