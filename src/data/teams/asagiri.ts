import type { WorldSquad } from '../../world/types.ts';

/** 朝霧フォックスの球団・初期打順・投手・控え候補。登録資格のデータではありません。 */
export const squad: Pick<WorldSquad, 'squadId' | 'team' | 'reserveBatterIds'> = {
  squadId: 'asagiri-first',
  team: {
    clubId: 'asagiri',
    name: '朝霧フォックス',
    lineup: [
      {
        playerId: 'asagiri-player-h-01',
        position: 'CF',
      },
      {
        playerId: 'asagiri-player-h-02',
        position: 'SS',
      },
      {
        playerId: 'asagiri-player-h-03',
        position: 'RF',
      },
      {
        playerId: 'asagiri-player-h-04',
        position: 'DH',
      },
      {
        playerId: 'asagiri-player-h-05',
        position: '1B',
      },
      {
        playerId: 'asagiri-player-h-06',
        position: 'LF',
      },
      {
        playerId: 'asagiri-player-h-07',
        position: '3B',
      },
      {
        playerId: 'asagiri-player-h-08',
        position: 'C',
      },
      {
        playerId: 'asagiri-player-h-09',
        position: '2B',
      },
    ],
    pitcherIds: ['asagiri-player-h-10', 'asagiri-player-h-11', 'asagiri-player-h-12'],
  },
  reserveBatterIds: ['asagiri-player-h-13', 'asagiri-player-h-14', 'asagiri-player-h-15'],
};
