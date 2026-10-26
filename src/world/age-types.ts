import type { CommonAbilityCode } from '../players/abilities.ts';
import type { DevelopmentDay, DevelopmentGrowthState } from './growth-types.ts';

export const AGE_GROUPS = ['physical', 'technique', 'judgment'] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];

/** 年齢は年×1000。成長期と衰退開始を別々に指定する未校正の曲線。 */
export interface AgeCurve {
  growthStartAgeMilli: number;
  growthPeakAgeMilli: number;
  growthEndAgeMilli: number;
  declineStartAgeMilli: number;
  growthPermille: number;
  declinePermille: number;
}
export interface AgeCurveCatalog {
  version: 'age-curves-v1';
  source: 'fictional-age-curves-v1';
  players: { playerId: string; ageCurves: Record<AgeGroup, AgeCurve> }[];
}
export interface AgeConfig {
  version: 'age-development-v1';
  enabled: boolean;
  groups: Record<
    AgeGroup,
    {
      growthMilliPerYear: number;
      declineMilliPerYear: number;
      declineRampAgeMilli: number;
    }
  >;
  growthAmount: { basePermille: number; talentPermille: number };
  abilityGroups: Record<CommonAbilityCode, AgeGroup>;
  positionGroup: AgeGroup;
  pitchGroups: Record<'control' | 'repeatability', AgeGroup>;
}
export interface AgeOutcome {
  playerId: string;
  ageMilli: number;
  groups: { group: AgeGroup; increaseMilli: number; decreaseMilli: number }[];
}
export interface AgeDevelopmentDay extends DevelopmentDay {
  aging: AgeOutcome[];
}
export interface AgeDevelopmentGrowthState {
  modelId: 'daily-development';
  version: 'daily-development-v3';
  schemaId: 'daily-development-state-v3';
  state: Omit<DevelopmentGrowthState['state'], 'days'> & {
    /** 年間量→日次量の端数。係数の変更や保存で失わない。 */
    agingRemainders: Record<string, Record<string, number>>;
    days: Record<string, AgeDevelopmentDay>;
  };
}
