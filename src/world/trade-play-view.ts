import { ensure } from '../engine/validation.ts';
import { compareMoments } from '../finance/validation.ts';
import { growthBasis } from './growth-basis.ts';
import { gameDisplay } from './game-display.ts';
import { tradeApplicationRosterState } from './trade-application-state.ts';
import { MAX_GAME_COMMANDS_PER_SAVE } from './trade-game-commands.ts';
import type { TradeGameSession } from './trade-game-session.ts';
import type { TradeRosterReconciliation } from './trade-roster-policy.ts';
import type { FinanceMoment } from '../finance/types.ts';

export type TradeSessionRead = ReturnType<TradeGameSession['read']>;

/** 実際に評価した時点を示す。過去の保留理由を現在の判定結果として流用しない。 */
function lastReconciliation(read: TradeSessionRead, clubId: string) {
  const saved = read.snapshot;
  let latest: {
    stateRevision: number;
    at: FinanceMoment;
    report: TradeRosterReconciliation;
  } | null = null;
  for (const receipt of saved.rosterReceipts ?? [])
    if (receipt.reconciliation?.clubId === clubId)
      latest = {
        stateRevision: receipt.committedStateRevision,
        at: receipt.appliedAt,
        report: receipt.reconciliation,
      };
  for (const receipt of saved.dayReceipts ?? []) {
    if (
      receipt.modelVersion !== 'trade-day-commands-v2' ||
      (latest && receipt.committedStateRevision <= latest.stateRevision)
    )
      continue;
    const report = receipt.rosterResults.find((r) => r.clubId === clubId);
    if (report)
      latest = {
        stateRevision: receipt.committedStateRevision,
        at: { date: receipt.nextDate, order: 0 },
        report,
      };
  }
  return latest;
}

/**
 * 表示専用の射影。現在名簿は所属履歴から、試合表示は保存した試合時点から作る。
 * 初期球団別名簿・契約台帳・内部承認の詳細・指示指紋・完全RNGを画面へ送らない。
 */
