import type { WorldRecord } from './types.ts';
import { conditionStage } from './condition.ts';

/** 現在の閲覧用情報。将来の調子・乱数・契約の仮値は返さない。 */
export function playerStatuses(world: WorldRecord) {
  return world.definitions.squads.flatMap((squad) =>
    squad.players.map((player) => {
      const registration =
        'registration' in world
          ? world.registration.registrations.find(
              (row) => row.playerId === player.playerId && row.until === null,
            )
          : undefined;
      const physical = 'physical' in world ? world.physical.players[player.playerId] : undefined;
      const condition = 'condition' in world ? world.condition.players[player.playerId] : undefined;
      return {
        playerId: player.playerId,
        clubId: squad.team.clubId,
        registration: registration?.category ?? null,
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
