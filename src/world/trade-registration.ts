import { ensure } from '../engine/validation.ts';
import { compareMoments, uniqueFinanceIds, validateMoment } from '../finance/validation.ts';
import {
  checkTradeLineup,
  checkTradeSquad,
  checkTradeStartingBench,
  squadEligibleIds,
} from '../recruitment/trade-roster-lineups.ts';
import { validateTradeRegistrations } from '../recruitment/trade-roster-registration.ts';
import { registrationEligibleOn } from './registration.ts';
import {
  nextTradePolicyRevision,
  sameTradeValue,
  tradeApplicationRosterState,
} from './trade-application-state.ts';
import type { FinanceMoment } from '../finance/types.ts';
import type { TradeRosterIssue, TradeSquadPlan } from '../recruitment/trade-roster-types.ts';
import type { TradeApplicationWorld } from './trade-application-types.ts';

/** 手動指示と日次自動の発生元を別の名前空間にして衝突を防ぐ。 */
export const tradeRosterCommandSource = (id: string) => JSON.stringify(['roster-command-v1', id]);
export const tradeRosterAutoSource = (date: string, clubId: string) =>
  JSON.stringify(['roster-auto-v1', date, clubId]);

export interface TradeRegistrationChange {
  playerId: string;
  category: 'first' | 'farm';
}
export interface TradeRegistrationAudit {
  changedPlayerIds: string[];
  invalidatedOverrides: { gameId: string; fields: ('lineup' | 'starterId' | 'benchIds')[] }[];
}
export type TradeRegistrationResult =
  | { status: 'blocked'; issues: TradeRosterIssue[] }
  | { status: 'ready'; world: TradeApplicationWorld; audit: TradeRegistrationAudit };

/** 当日の試合は球団・指定の有無にかかわらず実記録から判定する。 */
export function requireTradeRosterEditable(world: TradeApplicationWorld): void {
  const defs = world.initialDefinitions;
  ensure(
    world.currentDate >= defs.startDate &&
      world.currentDate <= defs.endDate &&
      world.dayPlan.date === world.currentDate &&
      world.rosterAsOf.date === world.currentDate,
    '登録を変更できる日付・所属基準ではありません',
  );
  ensure(
    world.dayPlan.cursor === 0 &&
      !defs.schedule.some((g) => g.date === world.currentDate && world.games[g.gameId]),
    '当日の試合開始後は登録・固定希望を変更できません',
  );
}

/**
 * 登録と明示された一二軍編成を一括審査。所属・会計・個人状態・過去試合は変更しない。
 * 自動処理でも、欠員や制度違反を都合のよい代役・抹消で解消しない。
 */
