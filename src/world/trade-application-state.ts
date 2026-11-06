import { validateApplicationSalaries } from './trade-application-finance.ts';
import { canonicalJson } from '../storage/codec.ts';
import {
  compareMoments,
  requireFinance,
  uniqueFinanceIds,
  validateMoment,
} from '../finance/validation.ts';
import { allWorldSquads, isFarmSquad } from './squads.ts';
import type { TradeRosterState } from '../recruitment/trade-roster-types.ts';
import type {
  TradeApplicationWorld,
  TradeSourceWorld,
  TradeApplicationFinance,
  TradeApplicationApproval,
} from './trade-application-types.ts';
import type { TradeRosterPlayer } from '../recruitment/trade-roster-types.ts';
import type { FinanceMoment } from '../finance/types.ts';

/** 明示データを受けて候補を作る。通常の新規プレイや旧セーブの自動移行ではない。 */
export function createTradeApplicationWorld(
  source: TradeSourceWorld,
  data: {
    asOf: FinanceMoment;
    playerFacts: TradeRosterPlayer[];
    finance: TradeApplicationFinance;
    approvals: TradeApplicationApproval[];
  },
): TradeApplicationWorld {
  requireFinance(source.version === 'world-prototype-v21', '対応する元世界の版が必要です');
  validateMoment(data.asOf);
  requireFinance(data.asOf.date === source.currentDate, '所属の基準日が元世界と異なります');
  const players = source.definitions.squads.flatMap((s) => s.players);
  uniqueFinanceIds(
    players.map((p) => p.playerId),
    '初期資料の選手ID',
  );
  uniqueFinanceIds(
    data.playerFacts.map((p) => p.playerId),
    '選手資格のID',
  );
  requireFinance(
    data.playerFacts.length === players.length &&
      data.playerFacts.every(
        (fact) =>
          players.some((p) => p.playerId === fact.playerId) &&
          typeof fact.canBat === 'boolean' &&
          typeof fact.canPitch === 'boolean' &&
          ['subject', 'exempt'].includes(fact.foreignBaseStatus),
      ),
    '全選手の投打の役割・外国人資格を明示してください',
  );
  const clubIds = source.definitions.squads.map((s) => s.team.clubId);
  uniqueFinanceIds(clubIds, '球団ID');
  uniqueFinanceIds(
    data.finance.budgets.map((b) => b.clubId),
    '予算の球団ID',
  );
  requireFinance(
    data.finance.budgets.length === clubIds.length &&
      data.finance.budgets.every(
        (b) => clubIds.includes(b.clubId) && b.seasonId === source.definitions.seasonId,
      ),
    '全球団の予算記録が必要です',
  );
  requireFinance(
    data.finance.salaryModelVersion === 'salary-day-proration-v1',
    '未対応の給与負担版です',
  );
  for (const player of players) {
    const memberships = source.registration.memberships.filter(
      (m) => m.playerId === player.playerId && m.until === null,
    );
    const registrations = source.registration.registrations.filter(
      (r) => r.playerId === player.playerId && r.until === null,
    );
    requireFinance(
      memberships.length === 1 &&
        registrations.length === 1 &&
        memberships[0]!.clubId === registrations[0]!.clubId &&
        compareMoments(memberships[0]!.from, data.asOf) <= 0 &&
        compareMoments(registrations[0]!.from, data.asOf) <= 0,
      '現在の所属・登録と基準時点が整合しません',
    );
  }
  uniqueFinanceIds(
    data.approvals.map((a) => a.approvalId),
    '内部適用承認ID',
  );
  uniqueFinanceIds(
    data.approvals.map((a) => a.request.transactionId),
    '承認済み取引ID',
  );
  requireFinance(
    data.approvals.every((a) => a.appliedTransactionId === null),
    '旧世界に適用済み承認は渡せません',
  );
  validateApplicationSalaries(
    data.finance,
    players.map((p) => p.playerId),
    source.definitions.seasonId,
    source.currentDate,
  );
  const { version: _version, definitions, ...state } = source;
  return structuredClone({
    ...state,
    version: 'trade-application-world-v1',
    initialDefinitions: definitions,
    rosterAsOf: data.asOf,
    playerFacts: data.playerFacts,
    finance: data.finance,
    transactions: [],
    tradeApprovals: data.approvals,
  });
}

/** 各設定の実際の保存形から、既存の全案検査に渡す射影を作る。 */
export function tradeApplicationRosterState(world: TradeApplicationWorld): TradeRosterState {
  const definitions = world.initialDefinitions;
  const allSquads = allWorldSquads(definitions);
  const controlled = definitions.squads.find(
    (s) => s.squadId === world.management.controlledSquadId,
  );
  requireFinance(controlled, '担当球団の記録がありません');
  const rules = definitions.registrationRules;
  requireFinance(rules, '登録規則の記録がありません');
  const squads = allSquads.map((s) => {
    const farm = isFarmSquad(definitions, s.squadId);
    const lineup = world.management.idealLineups[s.squadId];
    const pitchers = world.management.pitcherUsagePlans[s.squadId];
    const individualRest = world.restControl.pitcherUsagePlans[s.squadId];
    const relief = world.reliefControl.teamPolicies[s.squadId];
    requireFinance(
      lineup && pitchers && individualRest && relief,
      '現在の編成・個別設定が欠けています',
    );
    return {
      squadId: s.squadId,
      clubId: s.team.clubId,
      category: farm ? ('farm' as const) : ('first' as const),
      benchLimit: farm ? definitions.farm!.benchLimit : rules.benchLimit,
      lineup,
      pitchers,
      individualRest: individualRest.individualRest,
      conditionalRelief: relief.reliefRoles,
    };
  });
  const overrideIds = new Set([
    ...Object.keys(world.gameLineups),
    ...Object.keys(world.management.starterOverrides),
    ...Object.keys(world.registration.benchOverrides),
  ]);
  const overrides = [...overrideIds].map((gameId) => {
    const game = definitions.schedule.find((g) => g.gameId === gameId);
    requireFinance(game, '試合別指定の日程がありません');
    const squad = allSquads.find(
      (s) =>
        s.team.clubId === controlled.team.clubId &&
        (s.squadId === game.awaySquadId || s.squadId === game.homeSquadId),
    );
    requireFinance(squad, '担当球団以外の試合別指定は対応していません');
    const played = world.games[gameId];
    return {
      gameId,
      squadId: squad.squadId,
      date: game.date,
      status: played
        ? played.state.phase === 'gameComplete'
          ? ('completed' as const)
          : ('started' as const)
        : ('scheduled' as const),
      lineup: world.gameLineups[gameId] ?? null,
      starterId: world.management.starterOverrides[gameId] ?? null,
      benchIds: world.registration.benchOverrides[gameId] ?? null,
    };
  });
  return structuredClone({
    memberships: world.registration.memberships,
    registrations: world.registration.registrations,
    preferences: world.rosterControl.preferences,
    squads,
    overrides,
  });
}

export function sameTradeValue(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

/** 欠けた版を0にせず、実際に更新する設定だけを一度進める。 */
export function nextTradePolicyRevision(value: number): number {
  requireFinance(
    Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER,
    '方針版を増やせる範囲を超えます',
  );
  return value + 1;
}
