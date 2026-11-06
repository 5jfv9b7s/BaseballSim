import { tradeSquadRoster } from './trade-squad-roster.ts';
import { validateApplicationSalaries } from './trade-application-finance.ts';
import { compareMoments, requireFinance, validateMoment } from '../finance/validation.ts';
import { planTradeChangeSet, type TradeChangeSetInput } from '../recruitment/trade-change-set.ts';
import {
  nextTradePolicyRevision,
  sameTradeValue,
  tradeApplicationRosterState,
} from './trade-application-state.ts';
import type {
  TradeApplicationWorld,
  WorldTradeRequest,
  TradeApplicationResult,
} from './trade-application-types.ts';

/** 現在世界から審査入力を構成する。UIに台帳・資格・現在の所属を申告させない。 */
export function tradeApplicationInput(
  world: TradeApplicationWorld,
  request: WorldTradeRequest,
): TradeChangeSetInput {
  requireFinance(world.version === 'trade-application-world-v1', '未対応の移籍適用候補です');
  validateMoment(request.effectiveAt);
  requireFinance(
    request.effectiveAt.date === world.currentDate &&
      compareMoments(request.effectiveAt, world.rosterAsOf) > 0,
    '取引の時点は現行日付の所属基準より後が必要です',
  );
  requireFinance(
    world.currentDate <= world.initialDefinitions.endDate &&
      world.dayPlan.date === world.currentDate,
    '取引を適用する日付・日程状態が不正です',
  );
  requireFinance(
    !world.transactions.some((t) => t.transactionId === request.transactionId),
    '同じ取引は適用済みです',
  );
  validateApplicationSalaries(
    world.finance,
    world.playerFacts.map((p) => p.playerId),
    world.initialDefinitions.seasonId,
    world.currentDate,
  );
  const budgets = request.clubIds.map((clubId) =>
    world.finance.budgets.find((b) => b.clubId === clubId),
  );
  requireFinance(
    budgets.length === 2 && budgets.every(Boolean),
    '取引する両球団の予算記録が必要です',
  );
  const todayIds = new Set([
    ...world.dayPlan.gameIds,
    ...world.initialDefinitions.schedule
      .filter((g) => g.date === world.currentDate)
      .map((g) => g.gameId),
  ]);
  const gamesStarted = world.dayPlan.cursor > 0 || [...todayIds].some((id) => world.games[id]);
  const rules = world.initialDefinitions.registrationRules;
  requireFinance(rules, '登録規則の記録がありません');
  return structuredClone({
    finance: {
      transactionId: request.transactionId,
      effectiveAt: request.effectiveAt,
      clubIds: request.clubIds,
      moves: request.moves,
      cashTransfer: request.cashTransfer,
      seasonId: world.initialDefinitions.seasonId,
      contractYears: world.finance.contractYears.filter((r) =>
        request.moves.some((m) => m.playerId === r.playerId),
      ),
      ledger: world.finance.ledger,
      budgets: [budgets[0]!, budgets[1]!],
      salaryModelVersion: world.finance.salaryModelVersion,
    },
    roster: {
      dayPhase: gamesStarted ? 'gamesStarted' : 'beforeGames',
      knownClubIds: world.initialDefinitions.squads.map((s) => s.team.clubId),
      players: world.playerFacts,
      rules,
      state: tradeApplicationRosterState(world),
      choices: request.choices,
      squadReplacements: request.squadReplacements,
    },
  });
}

/**
 * 全審査が通った場合だけ、実際の保存形に反映した分離候補を返す。
 * 交渉承認・Worker正本の置換・保存・コマンドreceiptの追加はここでは行わない。
 */
export function applyWorldTrade(
  world: TradeApplicationWorld,
  request: WorldTradeRequest,
): TradeApplicationResult {
  const input = tradeApplicationInput(world, request);
  const plan = planTradeChangeSet(input);
  if (plan.status === 'blocked') return { status: 'blocked', details: plan };
  const next = structuredClone(world);
  next.registration.memberships = structuredClone(plan.roster.changes.memberships);
  next.registration.registrations = structuredClone(plan.roster.changes.registrations);
  next.rosterControl.preferences = structuredClone(plan.roster.changes.preferences);
  next.finance.ledger = structuredClone(plan.finance.ledger);
  next.rosterAsOf = { ...request.effectiveAt };

  for (const squad of plan.roster.changes.squads) {
    if (!request.clubIds.includes(squad.clubId)) continue;
    // 予備選手の所属変更だけでも、関係する一二軍の編成キャッシュを失効させる。
    next.management.idealLineups[squad.squadId] = structuredClone(squad.lineup);
    next.management.pitcherUsagePlans[squad.squadId] = structuredClone(squad.pitchers);
    next.management.policyRevisions[squad.squadId] = nextTradePolicyRevision(
      world.management.policyRevisions[squad.squadId]!,
    );
    const rest = next.restControl.pitcherUsagePlans[squad.squadId]!;
    const restPolicy = next.restControl.teamPolicies[squad.squadId];
    requireFinance(rest && restPolicy, '個別休養・球団休養方針の記録がありません');
    if (!sameTradeValue(rest.individualRest, squad.individualRest)) {
      rest.individualRest = structuredClone(squad.individualRest);
      restPolicy.policyRevision = nextTradePolicyRevision(restPolicy.policyRevision);
    }
    const relief = next.reliefControl.teamPolicies[squad.squadId];
    requireFinance(relief, '条件別救援の記録がありません');
    if (!sameTradeValue(relief.reliefRoles, squad.conditionalRelief)) {
      relief.reliefRoles = structuredClone(squad.conditionalRelief);
      relief.policyRevision = nextTradePolicyRevision(relief.policyRevision);
    }
  }
  for (const clubId of request.clubIds) {
    const policy = next.rosterControl.policies[clubId];
    requireFinance(policy?.clubId === clubId, '入替方針の記録がありません');
    policy.policyRevision = nextTradePolicyRevision(policy.policyRevision);
  }
  // 審査が解除した項目だけを削除する。過去試合・開始済み指定は触れない。
  for (const change of plan.roster.audit.invalidatedOverrides) {
    if (change.fields.includes('lineup')) delete next.gameLineups[change.gameId];
    if (change.fields.includes('starterId')) delete next.management.starterOverrides[change.gameId];
    if (change.fields.includes('benchIds')) delete next.registration.benchOverrides[change.gameId];
  }
  // 適用記録には会計・名簿の根拠と解除監査を残す。commandの再送記録は上位で同時保存。
  next.transactions.push(
    structuredClone({
      appliedAt: request.effectiveAt,
      transactionId: plan.transactionId,
      models: {
        application: 'trade-application-world-v1',
        roster: plan.roster.modelVersion,
        finance: plan.finance.modelVersion,
      },
      playerMoves: plan.roster.playerMoves,
      rosterAudit: plan.roster.audit,
      salaryReallocations: plan.finance.salaryReallocations,
      cashObligationId: plan.finance.cashObligationId,
    }),
  );
  // 保存へ進む前に、反映後の所属から関係する一二軍の候補名簿を引き直す。
  for (const squad of plan.roster.changes.squads)
    if (request.clubIds.includes(squad.clubId)) tradeSquadRoster(next, squad.squadId);
  return { status: 'ready', world: next, transactionId: plan.transactionId };
}
