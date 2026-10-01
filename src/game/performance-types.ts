export const performanceGroups = [
  'contact',
  'power',
  'discipline',
  'running',
  'fielding',
  'throwing',
  'control',
  'repeatability',
] as const;
export type PerformanceGroup = (typeof performanceGroups)[number];
export interface PerformanceRule {
  conditionSwingPermille: number;
  energyPenaltyPermille: number;
  fatiguePenaltyPermille: number;
}
export interface PerformanceConfig {
  version: 'pregame-performance-v1';
  minFactorPermille: number;
  maxFactorPermille: number;
  groups: Record<PerformanceGroup, PerformanceRule>;
}
export interface PerformanceState {
  conditionMilli: number;
  energyMilli: number;
  fatigueMilli: number;
}
/** 原能力はGameRecord.fixtureに保持。ここには試合前の補正根拠だけを固定する。 */
export interface PerformanceSnapshot {
  version: 'pregame-performance-v1';
  date: string;
  gameId: string;
  config: PerformanceConfig;
  players: Record<string, PerformanceState>;
}
export interface AbilityEffect {
  label: string;
  target: string;
  group: PerformanceGroup;
  baseMilli: number;
  ceilingMilli: number;
  effectiveMilli: number;
}
