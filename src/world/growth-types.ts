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
  reason: 'training' | 'experience' | 'aging';
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

export interface TrainingGrowthState {
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
  version: GrowthState['version'];
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
  latest: {
    date: string;
    outcomes: TrainingOutcome[];
    experience?: ExperienceOutcome[];
    aging?: import('./age-types.ts').AgeOutcome[];
  } | null;
}

export type ExperienceDomain = 'batting' | 'pitching' | 'fielding';

/** 実戦経験v1の未校正係数。通常練習v1とは独立して保存する。 */
export interface ExperienceConfig {
  version: 'game-experience-v1';
  enabled: boolean;
  opportunity: { baseMilli: number; ambitionMilli: number };
  opponent: { centerMilli: number; spanPermille: number };
  domains: Record<
    ExperienceDomain,
    {
      saturationUnits: number;
      basePerUnitMilli: number;
      talentPerUnitMilli: number;
    }
  >;
}

export interface ExperienceActivity {
  playerId: string;
  domain: ExperienceDomain;
  units: number;
  /** 当日の実出場を参照する。結果の成功・失敗では重み付けしない。 */
  sources: { gameId: string; units: number }[];
  targets: { abilityRef: TrainingAbilityRef; units: number }[];
  opponentQualityMilli: number;
}

export interface ExperienceOutcome extends ExperienceActivity {
  effectiveUnitsMilli: number;
  opponentFactorPermille: number;
  opportunityMilli: number;
  opportunityOccurred: boolean;
  budgetMilli: number;
  /** 上限で切り捨てた分を除く、実際に増えた内部値の合計。 */
  appliedMilli: number;
}

export interface DevelopmentDay extends TrainingDay {
  experience: ExperienceOutcome[];
}

export interface DevelopmentGrowthState {
  modelId: 'daily-development';
  version: 'daily-development-v2';
  schemaId: 'daily-development-state-v2';
  state: {
    lastCompletedOn: string | null;
    players: TrainingGrowthState['state']['players'];
    experienceRng: Record<string, RngState>;
    days: Record<string, DevelopmentDay>;
  };
}

export type GrowthState =
  TrainingGrowthState | DevelopmentGrowthState | import('./age-types.ts').AgeDevelopmentGrowthState;
