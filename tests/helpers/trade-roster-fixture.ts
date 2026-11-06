import { createSalaryObligations } from '../../src/finance/payroll.ts';
import type { TradeChangeSetInput } from '../../src/recruitment/trade-change-set.ts';
import type { TradeRosterInput, TradeSquadPlan } from '../../src/recruitment/trade-roster-types.ts';

/** 球団・選手・金額はすべて試験専用。ゲーム初期dataや実在選手の査定ではない。 */
export const battingRoles = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'] as const;
export const batterId = (club: string, slot: number) => `${club}-b${slot}`;
export const pitcherId = (club: string, slot: number) => `${club}-p${slot}`;

export function replaceBatter(
  squad: TradeSquadPlan,
  outgoingId: string,
  incomingId: string,
): TradeSquadPlan {
  return {
    ...squad,
    lineup: {
      ...squad.lineup,
      battingOrder: squad.lineup.battingOrder.map((slot) =>
        slot.playerId === outgoingId ? { ...slot, playerId: incomingId } : slot,
      ),
      defense: squad.lineup.defense.map((slot) =>
        slot.playerId === outgoingId ? { ...slot, playerId: incomingId } : slot,
      ),
    },
  };
}

export function rosterFixture(): TradeRosterInput {
  const knownClubIds = ['test-a', 'test-b', 'test-c'];
  const from = { date: '2026-02-01', order: 0 };
  const squads: TradeSquadPlan[] = knownClubIds.map((clubId) => ({
    squadId: `${clubId}-first`,
    clubId,
    category: 'first',
    benchLimit: 26,
    lineup: {
      dhEnabled: true,
      battingOrder: battingRoles.map((battingRole, index) => ({
        slotNo: index + 1,
        playerId: batterId(clubId, index),
        battingRole,
      })),
      defense: [
        { positionCode: 'P', playerId: null },
        ...battingRoles
          .filter((role) => role !== 'DH')
          .map((positionCode, index) => ({ positionCode, playerId: batterId(clubId, index) })),
      ],
    },
    pitchers: {
      rotationSlots: [{ slotNo: 1, playerId: pitcherId(clubId, 0) }],
      nextSlotNo: 1,
      reliefRoles: [{ playerId: pitcherId(clubId, 1), role: 'relief', priority: 1 }],
    },
    individualRest: [{ playerId: pitcherId(clubId, 1), mode: 'inherit' }],
    conditionalRelief: [
      {
        playerId: pitcherId(clubId, 1),
        role: 'relief',
        priority: 1,
        conditions: {
          startInning: 1,
          endInning: 12,
          scoreStates: ['lead', 'tied', 'trailing'],
          minScoreDifference: null,
          maxScoreDifference: null,
        },
      },
    ],
  }));
  const players = knownClubIds.flatMap((clubId) => [
    ...battingRoles.map((_, index) => ({
      playerId: batterId(clubId, index),
      canBat: true,
      canPitch: false,
      foreignBaseStatus: 'exempt' as const,
    })),
    ...[0, 1].map((index) => ({
      playerId: pitcherId(clubId, index),
      canBat: false,
      canPitch: true,
      foreignBaseStatus: 'exempt' as const,
    })),
  ]);
  const memberships = knownClubIds.flatMap((clubId) =>
    players
      .filter((p) => p.playerId.startsWith(clubId + '-'))
      .map((p) => ({
        membershipId: `test-membership-${p.playerId}`,
        playerId: p.playerId,
        clubId,
        from: { ...from },
        until: null,
        entryReason: 'initial' as const,
      })),
  );
  const registrations = memberships.map((m) => ({
    registrationId: `test-registration-${m.playerId}`,
    playerId: m.playerId,
    clubId: m.clubId,
    category: 'first' as const,
    from: { ...from },
    until: null,
    nextFirstEligibleOn: null,
    sourceId: 'test-initial',
  }));
  const moves = [
    { playerId: batterId('test-a', 0), fromClubId: 'test-a', toClubId: 'test-b' },
    { playerId: batterId('test-b', 0), fromClubId: 'test-b', toClubId: 'test-a' },
  ];
  return {
    transactionId: 'test-trade',
    dayPhase: 'beforeGames',
    effectiveAt: { date: '2026-06-06', order: 3 },
    clubIds: ['test-a', 'test-b'],
    knownClubIds,
    moves,
    players,
    rules: {
      version: 'registration-rules-v1',
      clubLimit: 70,
      firstLimit: 31,
      benchLimit: 26,
      foreignFirstLimit: 5,
      foreignBenchLimit: 4,
      reentryDays: 10,
    },
    state: {
      memberships,
      registrations,
      preferences: moves.map((move) => ({
        clubId: move.fromClubId,
        playerId: move.playerId,
        preference: 'firstFixed',
        updatedAt: { ...from },
      })),
      squads,
      overrides: [
        {
          gameId: 'test-old-game',
          squadId: squads[0]!.squadId,
          date: '2026-06-01',
          status: 'completed',
          lineup: structuredClone(squads[0]!.lineup),
          starterId: pitcherId('test-a', 0),
          benchIds: memberships.filter((m) => m.clubId === 'test-a').map((m) => m.playerId),
        },
        {
          gameId: 'test-future-game',
          squadId: squads[0]!.squadId,
          date: '2026-06-07',
          status: 'scheduled',
          lineup: structuredClone(squads[0]!.lineup),
          starterId: pitcherId('test-a', 0),
          benchIds: memberships.filter((m) => m.clubId === 'test-a').map((m) => m.playerId),
        },
      ],
    },
    choices: moves.map((move) => ({
      playerId: move.playerId,
      clubId: move.toClubId,
      category: 'first',
      preference: 'auto',
    })),
    squadReplacements: squads
      .filter((squad) => squad.clubId !== 'test-c')
      .map((squad) =>
        replaceBatter(
          squad,
          batterId(squad.clubId, 0),
          batterId(squad.clubId === 'test-a' ? 'test-b' : 'test-a', 0),
        ),
      ),
  };
}

