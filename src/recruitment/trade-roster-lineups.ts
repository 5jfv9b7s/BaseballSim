import { validateReliefRules } from '../game/relief.ts';
import { validateRestRules } from '../world/rest.ts';
import { requireFinance, uniqueFinanceIds } from '../finance/validation.ts';
import type { PlayerRegistration } from '../world/registration-types.ts';
import type {
  TradeLineup,
  TradeRosterInput,
  TradeRosterIssue,
  TradeSquadPlan,
} from './trade-roster-types.ts';

const BATTING_ROLES = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

/** 放出選手の席はnullへ。枠順・次の先発枠・残った選手の順序を勝手に変えない。 */
export function clearDepartedPlayers(
  squad: TradeSquadPlan,
  departed: ReadonlySet<string>,
): TradeSquadPlan {
  return {
    ...squad,
    lineup: {
      ...squad.lineup,
      battingOrder: squad.lineup.battingOrder.map((slot) =>
        departed.has(slot.playerId ?? '') ? { ...slot, playerId: null } : slot,
      ),
      defense: squad.lineup.defense.map((slot) =>
        departed.has(slot.playerId ?? '') ? { ...slot, playerId: null } : slot,
      ),
    },
    pitchers: {
      ...squad.pitchers,
      rotationSlots: squad.pitchers.rotationSlots.map((slot) =>
        departed.has(slot.playerId ?? '') ? { ...slot, playerId: null } : slot,
      ),
      reliefRoles: squad.pitchers.reliefRoles.filter((slot) => !departed.has(slot.playerId)),
    },
    individualRest: squad.individualRest.filter((row) => !departed.has(row.playerId)),
    conditionalRelief: squad.conditionalRelief.filter((row) => !departed.has(row.playerId)),
  };
}

export function squadEligibleIds(
  squad: TradeSquadPlan,
  rows: readonly PlayerRegistration[],
): Set<string> {
  return new Set(
    rows
      .filter(
        (row) =>
          row.until === null && row.clubId === squad.clubId && row.category === squad.category,
      )
      .map((row) => row.playerId),
  );
}

export function checkTradeLineup(
  squad: TradeSquadPlan,
  lineup: TradeLineup,
  eligible: ReadonlySet<string>,
  input: Pick<TradeRosterInput, 'players' | 'rules'>,
): TradeRosterIssue[] {
  const issues: TradeRosterIssue[] = [];
  const context = { clubId: squad.clubId, squadId: squad.squadId };
  const invalid = (message: string) => issues.push({ code: 'invalidLineup', ...context, message });
  if (
    lineup.dhEnabled !== true ||
    lineup.battingOrder.length !== 9 ||
    lineup.defense.length !== 9
  ) {
    invalid('今回の試作ではDH制の9打順・9守備枠が必要です。');
    return issues;
  }
  const roles = lineup.battingOrder.map((row) => row.battingRole);
  if (
    new Set(roles).size !== 9 ||
    !BATTING_ROLES.every((role) => roles.includes(role as never)) ||
    !lineup.battingOrder.every((row, index) => row.slotNo === index + 1)
  )
    invalid('打順番号・打撃役割を重複なく指定してください。');
  const playerIds = lineup.battingOrder.flatMap((slot) =>
    slot.playerId === null ? [] : [slot.playerId],
  );
  if (new Set(playerIds).size !== playerIds.length) invalid('同じ選手が複数の打順に入っています。');
  for (const slot of lineup.battingOrder) {
    if (slot.playerId === null)
      issues.push({
        code: 'lineupVacancy',
        ...context,
        slotNo: slot.slotNo,
        message: `${slot.slotNo}番の欠員を補充してください。`,
      });
    else if (
      !eligible.has(slot.playerId) ||
      !input.players.find((p) => p.playerId === slot.playerId)?.canBat
    )
      issues.push({
        code: 'playerNotEligible',
        ...context,
        playerId: slot.playerId,
        slotNo: slot.slotNo,
        message: '打順の選手が現在の所属・登録区分・打撃役割を満たしていません。',
      });
  }
  const positions = lineup.defense.map((slot) => slot.positionCode);
  if (
    new Set(positions).size !== 9 ||
    !['P', ...BATTING_ROLES.filter((role) => role !== 'DH')].every((position) =>
      positions.includes(position as never),
    )
  )
    invalid('守備配置の位置が重複、または不足しています。');
  for (const slot of lineup.defense) {
    if (slot.positionCode === 'P') {
      if (slot.playerId !== null) invalid('投手の守備位置は先発指定から確定します。');
    } else if (slot.playerId === null)
      issues.push({
        code: 'lineupVacancy',
        ...context,
        message: `${slot.positionCode}の守備に欠員があります。`,
      });
    else if (
      !lineup.battingOrder.some(
        (batter) => batter.playerId === slot.playerId && batter.battingRole === slot.positionCode,
      )
    )
      invalid('打順と守備配置の選手が一致しません。');
  }
  return issues;
}

