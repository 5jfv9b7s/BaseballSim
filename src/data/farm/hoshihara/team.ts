import type { FarmSquad } from '../../../world/farm-types.ts';

/** 二軍の初期理想打順・投手順。選手の所属と実登録は球団で共有する。 */
export const squad: FarmSquad = {
  squadId: 'hoshihara-farm',
  team: {
    clubId: 'club-a',
    name: '星原フォックス 二軍',
    lineup: [
      {
        playerId: 'player-a-16',
        position: 'CF',
      },
      {
        playerId: 'player-a-17',
        position: 'SS',
      },
      {
        playerId: 'player-a-18',
        position: 'RF',
      },
      {
        playerId: 'player-a-19',
        position: 'DH',
      },
      {
        playerId: 'player-a-20',
        position: '1B',
      },
      {
        playerId: 'player-a-21',
        position: 'LF',
      },
      {
        playerId: 'player-a-22',
        position: '3B',
      },
      {
        playerId: 'player-a-23',
        position: 'C',
      },
      {
        playerId: 'player-a-24',
        position: '2B',
      },
    ],
    pitcherIds: ['player-a-25', 'player-a-26', 'player-a-27'],
  },
};
