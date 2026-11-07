import type { WorldRecord } from './types.ts';
import { conditionStage } from './condition.ts';

/** 現在の閲覧用情報。将来の調子・乱数・契約の仮値は返さない。 */
export function playerStatuses(world: WorldRecord) {
  const activeRegistrations = new Map<string, 'first' | 'farm'>();
  if ('registration' in world)
    for (const row of world.registration.registrations)
      if (row.until === null && !activeRegistrations.has(row.playerId))
        activeRegistrations.set(row.playerId, row.category);
  const latestPitching = new Map<string, { date: string; pitches: number }>();
  if ('restControl' in world)
    for (const row of Object.values(world.restControl.appearances)) {
      const latest = latestPitching.get(row.playerId);
      if (!latest || row.date > latest.date)
        latestPitching.set(row.playerId, { date: row.date, pitches: row.pitches });
      else if (row.date === latest.date) latest.pitches += row.pitches;
    }
  return world.definitions.squads.flatMap((squad) =>
    squad.players.map((player) => {
      const physical = 'physical' in world ? world.physical.players[player.playerId] : undefined;
      const condition = 'condition' in world ? world.condition.players[player.playerId] : undefined;
      const pitching = latestPitching.get(player.playerId);
      return {
        playerId: player.playerId,
        lastPitchedOn: pitching?.date ?? null,
        lastPitchCount: pitching?.pitches ?? null,
        clubId: squad.team.clubId,
        registration: activeRegistrations.get(player.playerId) ?? null,
        energyMilli: physical?.energyMilli ?? null,
        fatigueMilli: physical?.fatigueMilli ?? null,
        condition:
          condition && world.definitions.conditionConfig
            ? conditionStage(condition.conditionMilli, world.definitions.conditionConfig)
            : null,
      };
    }),
  );
}
