import type { ScheduledGame, StatKey, WorldDefinitions, WorldSquad } from './types.ts';

/** 二軍も同じ所属選手を参照する。登録移動で選手IDや能力を作り直さない。 */
export function worldSquad(definitions: WorldDefinitions, squadId: string): WorldSquad | undefined {
  const first = definitions.squads.find((squad) => squad.squadId === squadId);
  if (first) return first;
  const farm = definitions.farm?.squads.find((squad) => squad.squadId === squadId);
  if (!farm) return undefined;
  const club = definitions.squads.find((squad) => squad.team.clubId === farm.team.clubId);
  if (!club) return undefined;
  const pitcherIds = [...new Set([...farm.team.pitcherIds, ...club.team.pitcherIds])];
  return {
    ...club,
    squadId,
    team: { ...farm.team, pitcherIds },
    reserveBatterIds: club.players
      .map((player) => player.playerId)
      .filter(
        (id) => !pitcherIds.includes(id) && !farm.team.lineup.some((slot) => slot.playerId === id),
      ),
  };
}

export function allWorldSquads(definitions: WorldDefinitions): WorldSquad[] {
  return [
    ...definitions.squads,
    ...(definitions.farm?.squads.map((squad) => worldSquad(definitions, squad.squadId)!) ?? []),
  ];
}

export function isFarmSquad(definitions: WorldDefinitions, squadId: string): boolean {
  return definitions.farm?.squads.some((squad) => squad.squadId === squadId) ?? false;
}

/** 試合の区分は保存内の日程・大会から取得する。表示の選択は関与しない。 */
export function gameScope(
  definitions: WorldDefinitions,
  game: ScheduledGame,
): StatKey['statScope'] {
  return isFarmSquad(definitions, game.awaySquadId) ? 'farmRegular' : 'firstRegular';
}
