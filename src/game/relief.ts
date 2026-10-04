import { ensure, integer } from '../engine/validation.ts';
import type { GameFixture, GameState, TeamSide } from './types.ts';
import {
  reliefRoles,
  type ReliefConfig,
  type ReliefConditions,
  type ReliefRoleRule,
  type ReliefDecision,
} from './relief-types.ts';

export const reliefRoleLabels = {
  relief: '通常救援',
  setup: 'セットアッパー',
  closer: '抑え',
  longRelief: 'ロングリリーフ',
};
export function validateReliefConditions(c: ReliefConditions): void {
  ensure(c, '救援の登板条件がありません');
  integer(c.startInning, 1, 12, '登板開始回');
  integer(c.endInning, c.startInning, 12, '登板終了回');
  ensure(
    Array.isArray(c.scoreStates) &&
      c.scoreStates.length > 0 &&
      new Set(c.scoreStates).size === c.scoreStates.length &&
      c.scoreStates.every((s) => ['lead', 'tied', 'trailing'].includes(s)),
    '得点状況の条件が不正です',
  );
  for (const value of [c.minScoreDifference, c.maxScoreDifference])
    if (value !== null) integer(value, -999, 999, '登板の点差');
  ensure(
    c.minScoreDifference === null ||
      c.maxScoreDifference === null ||
      c.minScoreDifference <= c.maxScoreDifference,
    '点差の下限が上限を超えています',
  );
}
export function validateReliefConfig(config: ReliefConfig): void {
  ensure(config?.version === 'conditional-relief-v1', '救援選択モデルの版が不正です');
  ensure(
    Array.isArray(config.roleOrder) &&
      config.roleOrder.length === reliefRoles.length &&
      new Set(config.roleOrder).size === reliefRoles.length &&
      config.roleOrder.every((r) => reliefRoles.includes(r)),
    '救援役割の優先順が不正です',
  );
  for (const role of reliefRoles) validateReliefConditions(config.templates?.[role]!);
}
export function validateReliefRules(rules: ReliefRoleRule[], playerIds: string[]): void {
  ensure(
    Array.isArray(rules) && rules.length <= playerIds.length * reliefRoles.length,
    '救援役割の件数が不正です',
  );
  const keys = new Set<string>();
  for (const rule of rules) {
    ensure(
      playerIds.includes(rule.playerId) && reliefRoles.includes(rule.role),
      '所属投手と救援役割を指定してください',
    );
    const key = JSON.stringify([rule.playerId, rule.role]);
    ensure(!keys.has(key), '同じ投手・役割が重複しています');
    keys.add(key);
    integer(rule.priority, 1, 99, '救援の優先順位');
    validateReliefConditions(rule.conditions);
  }
}
export function validateReliefFixture(fixture: GameFixture): void {
  const policy = fixture.reliefPolicy;
  if (!policy) return;
  ensure(policy.version === 'conditional-relief-v1', '試合の救援モデル版が不正です');
  ensure(
    Array.isArray(policy.roleOrder) &&
      policy.roleOrder.length === reliefRoles.length &&
      new Set(policy.roleOrder).size === reliefRoles.length &&
      policy.roleOrder.every((r) => reliefRoles.includes(r)),
    '試合の役割優先順が不正です',
  );
  for (const side of ['away', 'home'] as const) {
    const team = policy.teams?.[side];
    ensure(team, '両チームの救援方針が必要です');
    integer(team.policyRevision, 1, 2049, '救援方針版');
    validateReliefRules(team.reliefRoles, fixture.teams[side].pitcherIds);
    ensure(
      team.restPriority &&
        Object.keys(team.restPriority).length === fixture.teams[side].pitcherIds.length,
      '全投手の休養優先値が必要です',
    );
    for (const id of fixture.teams[side].pitcherIds)
      integer(team.restPriority[id]!, 0, 2, '休養優先値');
  }
}
export function reliefMatches(c: ReliefConditions, inning: number, difference: number): boolean {
  const status = difference > 0 ? 'lead' : difference === 0 ? 'tied' : 'trailing';
  return (
    inning >= c.startInning &&
    inning <= c.endInning &&
    c.scoreStates.includes(status) &&
    (c.minScoreDifference === null || difference >= c.minScoreDifference) &&
    (c.maxScoreDifference === null || difference <= c.maxScoreDifference)
  );
}

/** 交代の契機は既存の球数基準。ここでは条件を満たす未登板候補を無乱数で選ぶ。 */
export function selectReliever(
  state: GameState,
  fixture: GameFixture,
  side: TeamSide,
  requireReady = true,
): ReliefDecision {
  const policy = fixture.reliefPolicy!;
  const settings = policy.teams[side];
  const ids = fixture.teams[side].pitcherIds;
  const used = state.usedPitcherIds?.[side];
  ensure(used && used.includes(ids[state.pitcherIndex[side]]!), '実登板者の状態がありません');
  const difference = state.score[side] - state.score[side === 'home' ? 'away' : 'home'];
  const candidates = ids.slice(1).map((playerId) => {
    const assigned = settings.reliefRoles.filter((r) => r.playerId === playerId);
    const matched = assigned
      .filter((r) => reliefMatches(r.conditions, state.inning, difference))
      .sort(
        (a, b) =>
          policy.roleOrder.indexOf(a.role) - policy.roleOrder.indexOf(b.role) ||
          a.priority - b.priority,
      )[0];
    const ready =
      !requireReady ||
      !fixture.bullpenPolicy?.teams[side].enabled ||
      state.bullpen?.teams[side].players[playerId]?.phase === 'ready';
    const eligible = !used.includes(playerId) && !!matched && ready;
    return {
      playerId,
      role: matched?.role ?? null,
      priority: matched?.priority ?? null,
      restPriority: settings.restPriority[playerId]!,
      eligible,
      reason: used.includes(playerId)
        ? '登板済み（再登板不可）'
        : !assigned.length
          ? '役割未設定'
          : !matched
            ? '回・得点状況・点差が条件外'
            : !ready
              ? 'ブルペン準備が未完了'
              : '条件一致',
    };
  });
  const best = candidates
    .filter((c) => c.eligible)
    .sort(
      (a, b) =>
        a.restPriority - b.restPriority ||
        policy.roleOrder.indexOf(a.role!) - policy.roleOrder.indexOf(b.role!) ||
        a.priority! - b.priority!,
    )[0];
  return {
    version: 'conditional-relief-v1',
    side,
    inning: state.inning,
    scoreDifference: difference,
    outPlayerId: ids[state.pitcherIndex[side]]!,
    selectedId: best?.playerId ?? null,
    reason: best
      ? '条件一致候補を休養・役割・優先順位・候補順で選択'
      : '条件に合う未登板候補がいないため続投',
    candidates,
  };
}
