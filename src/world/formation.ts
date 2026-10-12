import type { WorldRecord } from './types.ts';
import type { FormationDraft } from './formation-draft.ts';
import { applyManagement, canEditManagement } from './management.ts';
import { canonicalJson } from '../storage/codec.ts';
import { ensure } from '../engine/validation.ts';

/** 全操作を候補世界へ適用する。Controllerが最後に一度だけ保存・公開する。 */
export function applyFormation(
  world: WorldRecord,
  commandId: string,
  draft: FormationDraft,
): WorldRecord {
  ensure('management' in world, 'この保存は編成編集に対応していません');
  ensure(canEditManagement(world), '編成変更は当日の全試合を始める前に行ってください');
  ensure(draft.squadId === world.management.controlledSquadId, '担当球団だけ変更できます');
  const squad = world.definitions.squads.find((s) => s.squadId === draft.squadId)!;
  let next: WorldRecord = world;
  if ('registration' in world) {
    const ids = draft.firstPlayerIds;
    ensure(
      Array.isArray(ids) &&
        new Set(ids).size === ids.length &&
        ids.every((id) => squad.players.some((p) => p.playerId === id)),
      '一軍案に重複または所属外の選手がいます',
    );
    const changes = world.registration.registrations
      .filter(
        (r) =>
          r.clubId === squad.team.clubId &&
          r.until === null &&
          (r.category === 'first') !== ids.includes(r.playerId),
      )
      .map((r) => ({
        playerId: r.playerId,
        category: ids.includes(r.playerId) ? ('first' as const) : ('farm' as const),
      }));
    if (changes.length)
      next = applyManagement(next, commandId + '/registration', {
        kind: 'setRegistrations',
        squadId: draft.squadId,
        changes,
      });
  } else ensure(draft.firstPlayerIds === null, 'この保存は登録変更に対応していません');
  if (
    canonicalJson(world.management.idealLineups[draft.squadId]) !== canonicalJson(draft.lineup) ||
    canonicalJson(world.management.pitcherUsagePlans[draft.squadId]) !==
      canonicalJson(draft.pitchers)
  ) {
    next = applyManagement(next, commandId + '/plan', {
      kind: 'setClubPlan',
      squadId: draft.squadId,
      lineup: draft.lineup,
      pitchers: draft.pitchers,
    });
  }
  return next;
}
