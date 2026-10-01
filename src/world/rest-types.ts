export interface RestRules {
  action: 'none' | 'preferRest' | 'benchRest';
  consecutiveDays: number | null;
  recentDays: number;
  recentPitches: number | null;
  previousDayInnings: number | null;
  energyMilli: number | null;
  fatigueMilli: number | null;
}

export type IndividualRest =
  { playerId: string; mode: 'inherit' } | { playerId: string; mode: 'custom'; rules: RestRules };

/** データ設計6.2のteam_policies / pitcher_usage_plansの休養設定部分。 */
export interface RestPolicyInput {
  squadId: string;
  teamRestPolicy: RestRules;
  individualRest: IndividualRest[];
}

export interface PitchingAppearance {
  playerId: string;
  squadId: string;
  gameId: string;
  date: string;
  pitches: number;
  /** 実際に1球以上投げたイニング。投球回のアウト数とは別。 */
  innings: number[];
}

export interface RestControl {
  version: 'pitcher-rest-v1';
  teamPolicies: Record<string, { teamRestPolicy: RestRules; policyRevision: number }>;
  pitcherUsagePlans: Record<string, { individualRest: IndividualRest[] }>;
  appearances: Record<string, PitchingAppearance>;
  appliedEvents: Record<string, number>;
}

export interface RestMetrics {
  lastPitchedOn: string | null;
  restDays: number | null;
  consecutiveDays: number;
  recentDays: number;
  recentPitches: number;
  previousDayInnings: number;
  energyMilli: number;
  fatigueMilli: number;
}

export interface RestDecision {
  playerId: string;
  mode: IndividualRest['mode'];
  requested: 'available' | 'preferRest' | 'benchRest';
  reasons: string[];
  metrics: RestMetrics;
  /** 試合前に確定する実扱い。登録資格と休養希望を分ける。 */
  outcome: 'starter' | 'relief' | 'preferRest' | 'benchRest' | 'notSelected';
  exception: string | null;
}

export interface RestSnapshot {
  version: 'pitcher-rest-v1';
  date: string;
  policyRevision: number;
  decisions: RestDecision[];
}

export interface RestPolicyAction {
  kind: 'setRestPolicy';
  squadId: string;
  teamRestPolicy: RestRules;
  individualRest: IndividualRest[];
}
