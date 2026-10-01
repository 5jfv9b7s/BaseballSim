import type { Team } from '../game/types.ts';

/** 選手・能力の正本は球団名簿に一つだけ置く。二軍は編成の参照を持つ。 */
export interface FarmSquad {
  squadId: string;
  team: Omit<Team, 'side'>;
}

export interface FarmCompetition {
  version: 'farm-competition-v1';
  competitionId: string;
  statScope: 'farmRegular';
  startDate: string;
  endDate: string;
  benchLimit: number;
  squads: FarmSquad[];
}
