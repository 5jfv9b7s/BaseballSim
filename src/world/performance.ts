import { conditionStage } from './condition.ts';
import type { GameFixture } from '../game/types.ts';
import type { PerformanceSnapshot } from '../game/performance-types.ts';
import { performanceDetails } from '../game/performance.ts';
import { createScheduledGame } from './engine.ts';
import type { WorldRecord } from './types.ts';
export type PerformanceWorld = Extract<
  WorldRecord,
  { version: 'world-prototype-v11' | 'world-prototype-v12' | 'world-prototype-v13' }
>;

export function performanceSnapshot(
  world: PerformanceWorld,
  gameId: string,
  fixture: GameFixture,
): PerformanceSnapshot {
  return {
    version: 'pregame-performance-v1',
    date: world.currentDate,
    gameId,
    config: structuredClone(world.definitions.performanceConfig!),
    players: Object.fromEntries(
      fixture.players.map((player) => [
        player.playerId,
        {
          conditionMilli: world.condition.players[player.playerId]!.conditionMilli,
          energyMilli: world.physical.players[player.playerId]!.energyMilli,
          fatigueMilli: world.physical.players[player.playerId]!.fatigueMilli,
        },
      ]),
    ),
  };
}

/** 担当球団の当日・前日の試合だけを表示。開始後は保存済みの入力へ固定する。 */
export function performanceView(world: PerformanceWorld) {
  const firstId = world.management.controlledSquadId;
  const clubId = world.definitions.squads.find((s) => s.squadId === firstId)!.team.clubId;
  const farmId = world.definitions.farm!.squads.find((s) => s.team.clubId === clubId)!.squadId;
  const onDate = (date: string | null) =>
    !date
      ? []
      : [firstId, farmId].flatMap((squadId) => {
          const scheduled = world.definitions.schedule.find(
            (g) => g.date === date && [g.awaySquadId, g.homeSquadId].includes(squadId),
          );
          if (!scheduled) return [];
          const saved = world.games[scheduled.gameId];
          if (!saved && date !== world.currentDate) return [];
          const game = saved ?? createScheduledGame(world, scheduled.gameId);
          const ids = game.fixture.clubs.find((c) => c.clubId === clubId)!.playerIds;
          return [
            {
              gameId: scheduled.gameId,
              date,
              squadId,
              label: squadId === firstId ? '一軍' : '二軍',
              fixed: !!saved,
              players: performanceDetails(game.fixture, game.performance!)
                .filter((p) => ids.includes(p.playerId))
                .map((p) => ({
                  ...p,
                  conditionStage: conditionStage(
                    p.conditionMilli,
                    world.definitions.conditionConfig!,
                  ),
                })),
            },
          ];
        });
  return { today: onDate(world.currentDate), previous: onDate(world.lastCompletedDate) };
}
