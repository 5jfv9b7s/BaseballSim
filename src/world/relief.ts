import { ensure } from '../engine/validation.ts';
import { validateReliefConfig, validateReliefRules } from '../game/relief.ts';
import { allWorldSquads, worldSquad } from './squads.ts';
import { evaluateRest, restRank } from './rest.ts';
import type { GameFixture } from '../game/types.ts';
import type { WorldDefinitions, WorldRecord } from './types.ts';
import type { ReliefControl, ReliefPolicyAction } from './relief-types.ts';
export type ReliefWorld = Extract<WorldRecord, { reliefControl: ReliefControl }>;

export function validateReliefDefinitions(defs: WorldDefinitions): void {
  validateReliefConfig(defs.reliefConfig!);
  const inputs = defs.reliefPolicyInputs;
  ensure(
    Array.isArray(inputs) &&
      inputs.length === allWorldSquads(defs).length &&
      new Set(inputs.map((p) => p.squadId)).size === inputs.length,
    '全チームの救援役割を重複なく指定してください',
  );
  for (const input of inputs) {
    const squad = worldSquad(defs, input.squadId);
    ensure(squad, '救援設定のチームがありません');
    validateReliefRules(input.reliefRoles, squad.team.pitcherIds);
  }
}
export function initialRelief(defs: WorldDefinitions): ReliefControl {
  return {
    version: 'conditional-relief-v1',
    teamPolicies: Object.fromEntries(
      defs.reliefPolicyInputs!.map((p) => [
        p.squadId,
        { reliefRoles: structuredClone(p.reliefRoles), policyRevision: 1 },
      ]),
    ),
  };
}
export function applyReliefPolicy(world: ReliefWorld, action: ReliefPolicyAction): ReliefWorld {
  const squad = worldSquad(world.definitions, action.squadId);
  ensure(squad, '救援設定のチームがありません');
  validateReliefRules(action.reliefRoles, squad.team.pitcherIds);
  const previous = world.reliefControl.teamPolicies[action.squadId]!;
  return {
    ...world,
    reliefControl: {
      ...world.reliefControl,
      teamPolicies: {
        ...world.reliefControl.teamPolicies,
        [action.squadId]: {
          reliefRoles: structuredClone(action.reliefRoles),
          policyRevision: previous.policyRevision + 1,
        },
      },
    },
  };
}
/** ベンチ・当日先発・休養を解決した後の候補に絞り、試合前の規則を固定する。 */
export function attachReliefPolicy(world: ReliefWorld, gameId: string, fixture: GameFixture): void {
  const scheduled = world.definitions.schedule.find((g) => g.gameId === gameId)!;
  const team = (side: 'away' | 'home') => {
    const squadId = side === 'away' ? scheduled.awaySquadId : scheduled.homeSquadId;
    const ids = fixture.teams[side].pitcherIds;
    const policy = world.reliefControl.teamPolicies[squadId]!;
    return {
      policyRevision: policy.policyRevision,
      reliefRoles: structuredClone(policy.reliefRoles.filter((r) => ids.includes(r.playerId))),
      restPriority: Object.fromEntries(
        ids.map((id) => [id, restRank(evaluateRest(world, squadId, id))]),
      ),
    };
  };
  fixture.reliefPolicy = {
    version: 'conditional-relief-v1',
    roleOrder: [...world.definitions.reliefConfig!.roleOrder],
    teams: { away: team('away'), home: team('home') },
  };
}
export function reliefView(world: ReliefWorld) {
  const squadId = world.management.controlledSquadId;
  const clubId = worldSquad(world.definitions, squadId)!.team.clubId;
  const decisions = world.definitions.schedule
    .filter((g) => g.date === world.currentDate || g.date === world.lastCompletedDate)
    .flatMap((scheduled) => {
      const game = world.games[scheduled.gameId];
      if (!game) return [];
      return game.events
        .filter(
          (e) => e.reliefDecision && game.fixture.teams[e.reliefDecision.side].clubId === clubId,
        )
        .map((e) => ({
          gameId: scheduled.gameId,
          date: scheduled.date,
          eventSeq: e.eventSeq,
          squadId:
            e.reliefDecision!.side === 'away' ? scheduled.awaySquadId : scheduled.homeSquadId,
          decision: e.reliefDecision!,
        }));
    })
    .slice(-12)
    .reverse();
  return { ...world.reliefControl.teamPolicies[squadId]!, decisions };
}
