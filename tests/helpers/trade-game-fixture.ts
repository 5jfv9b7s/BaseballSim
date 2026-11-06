import { tradeSaveFixture } from './trade-save-fixture.ts';
import { tradeSquadRoster } from '../../src/world/trade-squad-roster.ts';
import {
  applyTradeGameCommand,
  type TradeGameCommand,
} from '../../src/world/trade-game-commands.ts';
import type { TradeSavedState } from '../../src/world/trade-save-validation.ts';
import type { TradeApplicationStorage } from '../../src/world/trade-application-port.ts';

export function gameFixture() {
  const fixture = tradeSaveFixture();
  for (const policy of Object.values(fixture.initial.state.restControl.teamPolicies))
    policy.teamRestPolicy.action = 'none';
  for (const policy of Object.values(fixture.initial.state.fielderRest.teamPolicies))
    policy.rules.enabled = false;
  return fixture;
}

export function beginCommand(
  saved: TradeSavedState,
  commandId = 'test-game-begin',
): Extract<TradeGameCommand, { kind: 'beginTradeGame' }> {
  const world = saved.state,
    gameId = world.dayPlan.gameIds[world.dayPlan.cursor]!;
  const scheduled = world.initialDefinitions.schedule.find((g) => g.gameId === gameId)!;
  const bench = (squadId: string) => {
    const roster = tradeSquadRoster(world, squadId);
    return [
      ...new Set([
        ...roster.lineup.map((s) => s.playerId),
        roster.pitchers.rotationSlots[roster.pitchers.nextSlotNo! - 1]!.playerId!,
        ...roster.pitchers.reliefRoles.map((r) => r.playerId),
      ]),
    ];
  };
  return {
    kind: 'beginTradeGame',
    commandId,
    localWorldId: saved.localWorldId,
    worldId: saved.worldId,
    expectedStateRevision: saved.stateRevision,
    gameId,
    benchIds: { away: bench(scheduled.awaySquadId), home: bench(scheduled.homeSquadId) },
  };
}

export function advanceCommand(
  saved: TradeSavedState,
  commandId = 'test-game-advance',
  eventCount = 1,
): Extract<TradeGameCommand, { kind: 'advanceTradeGame' }> {
  const gameId = saved.state.dayPlan.gameIds[saved.state.dayPlan.cursor]!;
  return {
    kind: 'advanceTradeGame',
    commandId,
    localWorldId: saved.localWorldId,
    worldId: saved.worldId,
    expectedStateRevision: saved.stateRevision,
    gameId,
    eventCount,
    expectedNextEventSeq: saved.state.games[gameId]!.state.nextEventSeq,
  };
}

export function applied(saved: TradeSavedState, command: TradeGameCommand): TradeSavedState {
  const result = applyTradeGameCommand(saved, command);
  if (result.status !== 'applied') throw new Error('試験用の試合指示が再送になりました');
  return result.snapshot;
}

export function memoryStorage(initial: TradeSavedState) {
  let saved = structuredClone(initial),
    writes = 0;
  const storage: TradeApplicationStorage = {
    async read() {
      return structuredClone(saved);
    },
    async commit(_expected, candidate) {
      saved = structuredClone(candidate);
      writes++;
    },
  };
  return { storage, writes: () => writes };
}
