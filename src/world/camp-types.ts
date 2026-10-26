import type { RngState } from '../engine/types.ts';
import type { RookieAwakeningDay, RookieDevelopmentGrowthState } from './awakening-types.ts';
import type { TrainingPlan, TrainingSettings } from './training-types.ts';

export interface CampConfig {
  version: 'camp-training-v1';
  enabled: boolean;
  focusAmountPermille: number;
  burst: { basePpm: number; ambitionPpm: number; baseMilli: number; talentMilli: number };
}
export interface CampPeriod {
  campId: string;
  label: string;
  from: string;
  through: string;
}
export interface CampInputs {
  version: 'camp-inputs-v1';
  periods: (CampPeriod & { players: { playerId: string; settings: TrainingSettings }[] })[];
}
export type CampPlan = Omit<TrainingPlan, 'planKind' | 'effectiveUntil'> & {
  planKind: 'camp';
  effectiveUntil: string;
};
export interface CampPlanControl {
  version: 'camp-plans-v1';
  revision: number;
  plans: Record<string, Record<string, CampPlan>>;
}
export interface CampPlansAction {
  kind: 'setCampPlans';
  campId: string;
  squadId: string;
  updates: { playerId: string; settings: TrainingSettings }[];
}
export interface CampTrainingOverride {
  campId: string;
  focusAmountPermille: number;
  plans: Record<string, CampPlan>;
}
export interface CampBurstState {
  rng: RngState;
  checkedOn: string | null;
  appliedEventId: string | null;
}
export interface CampBurstOutcome {
  playerId: string;
  status: 'rest' | 'noRoom' | 'alreadyChecked' | 'missed' | 'occurred';
  eventId: string | null;
  budgetMilli: number;
  appliedMilli: number;
}
export interface CampDevelopmentDay extends RookieAwakeningDay {
  camp: { campId: string; outcomes: CampBurstOutcome[] } | null;
}
export interface CampDevelopmentGrowthState {
  modelId: 'daily-development';
  version: 'daily-development-v5';
  schemaId: 'daily-development-state-v5';
  state: Omit<RookieDevelopmentGrowthState['state'], 'days'> & {
    campBursts: Record<string, Record<string, CampBurstState>>;
    days: Record<string, CampDevelopmentDay>;
  };
}
export type CampDraft = Record<string, Record<string, TrainingSettings>>;
