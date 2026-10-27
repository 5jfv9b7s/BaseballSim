import type { CampDevelopmentDay, CampDevelopmentGrowthState } from './camp-types.ts';

/** 習得進度（100000 = 100%）はRatingMilliの成長量と区別する。 */
export interface PitchLearningConfig {
  version: 'pitch-learning-v1';
  enabled: boolean;
  progressPerBudgetPermille: number;
}
export interface PitchAcquisition {
  progressMilli: number;
  acquiredOn: string | null;
}
export interface PitchLearningOutcome {
  playerId: string;
  pitchId: string;
  beforeMilli: number;
  afterMilli: number;
  acquiredOn: string | null;
}
export interface PitchLearningDay extends CampDevelopmentDay {
  pitchLearning: PitchLearningOutcome[];
}
export interface PitchLearningGrowthState {
  modelId: 'daily-development';
  version: 'daily-development-v6';
  schemaId: 'daily-development-state-v6';
  state: Omit<CampDevelopmentGrowthState['state'], 'days'> & {
    acquisition: Record<string, PitchAcquisition>;
    days: Record<string, PitchLearningDay>;
  };
}
