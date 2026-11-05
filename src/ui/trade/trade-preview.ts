import type { WorldView } from '../../world/controller.ts';
import type { CommonAbilityCode } from '../../players/abilities.ts';
import { existingPlayerAbilities, playerBaseAbilities } from '../../world/player-development.ts';
import { playerProfile } from '../../world/player-profiles.ts';
import { PROFILE_POSITIONS } from '../../world/player-profile-types.ts';
import { growthAbilityKey } from '../../world/growth-basis.ts';
import { commonTrainingRef } from '../../world/training.ts';

type TradeView = Pick<WorldView, 'definitions' | 'management' | 'growth'>;
export interface TradeDraft {
  partnerId: string;
  outgoingIds: string[];
  incomingIds: string[];
  moneyText: string;
}
export const emptyTradeDraft = (): TradeDraft => ({
  partnerId: '',
  outgoingIds: [],
  incomingIds: [],
  moneyText: '0',
});

/** 円単位の表示入力。上限はJSの整数表現の限界で、交渉可能額の仕様ではない。 */
export function proposalMoney(text: string): number | null {
  const normalized = text.normalize('NFKC').trim();
  if (!/^\d+$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

export function tradePlayerName(view: Pick<WorldView, 'definitions'>, playerId: string): string {
  const player = view.definitions.squads
    .flatMap((s) => s.players)
    .find((p) => p.playerId === playerId);
  return (
    playerProfile(view.definitions, playerId)?.displayName ??
    (player ? `${player.familyName} ${player.givenName}` : '名簿にいない選手')
  );
}

/** 現在の基本能力を読む。未記録を0とせず、初期定義も変更しない。 */
export function tradeAbilities(view: TradeView, playerId: string) {
  const base =
    playerBaseAbilities(view.definitions, playerId) ??
    existingPlayerAbilities(view.definitions, playerId);
  const current = view.growth?.current[playerId];
  return Object.fromEntries(
    Object.entries(base ?? {}).map(([code, ability]) => [
      code,
      current?.[growthAbilityKey(commonTrainingRef(code as CommonAbilityCode))] ??
        ability?.valueMilli ??
        null,
    ]),
  ) as Partial<Record<CommonAbilityCode, number | null>>;
}

function positions(view: TradeView, ids: readonly string[]) {
  const counts = Object.fromEntries([...PROFILE_POSITIONS, '記録なし'].map((p) => [p, 0]));
  for (const id of ids) {
    const position = playerProfile(view.definitions, id)?.primaryPosition ?? '記録なし';
    counts[position]! += 1;
  }
  return counts;
}

/** 人数だけの試算。成否判定・契約・資金・移籍・乱数の処理は行わない。 */
export function previewTrade(view: TradeView, draft: TradeDraft) {
  const own = view.definitions.squads.find((s) => s.squadId === view.management?.controlledSquadId);
  const partner = view.definitions.squads.find((s) => s.squadId === draft.partnerId);
  const errors: string[] = [];
  if (!own) errors.push('担当球団の記録がありません。');
  if (!partner) errors.push('相手球団を選んでください。');
  if (partner && own?.squadId === partner.squadId) errors.push('自球団を相手には選べません。');
  const check = (ids: string[], squad: typeof own, label: string) => {
    if (new Set(ids).size !== ids.length) errors.push(`${label}に同じ選手が重複しています。`);
    if (ids.some((id) => !squad?.players.some((p) => p.playerId === id)))
      errors.push(`${label}に対象球団の名簿にいない選手が含まれています。選び直してください。`);
  };
  check(draft.outgoingIds, own, '出す選手');
  check(draft.incomingIds, partner, '獲得する選手');
  const canProject = errors.length === 0;
  const money = proposalMoney(draft.moneyText);
  if (money === null)
    errors.push('提示金銭は円単位の0以上の整数で入力してください（安全な整数の範囲）。');
  if (!draft.incomingIds.length) errors.push('獲得する選手を選んでください。');
  if (!draft.outgoingIds.length && money === 0)
    errors.push('出す選手、または提示金銭を指定してください。');
  const project = (squad: NonNullable<typeof own>, removed: string[], added: string[]) => {
    const beforeIds = squad.players.map((p) => p.playerId);
    const afterIds = [...beforeIds.filter((id) => !removed.includes(id)), ...added];
    return {
      before: beforeIds.length,
      after: afterIds.length,
      positionsBefore: positions(view, beforeIds),
      positionsAfter: positions(view, afterIds),
    };
  };
  return {
    own,
    partner,
    money,
    errors,
    ownCounts: canProject && own ? project(own, draft.outgoingIds, draft.incomingIds) : null,
    partnerCounts:
      canProject && partner ? project(partner, draft.incomingIds, draft.outgoingIds) : null,
  };
}
