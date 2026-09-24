import type { GameFixture, TeamSide } from '../../game/types.ts';
import { players as awayPlayers } from '../players/hoshihara.ts';
import { players as homePlayers } from '../players/aonagi.ts';
import { repertoires as awayPitches } from '../repertoires/hoshihara.ts';
import { repertoires as homePitches } from '../repertoires/aonagi.ts';
import { squad as awaySquad } from '../teams/hoshihara.ts';
import { squad as homeSquad } from '../teams/aonagi.ts';

/** 新規v10も球団別の共通データを参照する。保存の再現には保存内名簿を使う。 */
export function createCurrentFixture(): GameFixture {
  const teams = {
    away: { ...awaySquad.team, side: 'away' as const },
    home: { ...homeSquad.team, side: 'home' as const },
  };
  const activeIds = Object.values(teams).flatMap((team) => [
    ...team.lineup.map((slot) => slot.playerId),
    ...team.pitcherIds,
  ]);
  return structuredClone({
    initialDatasetVersion: 'game-fixture-v2',
    players: [...awayPlayers, ...homePlayers].filter((player) =>
      activeIds.includes(player.playerId),
    ),
    pitches: [...awayPitches, ...homePitches].filter((pitch) => activeIds.includes(pitch.playerId)),
    teams,
    clubs: (['away', 'home'] as const).map((side: TeamSide) => ({
      clubId: teams[side].clubId,
      name: teams[side].name,
      playerIds: [...teams[side].lineup.map((slot) => slot.playerId), ...teams[side].pitcherIds],
    })),
  });
}
