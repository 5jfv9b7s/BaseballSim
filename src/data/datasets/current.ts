import type { GameFixture, TeamSide } from '../../game/types.ts';
import { players as awayPlayers } from '../players/away.ts';
import { players as homePlayers } from '../players/home.ts';
import { repertoires as awayPitches } from '../repertoires/away.ts';
import { repertoires as homePitches } from '../repertoires/home.ts';
import { team as awayTeam } from '../teams/away.ts';
import { team as homeTeam } from '../teams/home.ts';

/**
 * 新規v10の入力データを組み立てる入口。
 * 毎回複製し、編集中の定義と開始済みの試合を独立させます。
 * 保存からの再現にはこの関数を使わず、保存された名簿を使います。
 */
export function createCurrentFixture(): GameFixture {
  const teams = { away: awayTeam, home: homeTeam };
  return structuredClone({
    initialDatasetVersion: 'game-fixture-v2',
    players: [...awayPlayers, ...homePlayers],
    pitches: [...awayPitches, ...homePitches],
    teams,
    clubs: (['away', 'home'] as const).map((side: TeamSide) => ({
      clubId: teams[side].clubId,
      name: teams[side].name,
      playerIds: [...teams[side].lineup.map((slot) => slot.playerId), ...teams[side].pitcherIds],
    })),
  });
}
