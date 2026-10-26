import type { RngState } from '../engine/types.ts';
import type { AgeDevelopmentDay, AgeDevelopmentGrowthState } from './age-types.ts';
import type { TrainingAbilityRef } from './training-types.ts';

export interface RookieAwakeningConfig {
  version: 'rookie-awakening-v1';
  enabled: boolean;
  opportunity: { basePpm: number; ambitionPpm: number };
  amount: { baseMilli: number; talentMilli: number };
}
export interface RookieAwakeningEvent {
  playerId: string;
  status: 'occurred';
  eventId: string;
  date: string;
  abilityRef: TrainingAbilityRef;
  beforeValue: number;
  afterValue: number;
  budgetMilli: number;
}
export type RookieAwakeningOutcome =
  | RookieAwakeningEvent
  | {
      playerId: string;
      status: 'missed' | 'noRoom';
    };
export interface RookieAwakeningDay extends AgeDevelopmentDay {
  awakening: RookieAwakeningOutcome[];
}
export interface RookieAwakeningState {
  modelId: 'rookie-awakening';
  version: 'rookie-awakening-v1';
  schemaId: 'rookie-awakening-state-v1';
  players: Record<
    string,
    {
      eligibleFrom: string;
      eligibleThrough: string;
      rng: RngState;
      appliedEventId: string | null;
      appliedOn: string | null;
    }
  >;
}
export interface RookieDevelopmentGrowthState {
  modelId: 'daily-development';
  version: 'daily-development-v4';
  schemaId: 'daily-development-state-v4';
  state: Omit<AgeDevelopmentGrowthState['state'], 'days'> & {
    awakeningState: RookieAwakeningState;
    days: Record<string, RookieAwakeningDay>;
  };
}
