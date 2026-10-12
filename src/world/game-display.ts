import { ensure } from '../engine/validation.ts';
import type { GameRecord } from '../game/types.ts';

export interface GameDisplayPlayer {
  playerId: string;
  playerName: string;
  teamName: string;
}

/** 保存された試合時点の表示情報。現在の選手名簿・能力へは参照しない。 */
export function gameDisplay(game: GameRecord) {
  const teams = { away: game.fixture.teams.away.name, home: game.fixture.teams.home.name };
  const players: GameDisplayPlayer[] = [];

  for (const side of ['away', 'home'] as const) {
    const team = game.fixture.teams[side];
    const club = game.fixture.clubs.find((item) => item.clubId === team.clubId);
    ensure(club, '試合時点の所属情報がありません');
    for (const player of game.fixture.players) {
      if (!club.playerIds.includes(player.playerId)) continue;
      players.push({
        playerId: player.playerId,
        playerName: player.familyName + ' ' + player.givenName,
        teamName: team.name,
      });
    }
  }

  return { teams, players };
}
