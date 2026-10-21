import type { RngState } from '../engine/types.ts';
import type { TrainingAbilityRef, TrainingSettings } from './training-types.ts';

export interface GrowthConfig {
  version: 'daily-training-v1';
  enabled: boolean;
  opportunity: { baseMilli: number; ambitionMilli: number };
  budget: { baseMilli: number; talentMilli: number; backgroundPermille: number };
  intensities: Record<
    TrainingSettings['intensity'],
    {
      opportunityPermille: number;
      amountPermille: number;
      energyCostMilli: number;
      fatigueCostMilli: number;
    }
  >;
  fatigueAdjustment: {
    lightEnergyAtOrBelowMilli: number;
    restEnergyAtOrBelowMilli: number;
    lightFatigueAtOrAboveMilli: number;
    restFatigueAtOrAboveMilli: number;
    lightWorkloadAtOrAbove: number;
    restWorkloadAtOrAbove: number;
  };
}

export interface GrowthAbility {
  key: string;
  abilityRef: TrainingAbilityRef;
  label: string;
  valueMilli: number;
  ceilingMilli: number;
}

export interface AbilityChange {
  changeId: string;
  playerId: string;
  effectiveOn: string;
  eventOrder: number;
  abilityRef: TrainingAbilityRef;
  unitCode: 'ratingMilli';
  changeKind: 'value';
  beforeValue: number;
  afterValue: number;
  reason: 'training';
  sourceEventId: string;
  abilityCatalogVersion: 'common-abilities-v1';
}

export interface TrainingOutcome {
  playerId: string;
  settings: TrainingSettings;
  effectiveIntensity: TrainingSettings['intensity'];
  adjustmentReasons: string[];
  opportunityMilli: number;
  opportunityOccurred: boolean;
  budgetMilli: number;
  energySpentMilli: number;
  fatigueAddedMilli: number;
}

export interface TrainingDay {
  date: string;
  outcomes: TrainingOutcome[];
  changes: AbilityChange[];
  /** 日ごとの表示整数の差。期間合計は端点同士から別途求める。 */
  displayDeltas: Record<string, number>;
}

export interface GrowthState {
  modelId: 'daily-training';
  version: 'daily-training-v1';
  schemaId: 'daily-training-state-v1';
  state: {
    lastCompletedOn: string | null;
    players: Record<string, { values: Record<string, number>; rng: RngState }>;
    days: Record<string, TrainingDay>;
  };
}

export interface GrowthView {
  version: 'daily-training-v1';
  current: Record<string, Record<string, number>>;
  periods: Record<
    'season' | 'last30' | 'last7' | 'lastDay',
    {
      from: string;
      through: string | null;
      start: Record<string, Record<string, number>>;
    }
  >;
  dates: string[];
  dailyDeltas: Record<string, number[]>;
  latest: { date: string; outcomes: TrainingOutcome[] } | null;
}
