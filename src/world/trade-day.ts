import { ensure } from '../engine/validation.ts';
import { canonicalJson } from '../storage/codec.ts';
import { nextDate } from './engine.ts';
import { fnv1a32 } from './identity.ts';
import { gameContribution } from './stats.ts';
import { applyPitchLearningDay } from './pitch-learning.ts';
import { advanceConditionDay } from './condition.ts';
import { recoverPhysicalDay } from './physical.ts';
import { summarizeSeason } from './season.ts';
import { allWorldSquads } from './squads.ts';
import { tradeSquadRoster } from './trade-squad-roster.ts';
import { validateTradeMatchState } from './trade-match-state.ts';
import type { TradeApplicationWorld } from './trade-application-types.ts';

/** 自動入替を未対応のまま成功扱いにしない。待機中の再登録日は解除しない。 */
function requireResolvedAutoPreferences(world: TradeApplicationWorld, date: string): void {
  if (date > world.initialDefinitions.endDate) return;
  for (const preference of world.rosterControl.preferences) {
    if (preference.preference === 'auto') continue;
    const membership = world.registration.memberships.find(
      (r) =>
        r.playerId === preference.playerId && r.clubId === preference.clubId && r.until === null,
    );
    if (!membership) continue;
    const policy = world.rosterControl.policies[preference.clubId];
    ensure(policy, '現在球団の入替方針がありません');
    if (policy.changeMode !== 'auto') continue;
    const registration = world.registration.registrations.find(
      (r) =>
        r.playerId === preference.playerId && r.clubId === preference.clubId && r.until === null,
    );
    ensure(registration, '固定希望の現在登録がありません');
    const desired = preference.preference === 'firstFixed' ? 'first' : 'farm';
    if (registration.category === desired) continue;
    if (
      desired === 'first' &&
      registration.nextFirstEligibleOn !== null &&
      registration.nextFirstEligibleOn > date
    )
      continue;
    ensure(false, '翌日の自動入替に固定希望の再適用が必要です。候補世界の登録変更は未接続です');
  }
}

/**
 * 当日の全試合確定後だけ、既存v6の日次計算を一度適用する純粋処理。
 * 契約期限・新資格・故障・補強行事など未実装モデルを空値で処理済みにはしない。
 */
export function completeTradeWorldDay(
  world: TradeApplicationWorld,
  expectedDate: string,
): TradeApplicationWorld {
  const defs = world.initialDefinitions;
  const end = defs.farm && defs.farm.endDate > defs.endDate ? defs.farm.endDate : defs.endDate;
  ensure(
    world.version === 'trade-application-world-v1' &&
      world.currentDate === expectedDate &&
      world.dayPlan.date === expectedDate &&
      expectedDate >= defs.startDate &&
      expectedDate <= end,
    '対象日付が異なるか、候補の単年日程が終了しています',
  );
  ensure(!world.completedDates.includes(expectedDate), 'この日は処理済みです');
  const scheduled = defs.schedule
    .filter((g) => g.date === expectedDate)
    .sort((a, b) => (a.gameId < b.gameId ? -1 : a.gameId > b.gameId ? 1 : 0));
  ensure(
    canonicalJson(world.dayPlan.gameIds) === canonicalJson(scheduled.map((g) => g.gameId)) &&
      world.dayPlan.cursor === scheduled.length,
    '当日の全試合を正常終了させてください',
  );
  for (const row of scheduled) {
    const game = world.games[row.gameId],
      marker = world.statApplicationMarkers[row.gameId];
    ensure(
      game?.state.phase === 'gameComplete' &&
        game.result &&
        world.contributions[row.gameId] &&
        marker &&
        world.physical.appliedEvents[row.gameId] === game.events.length &&
        world.restControl.appliedEvents[row.gameId] === game.events.length &&
        world.registration.gameRosters[row.gameId] &&
        world.condition.samples[row.gameId],
      '未完了・中断・負荷未反映の試合があります',
    );
    const contribution = gameContribution(defs, row, game);
    ensure(
      canonicalJson(world.contributions[row.gameId]) === canonicalJson(contribution) &&
        marker.attemptNo === 1 &&
        marker.resultRevision === 1 &&
        marker.contributionHash ===
          'fnv1a32-' + fnv1a32(canonicalJson(contribution)).toString(16).padStart(8, '0'),
      '試合結果と集計寄与・適用済み情報が一致しません',
    );
  }
  for (const squad of allWorldSquads(defs))
    validateTradeMatchState(world, tradeSquadRoster(world, squad.squadId));
  const date = nextDate(expectedDate);
  requireResolvedAutoPreferences(world, date);
  // 別の可変な旧世界は作らず、純粋計算に必要な入力だけを渡す。
  const inputs = {
    version: world.version,
    definitions: defs,
    currentDate: world.currentDate,
    lastCompletedDate: world.lastCompletedDate,
    completedDates: world.completedDates,
    dayPlan: world.dayPlan,
    games: world.games,
    physical: world.physical,
    growth: world.growth,
    management: world.management,
    camp: world.camp,
  };
  const trained = applyPitchLearningDay(inputs);
  const active = new Set(
    trained.growth.state.days[expectedDate]!.outcomes.filter(
      (row) => row.effectiveIntensity !== 'rest',
    ).map((row) => row.playerId),
  );
  const next: TradeApplicationWorld = {
    ...world,
    ...trained,
    currentDate: date,
    rosterAsOf: { date, order: 0 },
    dayPlan: {
      date,
      gameIds: defs.schedule
        .filter((g) => g.date === date)
        .map((g) => g.gameId)
        .sort(),
      cursor: 0,
    },
    completedDates: [...world.completedDates, expectedDate],
    lastCompletedDate: expectedDate,
    condition: advanceConditionDay({ definitions: defs, condition: world.condition }, date),
    physical: recoverPhysicalDay({ ...inputs, ...trained }, date, active),
  };
  const summaryInput = { ...next, definitions: defs };
  if (next.farmSummary === null && date > defs.farm!.endDate)
    next.farmSummary = summarizeSeason(summaryInput, 'farmRegular');
  if (next.seasonSummary === null && date > defs.endDate)
    next.seasonSummary = summarizeSeason(summaryInput);
  return next;
}
