import { ensure } from '../engine/validation.ts';
import {
  planTradeRegistrationChanges,
  tradeRosterAutoSource,
  type TradeRegistrationAudit,
} from './trade-registration.ts';
import { nextTradePolicyRevision } from './trade-application-state.ts';
import type { TradeApplicationWorld } from './trade-application-types.ts';
import type { TradeRosterIssue } from '../recruitment/trade-roster-types.ts';
import type { RosterPreference } from './roster-policy-types.ts';
import type { FinanceMoment } from '../finance/types.ts';

export interface TradeRosterReconciliation {
  clubId: string;
  requestedPlayerIds: string[];
  status: 'unchanged' | 'applied' | 'pending';
  issues: TradeRosterIssue[];
  audit: TradeRegistrationAudit;
}

/** 希望との差分を球団ごとに一括適用。再登録待ちや編成の欠員は一式保留する。 */
export function reconcileTradeRosterClub(
  world: TradeApplicationWorld,
  clubId: string,
  sourceId: string,
) {
  const changes = world.rosterControl.preferences
    .filter((p) => p.clubId === clubId && p.preference !== 'auto')
    .flatMap((p) => {
      if (
        !world.registration.memberships.some(
          (m) => m.playerId === p.playerId && m.clubId === clubId && m.until === null,
        )
      )
        return [];
      const row = world.registration.registrations.find(
        (r) => r.playerId === p.playerId && r.clubId === clubId && r.until === null,
      );
      ensure(row, '固定希望の現在登録がありません');
      const category = p.preference === 'firstFixed' ? ('first' as const) : ('farm' as const);
      return row.category === category ? [] : [{ playerId: p.playerId, category }];
    });
  const report: TradeRosterReconciliation = {
    clubId,
    requestedPlayerIds: changes.map((c) => c.playerId),
    status: 'unchanged',
    issues: [],
    audit: { changedPlayerIds: [], invalidatedOverrides: [] },
  };
  if (!changes.length) return { world, report };
  const result = planTradeRegistrationChanges(world, {
    clubId,
    changes,
    squadReplacements: [],
    sourceId,
    at: world.rosterAsOf,
  });
  if (result.status === 'blocked')
    return { world, report: { ...report, status: 'pending' as const, issues: result.issues } };
  return {
    world: result.world,
    report: { ...report, status: 'applied' as const, audit: result.audit },
  };
}

/** 翌日order0に実行。別球団の既知の保留で他球団や日付進行を止めない。 */
export function reconcileTradeRosterPolicies(world: TradeApplicationWorld) {
  let next = world;
  const reports: TradeRosterReconciliation[] = [];
  if (world.currentDate > world.initialDefinitions.endDate) return { world, reports };
  for (const squad of world.initialDefinitions.squads) {
    const policy = next.rosterControl.policies[squad.team.clubId];
    ensure(policy?.clubId === squad.team.clubId, '入替方針の記録がありません');
    if (policy.changeMode !== 'auto') continue;
    const result = reconcileTradeRosterClub(
      next,
      squad.team.clubId,
      tradeRosterAutoSource(world.currentDate, squad.team.clubId),
    );
    next = result.world;
    reports.push(result.report);
  }
  return { world: next, reports };
}

/** 設定だけ更新する。入力は初期名簿ではなく移籍後の現在所属全員を要求する。 */
export function setTradeRosterPolicy(
  world: TradeApplicationWorld,
  input: {
    clubId: string;
    changeMode: 'manual' | 'auto';
    preferences: { playerId: string; preference: RosterPreference }[];
    at: FinanceMoment;
  },
) {
  const ids = world.registration.memberships
    .filter((m) => m.clubId === input.clubId && m.until === null)
    .map((m) => m.playerId);
  ensure(['manual', 'auto'].includes(input.changeMode), '入替モードが不正です');
  ensure(
    input.preferences.length === ids.length &&
      new Set(input.preferences.map((p) => p.playerId)).size === ids.length &&
      input.preferences.every(
        (p) =>
          ids.includes(p.playerId) && ['firstFixed', 'farmFixed', 'auto'].includes(p.preference),
      ),
    '現在所属する全選手の固定希望を重複なく指定してください',
  );
  const next = structuredClone(world),
    policy = next.rosterControl.policies[input.clubId];
  ensure(policy?.clubId === input.clubId, '入替方針の記録がありません');
  policy.changeMode = input.changeMode;
  policy.policyRevision = nextTradePolicyRevision(policy.policyRevision);
  next.rosterAsOf = { ...input.at };
  for (const value of input.preferences) {
    const row = next.rosterControl.preferences.find(
      (r) => r.clubId === input.clubId && r.playerId === value.playerId,
    );
    ensure(row, '現在所属の固定希望の保存がありません');
    if (row.preference === value.preference) continue;
    row.preference = value.preference;
    row.updatedAt = { ...input.at };
  }
  return next;
}
