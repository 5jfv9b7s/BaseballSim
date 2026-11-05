import type { FinanceMoment } from '../finance/types.ts';
import {
  compareMoments,
  financeId,
  requireFinance,
  uniqueFinanceIds,
  validateMoment,
} from '../finance/validation.ts';

/** 現行所属履歴と同じ期間表現。旧世界のClubMembership型・保存は変更しない。 */
export interface TradeMembership {
  membershipId: string;
  playerId: string;
  clubId: string;
  from: FinanceMoment;
  until: FinanceMoment | null;
  entryReason: 'initial' | 'trade';
  exitReason?: 'trade';
  sourceTransactionId?: string;
}

export interface TradePlayerMove {
  playerId: string;
  fromClubId: string;
  toClubId: string;
  reason: 'trade';
  effectiveAt: FinanceMoment;
}

export interface TradeMembershipPlan {
  transactionId: string;
  effectiveAt: FinanceMoment;
  clubIds: readonly string[];
  memberships: readonly TradeMembership[];
  moves: readonly { playerId: string; fromClubId: string; toClubId: string }[];
}

/**
 * 所属履歴だけの移籍案を作る純粋関数。既存履歴を閉じ、新しい履歴を追加する。
 * 登録・編成・給与・支払・保存は別途まとめる必要があり、これだけでは取引を確定しない。
 * 提出前の計画作成用。同じ取引IDがすでに反映済みの場合は再適用せず拒否する。
 */
export function planTradeMemberships(input: TradeMembershipPlan): {
  memberships: TradeMembership[];
  playerMoves: TradePlayerMove[];
} {
  financeId(input.transactionId);
  validateMoment(input.effectiveAt);
  uniqueFinanceIds(input.clubIds, '球団ID');
  uniqueFinanceIds(
    input.memberships.map((m) => m.membershipId),
    '所属履歴ID',
  );
  uniqueFinanceIds(
    input.moves.map((m) => m.playerId),
    '取引内の選手ID',
  );
  requireFinance(input.moves.length > 0, '移籍する選手がいません');
  const clubs = new Set(input.clubIds);
  const histories = new Map<string, TradeMembership[]>();
  for (const membership of input.memberships) {
    financeId(membership.playerId);
    requireFinance(clubs.has(membership.clubId), '所属履歴の球団が名簿にありません');
    requireFinance(['initial', 'trade'].includes(membership.entryReason), '未対応の入団理由です');
    if (membership.sourceTransactionId !== undefined) financeId(membership.sourceTransactionId);
    requireFinance(
      membership.sourceTransactionId !== input.transactionId,
      'この取引の所属履歴は反映済みです',
    );
    validateMoment(membership.from);
    if (membership.until !== null) {
      validateMoment(membership.until);
      requireFinance(
        compareMoments(membership.from, membership.until) < 0,
        '所属期間が空、または逆順です',
      );
    }
    const rows = histories.get(membership.playerId) ?? [];
    rows.push(membership);
    histories.set(membership.playerId, rows);
  }
  for (const rows of histories.values()) {
    rows.sort((a, b) => compareMoments(a.from, b.from));
    for (let index = 1; index < rows.length; index += 1) {
      const previous = rows[index - 1]!;
      requireFinance(
        previous.until !== null && compareMoments(previous.until, rows[index]!.from) <= 0,
        '選手の所属期間が重複しています',
      );
    }
  }

  const replacements = new Map<string, TradeMembership>();
  const additions: TradeMembership[] = [];
  const playerMoves: TradePlayerMove[] = [];
  for (const move of input.moves) {
    requireFinance(
      clubs.has(move.fromClubId) && clubs.has(move.toClubId) && move.fromClubId !== move.toClubId,
      '移籍元・移籍先の球団が不正です',
    );
    const rows = histories.get(move.playerId) ?? [];
    const current = rows.find((row) => row.until === null);
    requireFinance(
      current && current.clubId === move.fromClubId,
      '移籍元と現在の所属が一致しません',
    );
    requireFinance(
      compareMoments(current.from, input.effectiveAt) < 0,
      '所属開始以前の移籍は計画できません',
    );
    const membershipId = JSON.stringify(['trade-membership', input.transactionId, move.playerId]);
    requireFinance(
      !input.memberships.some((m) => m.membershipId === membershipId),
      '作成する所属履歴IDが既存履歴と重複します',
    );
    replacements.set(current.membershipId, {
      ...current,
      until: { ...input.effectiveAt },
      exitReason: 'trade',
    });
    additions.push({
      membershipId,
      playerId: move.playerId,
      clubId: move.toClubId,
      from: { ...input.effectiveAt },
      until: null,
      entryReason: 'trade',
      sourceTransactionId: input.transactionId,
    });
    playerMoves.push({ ...move, reason: 'trade', effectiveAt: { ...input.effectiveAt } });
  }
  return {
    memberships: [
      ...input.memberships.map((row) => replacements.get(row.membershipId) ?? row),
      ...additions,
    ],
    playerMoves,
  };
}