export function tradePlayView(read: TradeSessionRead, viewFailed = false) {
  const saved = read.snapshot,
    world = saved.state,
    defs = world.initialDefinitions;
  const controlled = defs.squads.find((s) => s.squadId === world.management.controlledSquadId);
  ensure(controlled, '担当球団がありません');
  const clubId = controlled.team.clubId;
  const rosterState = tradeApplicationRosterState(world);
  const allPlayers = defs.squads.flatMap((s) => s.players);
  const currentMembers = world.registration.memberships.filter((m) => m.until === null);
  const players = currentMembers
    .filter((m) => m.clubId === clubId)
    .map((member) => {
      const base = allPlayers.find((p) => p.playerId === member.playerId);
      const row = world.registration.registrations.find(
        (r) => r.playerId === member.playerId && r.clubId === clubId && r.until === null,
      );
      const facts = world.playerFacts.find((p) => p.playerId === member.playerId);
      const growth = world.growth.state.players[member.playerId];
      const condition = world.condition.players[member.playerId];
      const physical = world.physical.players[member.playerId];
      ensure(
        base && row && facts && growth && condition && physical,
        '現在選手の表示元がありません',
      );
      return {
        playerId: member.playerId,
        name: base.familyName + ' ' + base.givenName,
        category: row.category,
        nextFirstEligibleOn: row.nextFirstEligibleOn,
        throwingHand: base.throwingHand,
        battingHand: base.battingHand,
        canBat: facts.canBat,
        canPitch: facts.canPitch,
        foreignBaseStatus: facts.foreignBaseStatus,
        pitches: defs.squads
          .flatMap((s) => s.pitches)
          .filter((p) => p.playerId === member.playerId)
          .map((p) => {
            const progress = world.growth.state.acquisition[p.pitchId];
            ensure(
              p.acquisitionProgressMilli === 100000 || progress,
              '現在の球種習得進度がありません',
            );
            return {
              pitchId: p.pitchId,
              pitchTypeCode: p.pitchTypeCode,
              // 球速は初期資料の値。成長・当日の身体補正を含む実投球値とは区別する。
              initialTypicalCentiKph: p.velocity.typicalCentiKph,
              acquisitionProgressMilli: progress?.progressMilli ?? p.acquisitionProgressMilli,
              acquiredOn: progress?.acquiredOn ?? null,
            };
          }),
        conditionMilli: condition.conditionMilli,
        energyMilli: physical.energyMilli,
        fatigueMilli: physical.fatigueMilli,
        abilities: growthBasis(defs, member.playerId).map((a) => {
          const valueMilli = growth.values[a.key];
          ensure(
            Number.isSafeInteger(valueMilli) && valueMilli! >= 0 && valueMilli! <= a.ceilingMilli,
            '現在能力の表示値が不正です',
          );
          return {
            key: a.key,
            abilityRef: a.abilityRef,
            label: a.label,
            valueMilli: valueMilli!,
            ceilingMilli: a.ceilingMilli,
          };
        }),
      };
    });
  const games = defs.schedule.map((row) => {
    const game = world.games[row.gameId];
    return {
      gameId: row.gameId,
      date: row.date,
      awaySquadId: row.awaySquadId,
      homeSquadId: row.homeSquadId,
      status: !game
        ? ('scheduled' as const)
        : game.state.phase === 'gameComplete'
          ? ('completed' as const)
          : game.state.phase === 'aborted'
            ? ('aborted' as const)
            : ('playing' as const),
      score: game ? game.state.score : null,
      totalPitches: game?.state.totalPitches ?? null,
      nextEventSeq: game?.state.nextEventSeq ?? null,
      result: game?.result ?? null,
      display: game ? gameDisplay(game) : null,
    };
  });
  const end = defs.farm && defs.farm.endDate > defs.endDate ? defs.farm.endDate : defs.endDate;
  const nextGameId = world.dayPlan.gameIds[world.dayPlan.cursor] ?? null;
  const nextGame = nextGameId ? world.games[nextGameId] : undefined;
  const phase =
    world.currentDate > end
      ? ('seasonComplete' as const)
      : world.dayPlan.cursor === world.dayPlan.gameIds.length
        ? ('dayComplete' as const)
        : nextGame?.state.phase === 'aborted'
          ? ('aborted' as const)
          : nextGame
            ? ('playing' as const)
            : ('beforeGame' as const);
  const stopped = read.reloadRequired || viewFailed;
  const available = !stopped && !read.saving;
  const canEditRoster =
    available &&
    read.pendingCommands === 0 &&
    world.currentDate <= defs.endDate &&
    world.dayPlan.cursor === 0 &&
    !defs.schedule.some((g) => g.date === world.currentDate && world.games[g.gameId]);
  // 承認の参照・時点だけを表示。予算や資格を含む全案の審査はCommandで行う。
  const approvedTransactions = world.tradeApprovals
    .filter((a) => a.approvedForClubId === clubId && a.appliedTransactionId === null)
    .map((a) => ({
      approvalId: a.approvalId,
      transactionId: a.request.transactionId,
      acceptedStateRevision: a.acceptedStateRevision,
      validThrough: a.validThrough,
      currentApproval:
        a.acceptedStateRevision === saved.stateRevision &&
        a.request.effectiveAt.date === world.currentDate &&
        compareMoments(a.request.effectiveAt, world.rosterAsOf) > 0 &&
        compareMoments(a.acceptedAt, a.request.effectiveAt) <= 0 &&
        compareMoments(a.request.effectiveAt, a.validThrough) <= 0,
    }));
  return structuredClone({
    kind: 'trade-play-view-v1' as const,
    localWorldId: saved.localWorldId,
    worldId: saved.worldId,
    stateRevision: saved.stateRevision,
    storageRevision: saved.storageRevision,
    currentDate: saved.currentDate,
    lastCompletedDate: world.lastCompletedDate,
    completedDates: world.completedDates,
    controlledClubId: clubId,
    controlledSquadId: controlled.squadId,
    phase,
    nextGameId,
    dayPlan: world.dayPlan,
    saveState: {
      pendingCommands: read.pendingCommands,
      saving: read.saving,
      reloadRequired: stopped,
    },
    capabilities: {
      canEditRoster,
      canChangeRegistrations:
        canEditRoster && world.rosterControl.policies[clubId]!.changeMode === 'manual',
      canBeginGame:
        available && phase === 'beforeGame' && read.pendingCommands < MAX_GAME_COMMANDS_PER_SAVE,
      canAdvanceGame:
        available &&
        !!nextGame &&
        ['readyForPitch', 'halfComplete'].includes(nextGame.state.phase) &&
        read.pendingCommands < MAX_GAME_COMMANDS_PER_SAVE,
      canCompleteDay: available && phase === 'dayComplete',
      canSaveManual: available && read.pendingCommands > 0,
      canCommitTrade: canEditRoster && approvedTransactions.some((a) => a.currentApproval),
      canSwitch: available && read.pendingCommands === 0,
    },
    approvedTransactions,
    clubs: defs.squads.map((s) => ({
      clubId: s.team.clubId,
      name: s.team.name,
      playerCount: currentMembers.filter((m) => m.clubId === s.team.clubId).length,
    })),
    squads: rosterState.squads.filter((s) => s.clubId === clubId),
    players,
    rosterPolicy: world.rosterControl.policies[clubId]!,
    preferences: world.rosterControl.preferences.filter((p) => p.clubId === clubId),
    lastReconciliation: lastReconciliation(read, clubId),
    games,
    stats: world.stats,
    seasonSummary: world.seasonSummary,
    farmSummary: world.farmSummary,
  });
}
export type TradePlayView = ReturnType<typeof tradePlayView>;
