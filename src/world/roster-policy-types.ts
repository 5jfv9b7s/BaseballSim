import type { GameMoment } from './registration-types.ts';

/** データ設計6.1。希望は資格・実登録・当日ベンチとは独立する。 */
export type RosterPreference = 'firstFixed' | 'farmFixed' | 'auto';
export type RosterChangeMode = 'manual' | 'auto';

export interface RosterPolicyInput {
  changeMode: RosterChangeMode;
  preferences: { playerId: string; preference: RosterPreference }[];
}

export interface RosterControl {
  version: 'fixed-preferences-v1';
  policies: Record<
    string,
    {
      clubId: string;
      changeMode: RosterChangeMode;
      policyRevision: number;
    }
  >;
  preferences: {
    clubId: string;
    playerId: string;
    preference: RosterPreference;
    updatedAt: GameMoment;
  }[];
}

export type RosterPolicyAction = RosterPolicyInput & {
  kind: 'setRosterPolicy';
  squadId: string;
};
