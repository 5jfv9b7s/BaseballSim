import type { WorldSquad } from '../../world/types.ts';

/** 青凪ハーバーズの球団・初期打順・投手・控え候補。登録資格のデータではありません。 */
export const squad: Pick<WorldSquad, 'squadId' | 'team' | 'reserveBatterIds'> = {
  squadId: 'aonagi-first',
  team: {
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
  },
  reserveBatterIds: ['player-h-13', 'player-h-14', 'player-h-15'],
};
