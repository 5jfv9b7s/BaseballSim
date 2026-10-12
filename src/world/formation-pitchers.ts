import type { FormationDraft } from './formation-draft.ts';
import type { ReliefConfig, ReliefRoleRule } from '../game/relief-types.ts';
import { formationDefaults } from '../../config/formation.ts';

export const formationReliefGroups = ['longRelief', 'close', 'behind', 'setup', 'closer'] as const;
export type FormationReliefGroup = (typeof formationReliefGroups)[number];
export const formationReliefLabels: Record<FormationReliefGroup, string> = {
  longRelief: 'ロング',
  close: '僅差',
  behind: 'ビハインド',
  setup: 'セットアッパー',
  closer: '抑え',
};
export function formationReliefGroup(rule: ReliefRoleRule): FormationReliefGroup {
  if (rule.role !== 'relief') return rule.role;
  return rule.conditions.scoreStates.length === 1 && rule.conditions.scoreStates[0] === 'trailing'
    ? 'behind'
    : 'close';
}

/** 役割・条件・優先順を別々に保持する。並べ替えだけなら条件を変更しない。 */
export function placeFormationPitcher(
  draft: FormationDraft,
  playerId: string,
  target: 'rotation' | FormationReliefGroup,
  config: ReliefConfig,
  beforeId?: string,
  source?: FormationReliefGroup,
): FormationDraft {
  if (beforeId === playerId) return structuredClone(draft);
  const next = structuredClone(draft);
  const oldRotation = draft.pitchers.rotationSlots.map((r) => r.playerId);
  let rotation = oldRotation.filter((id) => id !== playerId);
  let relief = draft.pitchers.reliefRoles.map((r) => r.playerId).filter((id) => id !== playerId);
  const insert = (ids: string[]) => {
    const index = beforeId ? ids.indexOf(beforeId) : -1;
    ids.splice(index < 0 ? ids.length : index, 0, playerId);
  };
  if (target === 'rotation') insert(rotation);
  else {
    relief.push(playerId);
    const existing = draft.reliefRoles?.find(
      (r) => r.playerId === playerId && formationReliefGroup(r) === target,
    );
    const role = target === 'close' || target === 'behind' ? 'relief' : target;
    const conditions = structuredClone(existing?.conditions ?? config.templates[role]);
    if (!existing && target === 'close') {
      conditions.minScoreDifference = -formationDefaults.closeGameScoreDifference;
      conditions.maxScoreDifference = formationDefaults.closeGameScoreDifference;
    }
    if (!existing && target === 'behind') {
      conditions.scoreStates = ['trailing'];
      conditions.minScoreDifference = null;
      conditions.maxScoreDifference = -1;
    }
    // 同一選手・同一内部役割は一つ。移動元だけを外し、その他の複数役割は保持する。
    const rules = (next.reliefRoles ?? []).filter(
      (r) =>
        r.playerId !== playerId ||
        (r.role !== role && (source ? formationReliefGroup(r) !== source : false)),
    );
    const members = rules
      .filter((r) => formationReliefGroup(r) === target)
      .sort((a, b) => a.priority - b.priority);
    const index = beforeId ? members.findIndex((r) => r.playerId === beforeId) : -1;
    members.splice(index < 0 ? members.length : index, 0, {
      playerId,
      role,
      priority: 1,
      conditions,
    });
    const priorities = new Map(members.map((r, i) => [r.playerId, i + 1]));
    next.reliefRoles = [
      ...rules.filter((r) => formationReliefGroup(r) !== target),
      ...members.map((r) => ({ ...r, priority: priorities.get(r.playerId)! })),
    ];
  }
  const nextStarter = oldRotation[draft.pitchers.nextSlotNo - 1];
  next.pitchers = {
    rotationSlots: rotation.map((id, i) => ({ playerId: id, slotNo: i + 1 })),
    reliefRoles: relief.map((id, i) => ({ playerId: id, role: 'relief', priority: i + 1 })),
    nextSlotNo: Math.max(1, rotation.indexOf(nextStarter ?? '') + 1),
  };
  return next;
}
