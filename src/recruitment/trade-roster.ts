import {
  compareMoments,
  dateDays,
  financeId,
  requireFinance,
  uniqueFinanceIds,
  validateMoment,
} from '../finance/validation.ts';
import { planTradeMemberships } from './trade-memberships.ts';
import {
  checkTradeLineup,
  checkTradeSquad,
  checkTradeStartingBench,
  clearDepartedPlayers,
  squadEligibleIds,
} from './trade-roster-lineups.ts';
import {
  prepareTradeRegistrations,
  validateTradeRegistrations,
} from './trade-roster-registration.ts';
import type {
  TradeGameOverride,
  TradeRosterAudit,
  TradeRosterInput,
  TradeRosterIssue,
  TradeRosterResult,
} from './trade-roster-types.ts';

/** 登録・編成の案だけを検査する。実際の世界・保存・過去試合は変更しない。 */
export function planTradeRosters(input: TradeRosterInput): TradeRosterResult {
  const base = {
    modelVersion: 'trade-roster-plan-v1' as const,
    transactionId: input.transactionId,
  };
  financeId(input.transactionId);
  validateMoment(input.effectiveAt);
  requireFinance(
    input.dayPhase === 'beforeGames' || input.dayPhase === 'gamesStarted',
    '当日の試合進行状態を明示してください',
  );
  uniqueFinanceIds(input.clubIds, '取引の球団ID');
  uniqueFinanceIds(input.knownClubIds, '球団台帳のID');
  requireFinance(
    input.clubIds.length === 2 && input.clubIds.every((id) => input.knownClubIds.includes(id)),
    '取引する2球団の記録が必要です',
  );
  requireFinance(
    input.moves.length > 0 &&
      input.moves.every(
        (move) => input.clubIds.includes(move.fromClubId) && input.clubIds.includes(move.toClubId),
      ),
    '取引外の選手移動が含まれています',
  );
  const rules = input.rules;
  requireFinance(rules.version === 'registration-rules-v1', '未対応の登録規則です');
  for (const value of [
    rules.clubLimit,
    rules.firstLimit,
    rules.benchLimit,
    rules.foreignFirstLimit,
    rules.foreignBenchLimit,
    rules.reentryDays,
  ])
    requireFinance(
      Number.isSafeInteger(value) && value >= 0,
      '登録上限・再登録待ち日数は非負整数が必要です',
    );
  requireFinance(
    rules.clubLimit <= 70 &&
      rules.clubLimit >= rules.firstLimit &&
      rules.firstLimit >= rules.benchLimit &&
      rules.benchLimit >= 10 &&
      rules.foreignFirstLimit <= rules.firstLimit &&
      rules.foreignBenchLimit <= Math.min(rules.foreignFirstLimit, rules.benchLimit) &&
      rules.reentryDays >= 1 &&
      rules.reentryDays <= 365,
    '登録上限・再登録待ち日数の範囲が不正です',
  );
  uniqueFinanceIds(
    input.players.map((player) => player.playerId),
    '選手の役割・資格ID',
  );
  for (const player of input.players)
    requireFinance(
      typeof player.canBat === 'boolean' &&
        typeof player.canPitch === 'boolean' &&
        ['subject', 'exempt'].includes(player.foreignBaseStatus),
      '選手の役割・外国人資格を明示してください',
    );
  uniqueFinanceIds(
    input.state.squads.map((squad) => squad.squadId),
    '編成のチームID',
  );
  uniqueFinanceIds(
    input.state.squads.map((squad) => JSON.stringify([squad.clubId, squad.category])),
    '球団と登録区分のチーム',
  );
  uniqueFinanceIds(
    input.squadReplacements.map((squad) => squad.squadId),
    '補充する編成のチームID',
  );
  for (const squad of input.state.squads)
    requireFinance(
      input.knownClubIds.includes(squad.clubId) && ['first', 'farm'].includes(squad.category),
      'チームの球団・登録区分が不正です',
    );
  for (const replacement of input.squadReplacements) {
    const original = input.state.squads.find((squad) => squad.squadId === replacement.squadId);
    requireFinance(
      original &&
        input.clubIds.includes(original.clubId) &&
        original.clubId === replacement.clubId &&
        original.category === replacement.category &&
        original.benchLimit === replacement.benchLimit,
      '補充する編成の球団・チーム・区分・ベンチ上限は変更できません',
    );
  }
  uniqueFinanceIds(
    input.state.overrides.map((entry) => JSON.stringify([entry.gameId, entry.squadId])),
    '試合別指定',
  );
  for (const entry of input.state.overrides) {
    financeId(entry.gameId);
    dateDays(entry.date);
    requireFinance(
      ['scheduled', 'started', 'completed'].includes(entry.status) &&
        input.state.squads.some((squad) => squad.squadId === entry.squadId),
      '試合別指定の状態・チームが不正です',
    );
  }
  // 現行worldの編集制約と同様、当日の試合開始後には成立案を作らない。
  if (
    input.dayPhase === 'gamesStarted' ||
    input.state.overrides.some(
      (entry) => entry.date === input.effectiveAt.date && entry.status !== 'scheduled',
    )
  )
    return {
      ...base,
      status: 'blocked',
      issues: [
        { code: 'gameDayStarted', message: '当日の試合開始後はトレードの成立案を作成できません。' },
      ],
    };

  const membershipPlan = planTradeMemberships({
    transactionId: input.transactionId,
    effectiveAt: input.effectiveAt,
    clubIds: input.knownClubIds,
    memberships: input.state.memberships,
    moves: [...input.moves],
  });
  const registrationPlan = prepareTradeRegistrations(input);
  if (registrationPlan.issues.length)
    return { ...base, status: 'blocked', issues: registrationPlan.issues };
  validateTradeRegistrations(registrationPlan.rows, membershipPlan.memberships);
  for (const row of registrationPlan.rows.filter(
    (row) => row.until === null && input.clubIds.includes(row.clubId),
  ))
    requireFinance(
      compareMoments(row.from, input.effectiveAt) <= 0,
      '取引時点より未来の登録を使用できません',
    );
  const issues: TradeRosterIssue[] = [];
  for (const clubId of input.clubIds) {
    const members = membershipPlan.memberships.filter(
      (row) => row.clubId === clubId && row.until === null,
    );
    if (members.length > rules.clubLimit)
      issues.push({
        code: 'rosterLimit',
        clubId,
        message: `成立後の所属人数が上限${rules.clubLimit}人を超えています。`,
      });
    for (const member of members)
      if (!input.players.some((p) => p.playerId === member.playerId))
        issues.push({
          code: 'missingPlayerData',
          clubId,
          playerId: member.playerId,
          message: '選手の役割・外国人資格が未記録です。',
        });
    const first = registrationPlan.rows.filter(
      (row) => row.clubId === clubId && row.until === null && row.category === 'first',
    );
    if (first.length > rules.firstLimit)
      issues.push({
        code: 'rosterLimit',
        clubId,
        message: `成立後の一軍登録が上限${rules.firstLimit}人を超えています。`,
      });
    const foreigners = first.filter(
      (row) =>
        input.players.find((p) => p.playerId === row.playerId)?.foreignBaseStatus === 'subject',
    ).length;
    if (foreigners > rules.foreignFirstLimit)
      issues.push({
        code: 'rosterLimit',
        clubId,
        message: `成立後の外国人一軍登録が上限${rules.foreignFirstLimit}人を超えています。`,
      });
    for (const category of ['first', 'farm'] as const)
      if (
        (category === 'first' ||
          registrationPlan.rows.some(
            (row) => row.clubId === clubId && row.until === null && row.category === category,
          )) &&
        !input.state.squads.some((squad) => squad.clubId === clubId && squad.category === category)
      )
        issues.push({
          code: 'missingSquad',
          clubId,
          message: `${category === 'first' ? '一軍' : '二軍'}の編成情報がありません。`,
        });
  }
  if (issues.length) return { ...base, status: 'blocked', issues };

  const squads = input.state.squads.map((squad) => {
    if (!input.clubIds.includes(squad.clubId)) return squad;
    requireFinance(
      Number.isSafeInteger(squad.benchLimit) &&
        squad.benchLimit >= 10 &&
        squad.benchLimit <= rules.clubLimit,
      '保存内のベンチ上限が登録規則の範囲外です',
    );
    if (squad.category === 'first')
      requireFinance(
        squad.benchLimit === rules.benchLimit,
        '一軍のベンチ上限と登録規則が一致しません',
      );
    const replacement = input.squadReplacements.find((entry) => entry.squadId === squad.squadId);
    const departed = new Set(
      input.moves.filter((move) => move.fromClubId === squad.clubId).map((move) => move.playerId),
    );
    const planned = replacement ?? clearDepartedPlayers(squad, departed);
    issues.push(...checkTradeSquad(planned, registrationPlan.rows, input));
    return planned;
  });
  uniqueFinanceIds(
    input.state.preferences.map((row) => JSON.stringify([row.clubId, row.playerId])),
    '球団別固定希望',
  );
  for (const preference of input.state.preferences) {
    financeId(preference.playerId);
    validateMoment(preference.updatedAt);
    requireFinance(
      input.knownClubIds.includes(preference.clubId) &&
        ['firstFixed', 'farmFixed', 'auto'].includes(preference.preference),
      '保存内の固定希望が不正です',
    );
  }
  const removedPreferences = input.state.preferences.filter((preference) =>
    input.moves.some(
      (move) => move.playerId === preference.playerId && move.fromClubId === preference.clubId,
    ),
  );
  let preferences = input.state.preferences.filter(
    (preference) => !removedPreferences.includes(preference),
  );
  for (const choice of input.choices)
    if (choice.preference !== undefined) {
      preferences = preferences.filter(
        (row) => !(row.clubId === choice.clubId && row.playerId === choice.playerId),
      );
      preferences.push({
        clubId: choice.clubId,
        playerId: choice.playerId,
        preference: choice.preference,
        updatedAt: { ...input.effectiveAt },
      });
    }

  const invalidatedOverrides: TradeRosterAudit['invalidatedOverrides'] = [];
  const overrides: TradeGameOverride[] = input.state.overrides.map((entry) => {
    const squad = squads.find((row) => row.squadId === entry.squadId)!;
    if (
      !input.clubIds.includes(squad.clubId) ||
      entry.status !== 'scheduled' ||
      entry.date < input.effectiveAt.date
    )
      return entry;
    const eligible = squadEligibleIds(squad, registrationPlan.rows);
    const fields: TradeRosterAudit['invalidatedOverrides'][number]['fields'] = [];
    const next = { ...entry };
    if (
      next.lineup &&
      [...next.lineup.battingOrder, ...next.lineup.defense].some(
        (slot) => slot.playerId !== null && !eligible.has(slot.playerId),
      )
    ) {
      next.lineup = null;
      fields.push('lineup');
    }
    if (
      next.starterId !== null &&
      (!eligible.has(next.starterId) ||
        !input.players.some((p) => p.playerId === next.starterId && p.canPitch))
    ) {
      next.starterId = null;
      fields.push('starterId');
    }
    if (next.benchIds !== null && next.benchIds.some((id) => !eligible.has(id))) {
      next.benchIds = null;
      fields.push('benchIds');
    }
    if (fields.length)
      invalidatedOverrides.push({ gameId: entry.gameId, squadId: entry.squadId, fields });
    if (next.lineup)
      issues.push(
        ...checkTradeLineup(squad, next.lineup, eligible, input).map((issue) => ({
          ...issue,
          gameId: entry.gameId,
        })),
      );
    const starterId =
      next.starterId ??
      squad.pitchers.rotationSlots.find((slot) => slot.slotNo === squad.pitchers.nextSlotNo)
        ?.playerId ??
      null;
    issues.push(
      ...checkTradeStartingBench(squad, next.lineup ?? squad.lineup, starterId, input).map(
        (issue) => ({ ...issue, gameId: entry.gameId }),
      ),
    );
    if (next.benchIds !== null) {
      const required = [
        ...(next.lineup ?? squad.lineup).battingOrder.flatMap((slot) =>
          slot.playerId === null ? [] : [slot.playerId],
        ),
        next.starterId ??
          squad.pitchers.rotationSlots.find((slot) => slot.slotNo === squad.pitchers.nextSlotNo)
            ?.playerId,
      ].filter((id): id is string => typeof id === 'string');
      const foreignCount = next.benchIds.filter(
        (id) => input.players.find((p) => p.playerId === id)?.foreignBaseStatus === 'subject',
      ).length;
      if (
        new Set(next.benchIds).size !== next.benchIds.length ||
        next.benchIds.length > squad.benchLimit ||
        required.some((id) => !next.benchIds!.includes(id)) ||
        (squad.category === 'first' && foreignCount > rules.foreignBenchLimit)
      )
        issues.push({
          code: 'invalidOverride',
          squadId: squad.squadId,
          clubId: squad.clubId,
          message: '試合別ベンチの人数・重複・先発選手・外国人枠を確認してください。',
        });
    }
    return fields.length ? next : entry;
  });
  if (issues.length) return { ...base, status: 'blocked', issues };
  return {
    ...base,
    status: 'ready',
    changes: {
      memberships: membershipPlan.memberships,
      registrations: registrationPlan.rows,
      preferences,
      squads,
      overrides,
    },
    playerMoves: membershipPlan.playerMoves,
    audit: { removedPreferences, invalidatedOverrides },
  };
}
