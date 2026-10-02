import type { ReliefRoleRule } from '../game/relief-types.ts';
export interface ReliefPolicyInput {
  squadId: string;
  reliefRoles: ReliefRoleRule[];
}
/** 資料6.2のpitcher_usage_plans.reliefRolesを条件付き運用へ射影する。 */
export interface ReliefControl {
  version: 'conditional-relief-v1';
  teamPolicies: Record<string, { reliefRoles: ReliefRoleRule[]; policyRevision: number }>;
}
export interface ReliefPolicyAction {
  kind: 'setReliefPolicy';
  squadId: string;
  reliefRoles: ReliefRoleRule[];
}
