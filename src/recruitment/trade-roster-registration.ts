import type { PlayerRegistration } from '../world/registration-types.ts';
import {
  compareMoments,
  dateDays,
  financeId,
  requireFinance,
  uniqueFinanceIds,
  validateMoment,
} from '../finance/validation.ts';
import type { TradeMembership } from './trade-memberships.ts';
import type { TradeRosterInput, TradeRosterIssue } from './trade-roster-types.ts';

/** 登録期間を所属期間に含める。移籍前後の時点も同じ[開始,終了)で照合する。 */
export function validateTradeRegistrations(
  rows: readonly PlayerRegistration[],
  memberships: readonly TradeMembership[],
): void {
  uniqueFinanceIds(
    rows.map((row) => row.registrationId),
    '登録履歴ID',
  );
  const histories = new Map<string, PlayerRegistration[]>();
  for (const row of rows) {
    [row.playerId, row.clubId, row.sourceId].forEach(financeId);
    validateMoment(row.from);
    requireFinance(['first', 'farm'].includes(row.category), '登録区分が不正です');
    if (row.nextFirstEligibleOn !== null) dateDays(row.nextFirstEligibleOn);
    if (row.until !== null) {
      validateMoment(row.until);
      requireFinance(compareMoments(row.from, row.until) < 0, '登録期間が空、または逆順です');
    }
    requireFinance(
      memberships.some(
        (member) =>
          member.playerId === row.playerId &&
          member.clubId === row.clubId &&
          compareMoments(member.from, row.from) <= 0 &&
          (member.until === null ||
            (row.until !== null && compareMoments(row.until, member.until) <= 0)),
      ),
      '登録期間が所属期間に含まれていません',
    );
    const history = histories.get(row.playerId) ?? [];
    history.push(row);
    histories.set(row.playerId, history);
  }
  for (const history of histories.values()) {
    history.sort((a, b) => compareMoments(a.from, b.from));
    for (let index = 1; index < history.length; index += 1) {
      const previous = history[index - 1]!;
      requireFinance(
        previous.until !== null && compareMoments(previous.until, history[index]!.from) <= 0,
        '選手の登録期間が重複しています',
      );
    }
  }
  for (const member of memberships.filter((row) => row.until === null))
    requireFinance(
      rows.some(
        (row) =>
          row.playerId === member.playerId && row.clubId === member.clubId && row.until === null,
      ),
      '現在所属する選手の登録区分が未記録です',
    );
}

export function prepareTradeRegistrations(input: TradeRosterInput): {
  rows: PlayerRegistration[];
  issues: TradeRosterIssue[];
} {
  validateTradeRegistrations(input.state.registrations, input.state.memberships);
  uniqueFinanceIds(
    input.choices.map((choice) => choice.playerId),
    '登録指定の選手ID',
  );
  const issues: TradeRosterIssue[] = [];
  for (const move of input.moves) {
    const choice = input.choices.find((row) => row.playerId === move.playerId);
    if (!choice)
      issues.push({
        code: 'registrationRequired',
        playerId: move.playerId,
        clubId: move.toClubId,
        message: '獲得後の一軍・二軍の登録先を指定してください。',
      });
    else if (choice.preference === undefined)
      issues.push({
        code: 'preferenceRequired',
        playerId: move.playerId,
        clubId: move.toClubId,
        message: '獲得後の固定希望を指定してください（自動を選ぶ場合も明示）。',
      });
  }
  const replacements = new Map<string, PlayerRegistration>();
  const additions: PlayerRegistration[] = [];
  for (const choice of input.choices) {
    requireFinance(input.clubIds.includes(choice.clubId), '取引外の球団の登録指定です');
    requireFinance(['first', 'farm'].includes(choice.category), '獲得後の登録区分が不正です');
    if (choice.preference !== undefined)
      requireFinance(
        ['firstFixed', 'farmFixed', 'auto'].includes(choice.preference),
        '獲得後の固定希望が不正です',
      );
    const move = input.moves.find((row) => row.playerId === choice.playerId);
    const current = input.state.registrations.find(
      (row) => row.playerId === choice.playerId && row.until === null,
    );
    requireFinance(
      current &&
        (move
          ? current.clubId === move.fromClubId && choice.clubId === move.toClubId
          : current.clubId === choice.clubId),
      '登録指定の所属が一致しません',
    );
    requireFinance(
      compareMoments(current.from, input.effectiveAt) <= 0,
      '未来の登録を変更しようとしています',
    );
    if (
      choice.category === 'first' &&
      current.nextFirstEligibleOn !== null &&
      current.nextFirstEligibleOn > input.effectiveAt.date
    ) {
      issues.push({
        code: 'registrationCooldown',
        playerId: choice.playerId,
        clubId: choice.clubId,
        message: `一軍再登録可能日は${current.nextFirstEligibleOn}です。移籍では解除しません。`,
      });
      continue;
    }
    if (!move && current.category === choice.category) continue;
    requireFinance(
      compareMoments(current.from, input.effectiveAt) < 0,
      '同じイベント順で登録期間を閉じられません',
    );
    const nextFirstEligibleOn =
      current.category === 'first' && choice.category === 'farm'
        ? new Date((dateDays(input.effectiveAt.date) + input.rules.reentryDays) * 86_400_000)
            .toISOString()
            .slice(0, 10)
        : choice.category === 'first'
          ? null
          : current.nextFirstEligibleOn;
    const registrationId = JSON.stringify([
      'trade-registration-v1',
      input.transactionId,
      choice.playerId,
    ]);
    requireFinance(
      !input.state.registrations.some((row) => row.registrationId === registrationId),
      'この取引の登録履歴は反映済みです',
    );
    replacements.set(current.registrationId, { ...current, until: { ...input.effectiveAt } });
    additions.push({
      registrationId,
      playerId: choice.playerId,
      clubId: choice.clubId,
      category: choice.category,
      from: { ...input.effectiveAt },
      until: null,
      nextFirstEligibleOn,
      sourceId: input.transactionId,
    });
  }
  return {
    rows: [
      ...input.state.registrations.map((row) => replacements.get(row.registrationId) ?? row),
      ...additions,
    ],
    issues,
  };
}
