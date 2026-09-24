import type { WorldSquad } from '../../world/types.ts';

/** 星原フォックスの球団・初期打順・投手・控え候補。登録資格のデータではありません。 */
export const squad: Pick<WorldSquad, 'squadId' | 'team' | 'reserveBatterIds'> = {
  squadId: 'hoshihara-first',
  team: {
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
  },
  reserveBatterIds: ['player-a-13', 'player-a-14', 'player-a-15'],
};