/** ベンチの個別指定がなくても、先発必須選手だけで上限を超えないことを検査する。 */
export function checkTradeStartingBench(
  squad: TradeSquadPlan,
  lineup: TradeLineup,
  starterId: string | null,
  input: Pick<TradeRosterInput, 'players' | 'rules'>,
): TradeRosterIssue[] {
  const mandatory = new Set([
    ...lineup.battingOrder.flatMap((slot) => (slot.playerId === null ? [] : [slot.playerId])),
    ...(starterId ? [starterId] : []),
  ]);
  const foreignCount = [...mandatory].filter(
    (id) => input.players.find((p) => p.playerId === id)?.foreignBaseStatus === 'subject',
  ).length;
  return mandatory.size > squad.benchLimit ||
    (squad.category === 'first' && foreignCount > input.rules.foreignBenchLimit)
    ? [
        {
          code: 'rosterLimit',
          clubId: squad.clubId,
          squadId: squad.squadId,
          message: '先発打順と先発投手を含むベンチが人数・外国人枠を満たせません。',
        },
      ]
    : [];
}

export function checkTradeSquad(
  squad: TradeSquadPlan,
  rows: readonly PlayerRegistration[],
  input: Pick<TradeRosterInput, 'players' | 'rules'>,
): TradeRosterIssue[] {
  const eligible = squadEligibleIds(squad, rows);
  const issues = checkTradeLineup(squad, squad.lineup, eligible, input);
  const context = { clubId: squad.clubId, squadId: squad.squadId };
  const pitchers = squad.pitchers;
  if (
    pitchers.rotationSlots.length === 0 ||
    pitchers.rotationSlots.some((slot) => slot.playerId === null)
  )
    issues.push({
      code: 'rotationVacancy',
      ...context,
      message: '先発ローテーションの欠員を補充してください。',
    });
  if (
    pitchers.rotationSlots.length > 6 ||
    !pitchers.rotationSlots.every((slot, index) => slot.slotNo === index + 1) ||
    (pitchers.rotationSlots.length > 0 &&
      (!Number.isSafeInteger(pitchers.nextSlotNo) ||
        pitchers.nextSlotNo! < 1 ||
        pitchers.nextSlotNo! > pitchers.rotationSlots.length)) ||
    (pitchers.rotationSlots.length === 0 && pitchers.nextSlotNo !== null)
  )
    issues.push({
      code: 'invalidPitcherPlan',
      ...context,
      message: 'ローテーションは最大6枠・連続した枠番号と、有効な次先発枠で指定してください。',
    });
  const assigned = [
    ...pitchers.rotationSlots.flatMap((slot) => (slot.playerId === null ? [] : [slot.playerId])),
    ...pitchers.reliefRoles.map((row) => row.playerId),
  ];
  if (
    new Set(assigned).size !== assigned.length ||
    pitchers.reliefRoles.some(
      (row) => row.role !== 'relief' || !Number.isSafeInteger(row.priority) || row.priority < 1,
    )
  )
    issues.push({
      code: 'invalidPitcherPlan',
      ...context,
      message: '先発・救援の選手が重複、または救援の優先順が不正です。',
    });
  const plannedStarter = pitchers.rotationSlots.find(
    (slot) => slot.slotNo === pitchers.nextSlotNo,
  )?.playerId;
  issues.push(...checkTradeStartingBench(squad, squad.lineup, plannedStarter ?? null, input));
  const eligiblePitcher = (playerId: string) =>
    eligible.has(playerId) && input.players.some((p) => p.playerId === playerId && p.canPitch);
  for (const playerId of assigned)
    if (!eligiblePitcher(playerId))
      issues.push({
        code: 'playerNotEligible',
        ...context,
        playerId,
        message: '投手運用に現在の所属・登録区分を満たさない選手がいます。',
      });
  for (const playerId of eligible)
    if (eligiblePitcher(playerId) && !assigned.includes(playerId))
      issues.push({
        code: 'invalidPitcherPlan',
        ...context,
        playerId,
        message: '登録された投手を先発または救援に割り当ててください。',
      });
  uniqueFinanceIds(
    squad.individualRest.map((row) => row.playerId),
    '個別休養の選手ID',
  );
  for (const row of squad.individualRest) {
    requireFinance(row.mode === 'inherit' || row.mode === 'custom', '個別休養の継承設定が不正です');
    if (row.mode === 'custom') validateRestRules(row.rules);
    else requireFinance(!('rules' in row), '継承する個別休養には条件を追加しません');
  }
  validateReliefRules(
    squad.conditionalRelief.filter((row) => eligiblePitcher(row.playerId)),
    [...eligible].filter(eligiblePitcher),
  );
  for (const row of squad.individualRest)
    if (!eligiblePitcher(row.playerId))
      issues.push({
        code: 'playerNotEligible',
        ...context,
        playerId: row.playerId,
        message: '個別休養に現在の登録対象外の投手がいます。',
      });
  for (const row of squad.conditionalRelief)
    if (!eligiblePitcher(row.playerId))
      issues.push({
        code: 'playerNotEligible',
        ...context,
        playerId: row.playerId,
        message: '条件別救援に現在の登録対象外の投手がいます。',
      });
  requireFinance(
    Number.isSafeInteger(squad.benchLimit) && squad.benchLimit >= 10,
    '保存内のベンチ上限が不正です',
  );
  return issues;
}
