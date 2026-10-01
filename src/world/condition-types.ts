import type { RngState } from '../engine/types.ts';

export interface ConditionConfig {
  version: 'condition-smooth-v1';
  neutralMilli: 50000;
  targetSpreadMilli: number;
  reversionPermille: number;
  minSegmentDays: number;
  maxSegmentDays: number;
  stageBoundariesMilli: [number, number, number, number];
}

/** 架空の初期状態。最初の波の終点・長さも選手ごとに編集できる。 */
export interface ConditionInput {
  playerId: string;
  conditionMilli: number;
  targetMilli: number;
  durationDays: number;
}

export interface ConditionState {
  conditionMilli: number;
  lastUpdatedOn: string;
  conditionModelVersion: 'condition-smooth-v1';
  conditionModelState: {
    modelId: 'condition-smooth';
    version: 'condition-smooth-v1';
    schemaId: 'condition-smooth-state-v1';
    state: {
      fromMilli: number;
      targetMilli: number;
      elapsedDays: number;
      durationDays: number;
      rng: RngState;
    };
  };
}

export interface ConditionSample {
  playerId: string;
  gameId: string;
  clubId: string;
  squadId: string;
  registrationId: string;
  date: string;
  gameOrder: number;
  conditionMilli: number;
}

export interface ConditionWorldState {
  version: 'condition-smooth-v1';
  players: Record<string, ConditionState>;
  /** gameId -> 当該チームの登録選手全員。ベンチ外・未出場も記録する。 */
  samples: Record<string, ConditionSample[]>;
}

export interface ConditionComparison {
  requestedGames: 5 | 10;
  actualGames: number;
  deltaMilli: number | null;
  fromDate: string | null;
  toDate: string | null;
  firstGameId: string | null;
  lastGameId: string | null;
}
