import type { Ability } from '../engine/types.ts';

/** 身体状態だけの射影。調子・怪我・成長モデルを空値で補完しない。 */
export interface PhysicalInput {
  playerId: string;
  physical: { stamina: Ability; recovery: Ability };
  energyMilli: number;
  fatigueMilli: number;
}

export type ActivityKind = 'pitching' | 'batting' | 'fielding' | 'running' | 'preparation';

export interface PhysicalConfig {
  version: 'physical-load-v1' | 'physical-load-v2';
  /** 1単位あたりの負荷。各実績の数え方はPHYSICAL-IMPLEMENTATION.md。 */
  workloadUnits: Record<ActivityKind, number>;
  /** 負荷1000単位あたりのPercentMilli変化。 */
  energyCostMilli: number;
  fatigueCostMilli: number;
  dailyRecovery: {
    energyBaseMilli: number;
    energyAbilityMilli: number;
    fatigueBaseMilli: number;
    fatigueAbilityMilli: number;
    restEnergyBonusMilli: number;
    restFatigueBonusMilli: number;
  };
  restAdvice: { energyAtOrBelowMilli: number; fatigueAtOrAboveMilli: number };
}

export interface PhysicalState {
  energyMilli: number;
  fatigueMilli: number;
  lastUpdatedOn: string;
}

export interface ActivityLoad {
  playerId: string;
  date: string;
  sourceLoads: {
    sourceKey: string;
    kind: ActivityKind;
    workloadUnits: number;
    actualCounts: number;
    energySpentMilli: number;
    fatigueAddedMilli: number;
  }[];
}

export interface PhysicalWorldState {
  version: 'physical-load-v1' | 'physical-load-v2';
  players: Record<string, PhysicalState>;
  /** playerId＋date。一二軍共通の選手状態へ合算する。 */
  activityLoads: Record<string, ActivityLoad>;
  /** gameIdごとの反映済みイベント数。終了集計で再適用しない。 */
  appliedEvents: Record<string, number>;
  recoveries: Record<
    string,
    {
      date: string;
      playerId: string;
      rested: boolean;
      energyRecoveredMilli: number;
      fatigueRecoveredMilli: number;
    }
  >;
}
