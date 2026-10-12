import type { WorldRecord } from './types.ts';
import type { FormationDraft } from './formation-draft.ts';
import { applyManagement, canEditManagement } from './management.ts';
import { canonicalJson } from '../storage/codec.ts';
import { rosterPolicyView } from './roster-policy.ts';
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
  const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
  const roster = 'rosterControl' in world ? rosterPolicyView(world) : null;
  const rosterChanged =
    !!roster &&
    !!draft.rosterPolicy &&
    !same(draft.rosterPolicy, {
      changeMode: roster.policy.changeMode,
      preferences: roster.preferences.map(({ playerId, preference }) => ({ playerId, preference })),
    });
  ensure(!!roster === !!draft.rosterPolicy, 'この保存の登録方針を指定してください');
  // 自動→手動は先に方針を切り替える。まだ候補世界なので途中保存はしない。
  if (rosterChanged && draft.rosterPolicy!.changeMode === 'manual') {
    next = applyManagement(next, commandId + '/roster', {
      kind: 'setRosterPolicy',
      squadId: draft.squadId,
      ...draft.rosterPolicy!,
    });
  }
  if ('registration' in world) {
    let ids = draft.firstPlayerIds;
    ensure(
      Array.isArray(ids) &&
        new Set(ids).size === ids.length &&
        ids.every((id) => squad.players.some((p) => p.playerId === id)),
      '一軍案に重複または所属外の選手がいます',
    );
    if (draft.rosterPolicy?.changeMode === 'auto' && roster?.policy.changeMode === 'manual') {
      // 退出時の固定希望を含めた最終登録だけを反映し、途中の抹消を作らない。
      const target = new Set(ids);
      for (const entry of draft.rosterPolicy.preferences) {
        if (entry.preference === 'firstFixed') target.add(entry.playerId);
        if (entry.preference === 'farmFixed') target.delete(entry.playerId);
      }
      ids = [...target];
    }
    const changes = world.registration.registrations
      .filter(
        (r) =>
          r.clubId === squad.team.clubId &&
          r.until === null &&
          (r.category === 'first') !== ids!.includes(r.playerId),
      )
      .map((r) => ({
        playerId: r.playerId,
        category: ids!.includes(r.playerId) ? ('first' as const) : ('farm' as const),
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
  if (draft.restPolicy) {
    ensure('restControl' in next, 'この保存は休養方針に対応していません');
    const current = {
      teamRestPolicy: next.restControl.teamPolicies[draft.squadId]!.teamRestPolicy,
      individualRest: next.restControl.pitcherUsagePlans[draft.squadId]!.individualRest,
    };
    if (!same(current, draft.restPolicy))
      next = applyManagement(next, commandId + '/rest', {
        kind: 'setRestPolicy',
        squadId: draft.squadId,
        ...draft.restPolicy,
      });
  } else ensure(!('restControl' in next), '休養方針がありません');
  if (draft.reliefRoles) {
    ensure('reliefControl' in next, 'この保存は救援条件に対応していません');
    if (!same(next.reliefControl.teamPolicies[draft.squadId]!.reliefRoles, draft.reliefRoles))
      next = applyManagement(next, commandId + '/relief', {
        kind: 'setReliefPolicy',
        squadId: draft.squadId,
        reliefRoles: draft.reliefRoles,
      });
  } else ensure(!('reliefControl' in next), '救援条件がありません');
  if (rosterChanged && draft.rosterPolicy!.changeMode === 'auto') {
    next = applyManagement(next, commandId + '/roster', {
      kind: 'setRosterPolicy',
      squadId: draft.squadId,
      ...draft.rosterPolicy!,
    });
  }
  // 手動登録の空き枠は退出時に理由を示す。画面内の往復では履歴を作らない。
  if (next !== world && 'registration' in next && draft.rosterPolicy?.changeMode !== 'auto') {
    const active = new Set(
      next.registration.registrations
        .filter((r) => r.until === null && r.category === 'first')
        .map((r) => r.playerId),
    );
    const missing = draft.lineup.battingOrder.filter((row) => !active.has(row.playerId));
    ensure(
      !missing.length,
      '一軍オーダーの空き枠を補充してください：' + missing.map((r) => r.slotNo + '番').join('・'),
    );
  }
  return next;
}