export function planTradeRegistrationChanges(
  world: TradeApplicationWorld,
  input: {
    clubId: string;
    changes: readonly TradeRegistrationChange[];
    squadReplacements: readonly TradeSquadPlan[];
    sourceId: string;
    at: FinanceMoment;
  },
): TradeRegistrationResult {
  const { clubId, changes, squadReplacements, at, sourceId } = input;
  validateMoment(at);
  ensure(
    at.date === world.currentDate && compareMoments(at, world.rosterAsOf) >= 0,
    '登録変更の時点が所属基準より前です',
  );
  ensure(
    world.initialDefinitions.squads.some((s) => s.team.clubId === clubId),
    '球団がありません',
  );
  uniqueFinanceIds(
    changes.map((c) => c.playerId),
    '登録変更の選手',
  );
  uniqueFinanceIds(
    squadReplacements.map((s) => s.squadId),
    '変更する編成',
  );
  const state = tradeApplicationRosterState(world);
  validateTradeRegistrations(state.registrations, state.memberships);
  const registrations = structuredClone(state.registrations);
  const issues: TradeRosterIssue[] = [];
  const changedPlayerIds: string[] = [];
  for (const change of changes) {
    ensure(['first', 'farm'].includes(change.category), '登録区分が不正です');
    const member = state.memberships.find(
      (m) => m.playerId === change.playerId && m.clubId === clubId && m.until === null,
    );
    const current = registrations.find(
      (r) => r.playerId === change.playerId && r.clubId === clubId && r.until === null,
    );
    ensure(
      member && current && compareMoments(member.from, at) <= 0,
      '現在の球団に所属していない選手です',
    );
    if (current.category === change.category) continue;
    ensure(compareMoments(current.from, at) < 0, '同じイベント順で登録期間を閉じられません');
    if (
      change.category === 'first' &&
      current.nextFirstEligibleOn !== null &&
      current.nextFirstEligibleOn > at.date
    ) {
      issues.push({
        code: 'registrationCooldown',
        clubId,
        playerId: change.playerId,
        message: `一軍再登録可能日は${current.nextFirstEligibleOn}です。`,
      });
      continue;
    }
    const registrationId = JSON.stringify(['roster-registration-v1', sourceId, change.playerId]);
    ensure(
      !registrations.some((r) => r.registrationId === registrationId),
      '登録変更の発生元が重複しています',
    );
    current.until = { ...at };
    registrations.push({
      ...current,
      registrationId,
      category: change.category,
      from: { ...at },
      until: null,
      nextFirstEligibleOn:
        change.category === 'first'
          ? null
          : registrationEligibleOn(
              at.date,
              world.initialDefinitions.registrationRules!.reentryDays,
            ),
      sourceId,
    });
    changedPlayerIds.push(change.playerId);
  }
  if (issues.length) return { status: 'blocked', issues };
  const rules = world.initialDefinitions.registrationRules!;
  const first = registrations.filter(
    (r) => r.clubId === clubId && r.until === null && r.category === 'first',
  );
  if (
    first.length > rules.firstLimit ||
    first.filter(
      (r) =>
        world.playerFacts.find((p) => p.playerId === r.playerId)!.foreignBaseStatus === 'subject',
    ).length > rules.foreignFirstLimit
  )
    issues.push({
      code: 'rosterLimit',
      clubId,
      message: '一軍人数または外国人の一軍登録上限を超えています。',
    });
  const squads = state.squads.map((s) => {
    const replacement = squadReplacements.find((r) => r.squadId === s.squadId);
    if (!replacement) return s;
    ensure(
      s.clubId === clubId &&
        replacement.clubId === clubId &&
        replacement.category === s.category &&
        replacement.benchLimit === s.benchLimit,
      '変更する編成の球団・区分・ベンチ上限は変更できません',
    );
    return replacement;
  });
  ensure(
    squadReplacements.every((s) => state.squads.some((r) => r.squadId === s.squadId)),
    '未知の編成指定です',
  );
  for (const squad of squads.filter((s) => s.clubId === clubId))
    issues.push(...checkTradeSquad(squad, registrations, { rules, players: world.playerFacts }));
  if (issues.length) return { status: 'blocked', issues };
  validateTradeRegistrations(registrations, state.memberships);
  const next = structuredClone(world);
  next.registration.registrations = registrations;
  next.rosterAsOf = { ...at };
  for (const squad of squads.filter((s) => s.clubId === clubId)) {
    const old = state.squads.find((s) => s.squadId === squad.squadId)!;
    if (
      changedPlayerIds.length ||
      !sameTradeValue(old.lineup, squad.lineup) ||
      !sameTradeValue(old.pitchers, squad.pitchers)
    ) {
      next.management.idealLineups[squad.squadId] = structuredClone(squad.lineup);
      next.management.pitcherUsagePlans[squad.squadId] = structuredClone(squad.pitchers);
      next.management.policyRevisions[squad.squadId] = nextTradePolicyRevision(
        next.management.policyRevisions[squad.squadId]!,
      );
    }
    if (!sameTradeValue(old.individualRest, squad.individualRest)) {
      next.restControl.pitcherUsagePlans[squad.squadId]!.individualRest = structuredClone(
        squad.individualRest,
      );
      const policy = next.restControl.teamPolicies[squad.squadId]!;
      policy.policyRevision = nextTradePolicyRevision(policy.policyRevision);
    }
    if (!sameTradeValue(old.conditionalRelief, squad.conditionalRelief)) {
      const policy = next.reliefControl.teamPolicies[squad.squadId]!;
      policy.reliefRoles = structuredClone(squad.conditionalRelief);
      policy.policyRevision = nextTradePolicyRevision(policy.policyRevision);
    }
  }
  const invalidatedOverrides: TradeRegistrationAudit['invalidatedOverrides'] = [];
  for (const override of state.overrides) {
    const squad = squads.find((s) => s.squadId === override.squadId)!;
    if (squad.clubId !== clubId || override.status !== 'scheduled' || override.date < at.date)
      continue;
    const eligible = squadEligibleIds(squad, registrations);
    const fields: TradeRegistrationAudit['invalidatedOverrides'][number]['fields'] = [];
    if (
      override.lineup &&
      [...override.lineup.battingOrder, ...override.lineup.defense].some(
        (s) => s.playerId !== null && !eligible.has(s.playerId),
      )
    ) {
      delete next.gameLineups[override.gameId];
      fields.push('lineup');
    }
    if (override.starterId && !eligible.has(override.starterId)) {
      delete next.management.starterOverrides[override.gameId];
      fields.push('starterId');
    }
    if (override.benchIds && override.benchIds.some((id) => !eligible.has(id))) {
      delete next.registration.benchOverrides[override.gameId];
      fields.push('benchIds');
    }
    const lineup = next.gameLineups[override.gameId] ?? squad.lineup;
    const starter =
      next.management.starterOverrides[override.gameId] ??
      squad.pitchers.rotationSlots.find((r) => r.slotNo === squad.pitchers.nextSlotNo)!.playerId;
    issues.push(
      ...checkTradeLineup(squad, lineup, eligible, { rules, players: world.playerFacts }),
    );
    issues.push(
      ...checkTradeStartingBench(squad, lineup, starter, { rules, players: world.playerFacts }),
    );
    const bench = next.registration.benchOverrides[override.gameId];
    if (
      bench &&
      (new Set(bench).size !== bench.length ||
        bench.length > squad.benchLimit ||
        bench.some((id) => !eligible.has(id)) ||
        (squad.category === 'first' &&
          bench.filter(
            (id) =>
              world.playerFacts.find((p) => p.playerId === id)?.foreignBaseStatus === 'subject',
          ).length > rules.foreignBenchLimit) ||
        !lineup.battingOrder.every((s) => bench.includes(s.playerId!)) ||
        !bench.includes(starter!))
    )
      issues.push({
        code: 'invalidOverride',
        clubId,
        squadId: squad.squadId,
        gameId: override.gameId,
        message: '試合別ベンチの人数・重複・外国人枠・先発選手を確認してください。',
      });
    if (fields.length) invalidatedOverrides.push({ gameId: override.gameId, fields });
  }
  if (issues.length) return { status: 'blocked', issues };
  return { status: 'ready', world: next, audit: { changedPlayerIds, invalidatedOverrides } };
}
