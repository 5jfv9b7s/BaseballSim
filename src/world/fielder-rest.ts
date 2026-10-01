import { ensure, integer } from '../engine/validation.ts';
import { allWorldSquads, worldSquad } from './squads.ts';
import type { IdealLineup, WorldDefinitions, WorldRecord } from './types.ts';
import type {
  FielderRestRules,
  FielderRestControl,
  FielderRestSnapshot,
  FielderRestDecision,
  FielderRestAction,
} from './fielder-rest-types.ts';

export type FielderRestWorld = Extract<WorldRecord, { fielderRest: FielderRestControl }>;

export function validateFielderRestRules(rules: FielderRestRules): void {
  ensure(rules && typeof rules.enabled === 'boolean', '野手の自動休養設定が不正です');
  if (rules.energyMilli !== null) integer(rules.energyMilli, 0, 100000, '野手休養の体力基準');
  if (rules.fatigueMilli !== null) integer(rules.fatigueMilli, 0, 100000, '野手休養の疲労基準');
}

export function validateFielderRestDefinitions(definitions: WorldDefinitions): void {
  ensure(definitions.fielderRestModelVersion === 'fielder-rest-v1', '野手休養のモデル版が不正です');
  const inputs = definitions.fielderRestInputs;
  const squads = allWorldSquads(definitions);
  ensure(
    Array.isArray(inputs) && inputs.length === squads.length,
    '全チームの野手休養設定が必要です',
  );
  ensure(
    new Set(inputs.map((r) => r.squadId)).size === inputs.length,
    '野手休養のチームが重複しています',
  );
  for (const row of inputs) {
    ensure(
      squads.some((s) => s.squadId === row.squadId),
      '野手休養のチームがありません',
    );
    validateFielderRestRules(row.rules);
  }
}

export function initialFielderRest(definitions: WorldDefinitions): FielderRestControl {
  return {
    version: 'fielder-rest-v1',
    teamPolicies: Object.fromEntries(
      definitions.fielderRestInputs!.map((row) => [
        row.squadId,
        {
          rules: structuredClone(row.rules),
          policyRevision: 1,
        },
      ]),
    ),
  };
}

export function applyFielderRestPolicy(
  world: FielderRestWorld,
  action: FielderRestAction,
): FielderRestWorld {
  validateFielderRestRules(action.rules);
  const previous = world.fielderRest.teamPolicies[action.squadId];
  ensure(previous, '野手休養のチームがありません');
  return {
    ...world,
    fielderRest: {
      ...world.fielderRest,
      teamPolicies: {
        ...world.fielderRest.teamPolicies,
        [action.squadId]: {
          rules: structuredClone(action.rules),
          policyRevision: previous.policyRevision + 1,
        },
      },
    },
  };
}

/** 登録・ベンチ制約を解決済みの打順に適用。理想案とベンチ名簿は書き換えない。 */
export function resolveFielderRest(
  world: FielderRestWorld,
  squadId: string,
  registered: string[],
  bench: string[],
  lineup: IdealLineup,
  explicitLineup: boolean,
): { lineup: IdealLineup; snapshot: FielderRestSnapshot } {
  const squad = worldSquad(world.definitions, squadId)!;
  const policy = world.fielderRest.teamPolicies[squadId]!;
  const rules = policy.rules;
  const players = squad.players.filter(
    (p) => registered.includes(p.playerId) && !squad.team.pitcherIds.includes(p.playerId),
  );
  const decisions: FielderRestDecision[] = players.map((p) => {
    const { energyMilli, fatigueMilli } = world.physical.players[p.playerId]!;
    const reasons: string[] = [];
    if (rules.enabled) {
      if (rules.energyMilli !== null && energyMilli <= rules.energyMilli)
        reasons.push('体力が休養基準以下');
      if (rules.fatigueMilli !== null && fatigueMilli >= rules.fatigueMilli)
        reasons.push('疲労が休養基準以上');
    }
    return {
      playerId: p.playerId,
      energyMilli,
      fatigueMilli,
      requested: reasons.length > 0,
      reasons,
      outcome: bench.includes(p.playerId) ? 'reserve' : 'outsideBench',
      replacementId: null,
      exception: null,
    };
  });
  const byId = new Map(decisions.map((d) => [d.playerId, d]));
  const resolved = structuredClone(lineup);
  // 元の9人を先に確保。他の打順の選手を代役に使って連鎖的に変更しない。
  const used = new Set(resolved.battingOrder.map((s) => s.playerId));
  for (const slot of resolved.battingOrder) {
    const row = byId.get(slot.playerId)!;
    row.outcome = 'starting';
    if (!row.requested) continue;
    if (explicitLineup) {
      row.exception = '当日の手動オーダーを優先';
      continue;
    }
    // 暫定の同順位規則は保存内の所属名簿順。状態良好なベンチ内控えだけを使う。
    const replacement = decisions.find(
      (d) => bench.includes(d.playerId) && !used.has(d.playerId) && !d.requested,
    );
    if (!replacement) {
      row.exception = '休養条件に該当しない控えが不足するため起用を維持';
      continue;
    }
    row.outcome = 'resting';
    row.replacementId = replacement.playerId;
    replacement.outcome = 'starting';
    replacement.reasons.push('休養する野手の代役');
    const previousId = slot.playerId;
    slot.playerId = replacement.playerId;
    used.add(replacement.playerId);
    for (const defense of resolved.defense)
      if (defense.playerId === previousId) defense.playerId = replacement.playerId;
  }
  return {
    lineup: resolved,
    snapshot: {
      version: 'fielder-rest-v1',
      date: world.currentDate,
      policyRevision: policy.policyRevision,
      rules: structuredClone(rules),
      decisions,
    },
  };
}
