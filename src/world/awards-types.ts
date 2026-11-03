import type { Position } from '../game/types.ts';
import type { StatKey } from './types.ts';

/** 選考用の試作規則。試合・成長の係数とは独立させ、参考表示で使う。確定受賞履歴としては保存しない。 */
export interface AwardsRules {
  version: 'season-awards-v1';
  battingRolePaPerTeamGame: number;
  pitchingOutsPerTeamGame: number;
  fieldingOutsPerTeamGame: number;
  ties: 'allCoWinners';
  battingOrder: readonly ['ops', 'plateAppearances'];
  pitchingOrder: readonly ['era', 'outsRecorded'];
  fieldingOrder: readonly ['fieldingPercentage', 'chances'];
}
export interface AwardEvidence {
  label: string;
  numerator: string;
  denominator: string;
  format: 'count' | 'average' | 'era' | 'innings';
  direction: 'higher' | 'lower';
}
export interface AwardWinner {
  playerId: string;
  squadId: string;
  clubId: string;
  displayName: string;
  teamName: string;
  actual: number;
  required: number | null;
  evidence: AwardEvidence[];
}
export interface SeasonAward {
  awardId: string;
  code: string;
  name: string;
  category: 'title' | 'bestNine' | 'goldGlove';
  position: Position | null;
  status: 'awarded' | 'noEligiblePlayer' | 'notRecorded';
  eligibleCount: number;
  winners: AwardWinner[];
}
export interface SeasonHonors {
  version: 'reference-season-honors-v1';
  seasonId: string;
  competitionId: string;
  statScope: StatKey['statScope'];
  assessedOn: string;
  rules: AwardsRules;
  leagues: { leagueId: string; displayName: string; awards: SeasonAward[] }[];
}
export interface WorldHonors {
  firstRegular: SeasonHonors | null;
  farmRegular: SeasonHonors | null;
}
