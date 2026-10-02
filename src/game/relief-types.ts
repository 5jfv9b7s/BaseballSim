import type { TeamSide } from './types.ts';

export const reliefRoles = ['relief', 'setup', 'closer', 'longRelief'] as const;
export type ReliefRole = (typeof reliefRoles)[number];
export type ScoreState = 'lead' | 'tied' | 'trailing';
export interface ReliefConditions {
  startInning: number;
  endInning: number;
  scoreStates: ScoreState[];
  /** 守備側の得点−攻撃側の得点。nullは下限/上限なし。 */
  minScoreDifference: number | null;
  maxScoreDifference: number | null;
}
export interface ReliefRoleRule {
  playerId: string;
  role: ReliefRole;
  priority: number;
  conditions: ReliefConditions;
}
export interface ReliefConfig {
  version: 'conditional-relief-v1';
  roleOrder: ReliefRole[];
  templates: Record<ReliefRole, ReliefConditions>;
}
export interface ReliefPolicySnapshot {
  version: 'conditional-relief-v1';
  roleOrder: ReliefRole[];
  teams: Record<
    TeamSide,
    {
      policyRevision: number;
      reliefRoles: ReliefRoleRule[];
      restPriority: Record<string, number>;
    }
  >;
}
export interface ReliefDecision {
  version: 'conditional-relief-v1';
  side: TeamSide;
  inning: number;
  scoreDifference: number;
  outPlayerId: string;
  selectedId: string | null;
  reason: string;
  candidates: {
    playerId: string;
    role: ReliefRole | null;
    priority: number | null;
    restPriority: number;
    eligible: boolean;
    reason: string;
  }[];
}
