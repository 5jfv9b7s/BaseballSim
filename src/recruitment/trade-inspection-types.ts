/** UIから渡すのは提案条件だけ。所属・資格・契約をUIの申告で上書きしない。 */
export interface TradeInspectionProposal {
  partnerSquadId: string;
  outgoingIds: string[];
  incomingIds: string[];
  cashYen: number;
}

export interface TradeInspectionRequest {
  requestId: string;
  localWorldId: string;
  worldId: string;
  expectedStateRevision: number;
  proposal: TradeInspectionProposal;
}

export interface TradePlayerImpact {
  playerId: string;
  fromClubId: string;
  toClubId: string;
  membershipKnown: boolean;
  registration: { category: 'first' | 'farm'; nextFirstEligibleOn: string | null } | null;
  preference: 'firstFixed' | 'farmFixed' | 'auto' | null;
  roles: {
    squadId: string;
    squadName: string;
    battingSlots: number[];
    positions: string[];
    rotationSlots: number[];
    relief: boolean;
  }[];
  /** 現在または将来の、未開始試合の明示指定だけ。過去の実績ではない。 */
  futureGameIds: string[];
}

export interface TradeInspectionReport {
  modelVersion: 'trade-inspection-v1';
  requestId: string;
  localWorldId: string;
  worldId: string;
  stateRevision: number;
  currentDate: string;
  /** 現行世界には契約・資金・交渉記録がなく、成立可能とは判定しない。 */
  status: 'blocked';
  blockers: {
    code:
      | 'selection'
      | 'dayUnavailable'
      | 'membershipUnavailable'
      | 'registrationUnavailable'
      | 'contractsUnavailable'
      | 'budgetUnavailable'
      | 'negotiationUnavailable'
      | 'formationRequired';
    message: string;
    playerId?: string;
  }[];
  counts: { clubId: string; before: number; after: number }[] | null;
  players: TradePlayerImpact[];
}

export type InspectTrade = (proposal: TradeInspectionProposal) => Promise<TradeInspectionReport>;
