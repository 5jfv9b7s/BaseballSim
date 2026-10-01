/** 野手の休養は登録資格・投手の登板休養と別に扱う限定試作。 */
export interface FielderRestRules {
  enabled: boolean;
  energyMilli: number | null;
  fatigueMilli: number | null;
}

export interface FielderRestInput {
  squadId: string;
  rules: FielderRestRules;
}

export interface FielderRestControl {
  version: 'fielder-rest-v1';
  teamPolicies: Record<string, { rules: FielderRestRules; policyRevision: number }>;
}

export interface FielderRestDecision {
  playerId: string;
  energyMilli: number;
  fatigueMilli: number;
  requested: boolean;
  reasons: string[];
  outcome: 'starting' | 'resting' | 'reserve' | 'outsideBench';
  replacementId: string | null;
  exception: string | null;
}

export interface FielderRestSnapshot {
  version: 'fielder-rest-v1';
  date: string;
  policyRevision: number;
  rules: FielderRestRules;
  decisions: FielderRestDecision[];
}

export interface FielderRestAction {
  kind: 'setFielderRestPolicy';
  squadId: string;
  rules: FielderRestRules;
}