export function changeSetFixture(): TradeChangeSetInput {
  const roster = rosterFixture();
  // 組合せ処理の試験に必要な交換対象2人の給与。全選手のゲーム初期契約ではない。
  const contractYears = roster.moves.map((move) => ({
    playerId: move.playerId,
    year: {
      contractId: `test-contract-${move.playerId}`,
      seasonId: 'test-season',
      salaryYen: 100,
      guaranteed: true,
      applicableFrom: '2026-06-01',
      applicableUntil: '2026-06-11',
    },
  }));
  const obligations = contractYears.flatMap(({ playerId, year }) =>
    createSalaryObligations({
      sourceId: 'test-initial-salary',
      playerId,
      year,
      periods: [
        {
          payerClubId: roster.moves.find((move) => move.playerId === playerId)!.fromClubId,
          coverageFrom: year.applicableFrom,
          coverageUntil: year.applicableUntil,
        },
      ],
      dueDate: '2026-06-10',
      modelVersion: 'salary-day-proration-v1',
    }),
  );
  const budget = (clubId: string) => ({
    clubId,
    seasonId: 'test-season',
    openingBalance: { balanceYen: 500, closedThrough: { date: '2026-06-05', order: 0 } },
    holds: [],
    futureSeasons: [],
  });
  const { transactionId, effectiveAt, clubIds, moves, ...rosterData } = roster;
  return {
    roster: rosterData,
    finance: {
      transactionId,
      effectiveAt,
      clubIds,
      moves,
      seasonId: 'test-season',
      contractYears,
      ledger: { cashEntries: [], obligations },
      cashTransfer: { payerClubId: 'test-a', payeeClubId: 'test-b', amountYen: 0 },
      budgets: [budget('test-a'), budget('test-b')],
      salaryModelVersion: 'salary-day-proration-v1',
    },
  };
}
