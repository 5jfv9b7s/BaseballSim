/** データ設計書2.2/6.1/8.2の、単年度・移籍なしで使用する射影。 */
export interface GameMoment {
  date: string;
  order: number;
}

export interface RegistrationRules {
  version: 'registration-rules-v1';
  clubLimit: number;
  firstLimit: number;
  benchLimit: number;
  foreignFirstLimit: number;
  foreignBenchLimit: number;
  reentryDays: number;
}

export interface RegistrationInput {
  playerId: string;
  category: 'first' | 'farm';
  /** 国籍・氏名から推測しない。初期資格を明示する。 */
  foreignBaseStatus: 'subject' | 'exempt';
}

export interface ClubMembership {
  membershipId: string;
  playerId: string;
  clubId: string;
  from: GameMoment;
  until: GameMoment | null;
  entryReason: 'initial';
}

export interface PlayerRegistration {
  registrationId: string;
  playerId: string;
  clubId: string;
  category: 'first' | 'farm';
  from: GameMoment;
  until: GameMoment | null;
  nextFirstEligibleOn: string | null;
  sourceId: string;
}

export interface GameRoster {
  restSnapshot?: import('./rest-types.ts').RestSnapshot;
  squadId: string;
  playerIds: string[];
  /** ベンチだけでは出場にしない。実際の打順・登板から更新する。 */
  participants: { playerId: string; displayName: string; appeared: boolean }[];
}

export interface RegistrationState {
  version: 'club-registration-v1';
  memberships: ClubMembership[];
  registrations: PlayerRegistration[];
  /** 当日の担当球団だけの指定。理想編成・一軍登録とは独立する。 */
  benchOverrides: Record<string, string[]>;
  gameRosters: Record<string, Record<'away' | 'home', GameRoster>>;
}

export type RegistrationAction =
  | {
      kind: 'setRegistrations';
      squadId: string;
      changes: { playerId: string; category: 'first' | 'farm' }[];
    }
  | { kind: 'setGameBench'; squadId: string; gameId: string; playerIds: string[] | null };
