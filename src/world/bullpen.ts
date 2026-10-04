import { ensure } from '../engine/validation.ts';
import { validateBullpenConfig } from '../game/bullpen.ts';
import { allWorldSquads, worldSquad } from './squads.ts';
import type { WorldDefinitions, WorldRecord } from './types.ts';
import type { GameFixture } from '../game/types.ts';

export interface BullpenInput {
  squadId: string;
  enabled: boolean;
}
export type BullpenWorld = Extract<WorldRecord, { version: 'world-prototype-v14' }>;

export function validateBullpenDefinitions(defs: WorldDefinitions): void {
  validateBullpenConfig(defs.bullpenConfig!);
  const inputs = defs.bullpenInputs;
  ensure(
    Array.isArray(inputs) &&
      inputs.length === allWorldSquads(defs).length &&
      new Set(inputs.map((i) => i.squadId)).size === inputs.length,
    '全チームの準備方針が必要です',
  );
  for (const input of inputs)
    ensure(
      worldSquad(defs, input.squadId) && typeof input.enabled === 'boolean',
      '準備方針のチームまたは有効設定が不正です',
    );
}

export function attachBullpen(world: BullpenWorld, gameId: string, fixture: GameFixture): void {
  const scheduled = world.definitions.schedule.find((g) => g.gameId === gameId)!;
  const team = (id: string) => ({
    enabled: world.definitions.bullpenInputs!.find((i) => i.squadId === id)!.enabled,
  });
  fixture.bullpenPolicy = {
    config: structuredClone(world.definitions.bullpenConfig!),
    teams: { away: team(scheduled.awaySquadId), home: team(scheduled.homeSquadId) },
  };
}

export function bullpenView(world: BullpenWorld) {
  const clubId = worldSquad(world.definitions, world.management.controlledSquadId)!.team.clubId;
  return world.definitions.schedule
    .filter((g) => g.date === world.currentDate || g.date === world.lastCompletedDate)
    .flatMap((scheduled) => {
      const game = world.games[scheduled.gameId];
      if (!game) return [];
      return (['away', 'home'] as const)
        .filter((side) => game.fixture.teams[side].clubId === clubId)
        .map((side) => ({
          gameId: scheduled.gameId,
          date: scheduled.date,
          squadId: side === 'away' ? scheduled.awaySquadId : scheduled.homeSquadId,
          enabled: game.fixture.bullpenPolicy!.teams[side].enabled,
          requiredPitches: game.fixture.bullpenPolicy!.config.requiredPitches,
          players: Object.entries(game.state.bullpen!.teams[side].players).map(
            ([playerId, state]) => ({
              playerId,
              ...state,
              used: game.state.usedPitcherIds![side].includes(playerId),
            }),
          ),
          history: game.events
            .flatMap((e) =>
              (e.bullpenActions ?? [])
                .filter((a) => a.side === side)
                .map((a) => ({ ...a, eventSeq: e.eventSeq, inning: e.before.inning })),
            )
            .slice(-12)
            .reverse(),
        }));
    });
}
