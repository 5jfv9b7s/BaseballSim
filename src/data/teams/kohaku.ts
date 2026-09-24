import type { WorldSquad } from '../../world/types.ts';

/** 湖白スワンズの球団・初期打順・投手・控え候補。登録資格のデータではありません。 */
export const squad: Pick<WorldSquad, 'squadId' | 'team' | 'reserveBatterIds'> = {
  squadId: 'kohaku-first',
  team: {
    clubId: 'kohaku',
    name: '湖白スワンズ',
    lineup: [
      {
        playerId: 'kohaku-player-a-01',
        position: 'CF',
      },
      {
        playerId: 'kohaku-player-a-02',
        position: 'SS',
      },
      {
        playerId: 'kohaku-player-a-03',
        position: 'RF',
      },
      {
        playerId: 'kohaku-player-a-04',
        position: 'DH',
      },
      {
        playerId: 'kohaku-player-a-05',
        position: '1B',
      },
      {
        playerId: 'kohaku-player-a-06',
        position: 'LF',
      },
      {
        playerId: 'kohaku-player-a-07',
        position: '3B',
      },
      {
        playerId: 'kohaku-player-a-08',
        position: 'C',
      },
      {
        playerId: 'kohaku-player-a-09',
        position: '2B',
      },
    ],
    pitcherIds: ['kohaku-player-a-10', 'kohaku-player-a-11', 'kohaku-player-a-12'],
  },
  reserveBatterIds: ['kohaku-player-a-13', 'kohaku-player-a-14', 'kohaku-player-a-15'],
};
