import { createPitchLearningWorld } from '../../src/world/engine.ts';
import { createSalaryObligations } from '../../src/finance/payroll.ts';
import {
  createTradeApplicationWorld,
  tradeApplicationRosterState,
} from '../../src/world/trade-application-state.ts';
import type { WorldTradeRequest } from '../../src/world/trade-application-types.ts';

/**
 * 実装済み世界の形を使う試験用入力。給与100円/残高100000円は架空の試験値。
 * ゲーム初期データ・現実の契約・正式な初期会計モデルには使用しない。
 */
export function applicationFixture(
  kind: 'batter' | 'pitcher' = 'batter',
  category: 'first' | 'farm' = 'first',
) {
  const source = structuredClone(createPitchLearningWorld());
  const definitions = source.definitions;
  const own = definitions.squads.find((s) => s.squadId === source.management.controlledSquadId)!;
  const partner = definitions.squads.find((s) => s.team.clubId !== own.team.clubId)!;
  const allPitchers = new Set([
    ...definitions.squads.flatMap((s) => s.team.pitcherIds),
    ...definitions.farm!.squads.flatMap((s) => s.team.pitcherIds),
  ]);
  const playerFacts = definitions.squads.flatMap((s) =>
    s.players.map((p) => ({
      playerId: p.playerId,
      canBat: !allPitchers.has(p.playerId),
      canPitch: allPitchers.has(p.playerId),
      foreignBaseStatus: s.registrationInputs!.find((r) => r.playerId === p.playerId)!
        .foreignBaseStatus,
    })),
  );
  const contractYears = playerFacts.map((p) => ({
    playerId: p.playerId,
    year: {
      contractId: 'test-salary-' + p.playerId,
      seasonId: definitions.seasonId,
      salaryYen: 100,
      guaranteed: true,
      applicableFrom: '2026-09-01',
      applicableUntil: '2026-10-01',
    },
  }));
  const obligations = contractYears.flatMap(({ playerId, year }) =>
    createSalaryObligations({
      sourceId: 'test-initial-salary',
      playerId,
      year,
      dueDate: '2026-09-30',
      modelVersion: 'salary-day-proration-v1',
      periods: [
        {
          payerClubId: source.registration.memberships.find((m) => m.playerId === playerId)!.clubId,
          coverageFrom: year.applicableFrom,
          coverageUntil: year.applicableUntil,
        },
      ],
    }),
  );
  const world = createTradeApplicationWorld(source, {
    asOf: { date: source.currentDate, order: 0 },
    playerFacts,
    approvals: [],
    finance: {
      salaryModelVersion: 'salary-day-proration-v1',
      contractYears,
      ledger: { cashEntries: [], obligations },
      budgets: definitions.squads.map((s) => ({
        clubId: s.team.clubId,
        seasonId: definitions.seasonId,
        openingBalance: { balanceYen: 100000, closedThrough: { date: '2026-09-01', order: 0 } },
        holds: [],
        futureSeasons: [],
      })),
    },
  });
  // 旧世界の二軍運用は登録対象外の投手も候補に持つ。新適用候補の試験では
  // 登録対象だけを割り当てる編成を明示する。製品側の自動補充規則ではない。
  for (const squad of tradeApplicationRosterState(world).squads) {
    const eligible = new Set(
      world.registration.registrations
        .filter(
          (r) => r.until === null && r.clubId === squad.clubId && r.category === squad.category,
        )
        .map((r) => r.playerId),
    );
    const pitchers = world.playerFacts
      .filter((p) => p.canPitch && eligible.has(p.playerId))
      .map((p) => p.playerId);
    const old = squad.pitchers.rotationSlots.filter((p) => p.playerId && eligible.has(p.playerId));
    const rotationIds = old.length ? old.map((p) => p.playerId!) : [pitchers[0]!];
    world.management.pitcherUsagePlans[squad.squadId] = {
      rotationSlots: rotationIds.map((playerId, index) => ({ slotNo: index + 1, playerId })),
      nextSlotNo: 1,
      reliefRoles: pitchers
        .filter((id) => !rotationIds.includes(id))
        .map((playerId, index) => ({ playerId, role: 'relief', priority: index + 1 })),
    };
    world.restControl.pitcherUsagePlans[squad.squadId]!.individualRest =
      squad.individualRest.filter((p) => eligible.has(p.playerId));
    world.reliefControl.teamPolicies[squad.squadId]!.reliefRoles = squad.conditionalRelief.filter(
      (p) => eligible.has(p.playerId),
    );
  }
  const squads = tradeApplicationRosterState(world).squads;
  const a = squads.find((s) => s.clubId === own.team.clubId && s.category === category)!;
  const b = squads.find((s) => s.clubId === partner.team.clubId && s.category === category)!;
  const id = (s: typeof a) =>
    kind === 'batter'
      ? s.lineup.battingOrder[0]!.playerId!
      : s.pitchers.rotationSlots[0]!.playerId!;
  const moves = [
    { playerId: id(a), fromClubId: a.clubId, toClubId: b.clubId },
    { playerId: id(b), fromClubId: b.clubId, toClubId: a.clubId },
  ];
  const request: WorldTradeRequest = {
    transactionId: 'test-world-trade',
    effectiveAt: { date: world.currentDate, order: 1 },
    clubIds: [a.clubId, b.clubId],
    moves,
    cashTransfer: { payerClubId: a.clubId, payeeClubId: b.clubId, amountYen: 1000 },
    choices: moves.map((m) => ({
      playerId: m.playerId,
      clubId: m.toClubId,
      category,
      preference: 'auto',
    })),
    squadReplacements: squads
      .filter((s) => [a.clubId, b.clubId].includes(s.clubId))
      .map((s) => {
        const out = moves.find((m) => m.fromClubId === s.clubId)!;
        const incoming = moves.find((m) => m.toClubId === s.clubId)!;
        return {
          ...s,
          lineup: {
            ...s.lineup,
            battingOrder: s.lineup.battingOrder.map((row) =>
              row.playerId === out.playerId ? { ...row, playerId: incoming.playerId } : row,
            ),
            defense: s.lineup.defense.map((row) =>
              row.playerId === out.playerId ? { ...row, playerId: incoming.playerId } : row,
            ),
          },
          pitchers: {
            ...s.pitchers,
            rotationSlots: s.pitchers.rotationSlots.map((row) =>
              row.playerId === out.playerId ? { ...row, playerId: incoming.playerId } : row,
            ),
            reliefRoles: s.pitchers.reliefRoles.map((row) =>
              row.playerId === out.playerId ? { ...row, playerId: incoming.playerId } : row,
            ),
          },
          individualRest: s.individualRest.filter((r) => r.playerId !== out.playerId),
          conditionalRelief: s.conditionalRelief.filter((r) => r.playerId !== out.playerId),
        };
      }),
  };
  return { source, world, request, ownSquadId: a.squadId, partnerSquadId: b.squadId };
}
