import type { FarmSquad } from '../../../world/farm-types.ts';

/** 二軍の初期理想打順・投手順。選手の所属と実登録は球団で共有する。 */
export const squad: FarmSquad = {
  squadId: 'kohaku-farm',
  team: {
    clubId: 'kohaku',
    name: '湖白スワンズ 二軍',
    lineup: [
      {
        playerId: 'kohaku-player-a-16',
        position: 'CF',
      },
      {
        playerId: 'kohaku-player-a-17',
        position: 'SS',
      },
      {
        playerId: 'kohaku-player-a-18',
        position: 'RF',
      },
      {
        playerId: 'kohaku-player-a-19',
        position: 'DH',
      },
      {
        playerId: 'kohaku-player-a-20',
        position: '1B',
      },
      {
        playerId: 'kohaku-player-a-21',
        position: 'LF',
      },
      {
        playerId: 'kohaku-player-a-22',
        position: '3B',
      },
      {
        playerId: 'kohaku-player-a-23',
        position: 'C',
      },
      {
        playerId: 'kohaku-player-a-24',
        position: '2B',
      },
    ],
    pitcherIds: ['kohaku-player-a-25', 'kohaku-player-a-26', 'kohaku-player-a-27'],
  },
};
