import type { FarmSquad } from '../../../world/farm-types.ts';

/** 二軍の初期理想打順・投手順。選手の所属と実登録は球団で共有する。 */
export const squad: FarmSquad = {
  squadId: 'asagiri-farm',
  team: {
    clubId: 'asagiri',
    name: '朝霧フォックス 二軍',
    lineup: [
      {
        playerId: 'asagiri-player-h-16',
        position: 'CF',
      },
      {
        playerId: 'asagiri-player-h-17',
        position: 'SS',
      },
      {
        playerId: 'asagiri-player-h-18',
        position: 'RF',
      },
      {
        playerId: 'asagiri-player-h-19',
        position: 'DH',
      },
      {
        playerId: 'asagiri-player-h-20',
        position: '1B',
      },
      {
        playerId: 'asagiri-player-h-21',
        position: 'LF',
      },
      {
        playerId: 'asagiri-player-h-22',
        position: '3B',
      },
      {
        playerId: 'asagiri-player-h-23',
        position: 'C',
      },
      {
        playerId: 'asagiri-player-h-24',
        position: '2B',
      },
    ],
    pitcherIds: ['asagiri-player-h-25', 'asagiri-player-h-26', 'asagiri-player-h-27'],
  },
};
