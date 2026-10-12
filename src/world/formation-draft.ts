import type { WorldView } from './controller.ts';
import type { IdealLineup, PitcherUsagePlan } from './types.ts';
import type { ReliefRoleRule } from '../game/relief-types.ts';
import type { RosterPolicyInput } from './roster-policy-types.ts';
import type { RestPolicyInput } from './rest-types.ts';
import { canonicalJson } from '../storage/codec.ts';

/** 編成内で共有する編集案。保存内には既存の確定指示だけを記録する。 */
export interface FormationDraft {
  squadId: string;
  lineup: IdealLineup;
  pitchers: PitcherUsagePlan;
  firstPlayerIds: string[] | null;
  rosterPolicy: RosterPolicyInput | null;
  restPolicy: Omit<RestPolicyInput, 'squadId'> | null;
  reliefRoles: ReliefRoleRule[] | null;
}
export type FormationAction = FormationDraft & { kind: 'setFormation' };

export function createFormationDraft(view: WorldView): FormationDraft | null {
  if (!view.management) return null;
  const squadId = view.management.controlledSquadId;
  const clubId = view.definitions.squads.find((s) => s.squadId === squadId)!.team.clubId;
  return structuredClone({
    squadId,
    lineup: view.management.idealLineups[squadId]!,
    pitchers: view.management.pitcherUsagePlans[squadId]!,
    rosterPolicy: view.rosterPolicy
      ? {
          changeMode: view.rosterPolicy.policy.changeMode,
          preferences: view.rosterPolicy.preferences.map(({ playerId, preference }) => ({
            playerId,
            preference,
          })),
        }
      : null,
    restPolicy: view.restPolicy
      ? {
          teamRestPolicy: view.restPolicy.teamRestPolicy,
          individualRest: view.restPolicy.individualRest,
        }
      : null,
    reliefRoles: view.relief?.reliefRoles ?? null,
    firstPlayerIds: view.registration
      ? view.registration.registrations
          .filter((r) => r.clubId === clubId && r.until === null && r.category === 'first')
          .map((r) => r.playerId)
          .sort()
      : null,
  });
}

export function formationChanged(a: FormationDraft, b: FormationDraft): boolean {
  const normalized = (draft: FormationDraft) => ({
    ...draft,
    firstPlayerIds: draft.firstPlayerIds ? [...draft.firstPlayerIds].sort() : null,
  });
  return canonicalJson(normalized(a)) !== canonicalJson(normalized(b));
}
