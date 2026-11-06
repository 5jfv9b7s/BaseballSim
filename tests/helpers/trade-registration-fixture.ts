import assert from 'node:assert/strict';
import { tradeApplicationRosterState } from '../../src/world/trade-application-state.ts';
import {
  applyTradeRosterCommand,
  type TradeRosterCommand,
} from '../../src/world/trade-roster-commands.ts';
import { dayCommand } from './trade-day-fixture.ts';
import type { TradeSavedState } from '../../src/world/trade-save-validation.ts';
import type { TradeSquadPlan } from '../../src/recruitment/trade-roster-types.ts';
import type { RosterPreference } from '../../src/world/roster-policy-types.ts';

export function currentClub(saved: TradeSavedState) {
  const world = saved.state;
  return world.initialDefinitions.squads.find(
    (s) => s.squadId === world.management.controlledSquadId,
  )!.team.clubId;
}

export function reserveBatter(
  saved: TradeSavedState,
  category: 'first' | 'farm' = 'first',
  clubId = currentClub(saved),
) {
  const squad = tradeApplicationRosterState(saved.state).squads.find(
    (s) => s.clubId === clubId && s.category === category,
  )!;
  const id = saved.state.registration.registrations.find(
    (r) =>
      r.clubId === clubId &&
      r.until === null &&
      r.category === category &&
      saved.state.playerFacts.find((p) => p.playerId === r.playerId)!.canBat &&
      !squad.lineup.battingOrder.some((s) => s.playerId === r.playerId),
  )?.playerId;
  assert.ok(id, '試験用の控え野手が必要です');
  return id;
}

export function registrationCommand(
  saved: TradeSavedState,
  commandId = 'test-registration',
): Extract<TradeRosterCommand, { kind: 'setTradeRegistrations' }> {
  return {
    kind: 'setTradeRegistrations',
    commandId,
    localWorldId: saved.localWorldId,
    worldId: saved.worldId,
    expectedStateRevision: saved.stateRevision,
    expectedDate: saved.currentDate,
    clubId: currentClub(saved),
    changes: [{ playerId: reserveBatter(saved), category: 'farm' }],
    squadReplacements: [],
  };
}

export function policyCommand(
  saved: TradeSavedState,
  values: Record<string, RosterPreference> = {},
  mode: 'manual' | 'auto' = 'auto',
  commandId = 'test-policy',
): Extract<TradeRosterCommand, { kind: 'setTradeRosterPolicy' }> {
  const clubId = currentClub(saved);
  return {
    kind: 'setTradeRosterPolicy',
    commandId,
    localWorldId: saved.localWorldId,
    worldId: saved.worldId,
    expectedStateRevision: saved.stateRevision,
    expectedDate: saved.currentDate,
    clubId,
    changeMode: mode,
    preferences: saved.state.registration.memberships
      .filter((m) => m.until === null && m.clubId === clubId)
      .map((m) => ({
        playerId: m.playerId,
        preference:
          values[m.playerId] ??
          saved.state.rosterControl.preferences.find(
            (p) => p.clubId === clubId && p.playerId === m.playerId,
          )!.preference,
      })),
  };
}

export function rosterApplied(saved: TradeSavedState, command: TradeRosterCommand) {
  const result = applyTradeRosterCommand(saved, command);
  assert.equal(result.status, 'applied');
  if (result.status !== 'applied') throw new Error('試験用の登録変更が成立しません');
  return result.snapshot;
}

export function rosterDayCommand(saved: TradeSavedState, id = 'test-roster-day') {
  return { ...dayCommand(saved, id), kind: 'completeTradeDayWithRoster' as const };
}

/** 両軍の打順・投手・個別指示を明示的に交換する試験案。製品の自動編成ではない。 */
export function replacePlayer(squad: TradeSquadPlan, oldId: string, newId: string): TradeSquadPlan {
  const id = (value: string | null) => (value === oldId ? newId : value);
  return {
    ...squad,
    lineup: {
      ...squad.lineup,
      battingOrder: squad.lineup.battingOrder.map((s) => ({ ...s, playerId: id(s.playerId) })),
      defense: squad.lineup.defense.map((s) => ({ ...s, playerId: id(s.playerId) })),
    },
    pitchers: {
      ...squad.pitchers,
      rotationSlots: squad.pitchers.rotationSlots.map((s) => ({ ...s, playerId: id(s.playerId) })),
      reliefRoles: squad.pitchers.reliefRoles.map((s) => ({ ...s, playerId: id(s.playerId)! })),
    },
    individualRest: squad.individualRest.map((s) => ({ ...s, playerId: id(s.playerId)! })),
    conditionalRelief: squad.conditionalRelief.map((s) => ({ ...s, playerId: id(s.playerId)! })),
  };
}
