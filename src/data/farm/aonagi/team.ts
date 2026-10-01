import type { FarmSquad } from '../../../world/farm-types.ts';

/** 二軍の初期理想打順・投手順。選手の所属と実登録は球団で共有する。 */
export const squad: FarmSquad = {
  squadId: 'aonagi-farm',
  team: {
    clubId: 'club-h',
    name: '青凪ハーバーズ 二軍',
    lineup: [
      {
        playerId: 'player-h-16',
        position: 'CF',
      },
      {
        playerId: 'player-h-17',
        position: 'SS',
      },
      {
        playerId: 'player-h-18',
        position: 'RF',
      },
      {
        playerId: 'player-h-19',
        position: 'DH',
      },
      {
        playerId: 'player-h-20',
        position: '1B',
      },
      {
        playerId: 'player-h-21',
        position: 'LF',
      },
      {
        playerId: 'player-h-22',
        position: '3B',
      },
      {
        playerId: 'player-h-23',
        position: 'C',
      },
      {
        playerId: 'player-h-24',
        position: '2B',
      },
    ],
    pitcherIds: ['player-h-25', 'player-h-26', 'player-h-27'],
  },
};
