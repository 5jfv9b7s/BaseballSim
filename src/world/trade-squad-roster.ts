import { compareMoments, requireFinance, uniqueFinanceIds } from '../finance/validation.ts';
import { checkTradeSquad, checkTradeLineup } from '../recruitment/trade-roster-lineups.ts';
import type { TradeLineup } from '../recruitment/trade-roster-types.ts';
import { tradeApplicationRosterState } from './trade-application-state.ts';
import type { TradeApplicationWorld, TradeSquadRoster } from './trade-application-types.ts';

/** 初期球団のplayersを現在所属に流用せず、現在の所属・登録と全選手資料を結ぶ。 */
export function tradeSquadRoster(world: TradeApplicationWorld, squadId: string): TradeSquadRoster {
  requireFinance(
    world.rosterAsOf.date === world.currentDate,
    '名簿の基準日を現在日付へ更新してください',
  );
  const state = tradeApplicationRosterState(world);
  const squad = state.squads.find((s) => s.squadId === squadId);
  requireFinance(squad, '対象チームの記録がありません');
  const rules = world.initialDefinitions.registrationRules!;
  const memberships = state.memberships.filter(
    (m) =>
      m.until === null &&
      m.clubId === squad.clubId &&
      compareMoments(m.from, world.rosterAsOf) <= 0,
  );
  const clubPlayerIds = memberships.map((m) => m.playerId);
  uniqueFinanceIds(clubPlayerIds, '現在所属の選手ID');
  const registrations = state.registrations.filter(
    (r) =>
      r.until === null &&
      r.clubId === squad.clubId &&
      compareMoments(r.from, world.rosterAsOf) <= 0,
  );
  requireFinance(
    registrations.every((r) => clubPlayerIds.includes(r.playerId)),
    '所属外の選手の登録があります',
  );
  const eligible = registrations
    .filter((r) => r.category === squad.category)
    .map((r) => r.playerId);
  uniqueFinanceIds(eligible, '現在登録の選手ID');
  const issues = checkTradeSquad(squad, registrations, { rules, players: world.playerFacts });
  requireFinance(!issues.length, issues[0]?.message ?? '試合用の編成を解決できません');
  const players = world.initialDefinitions.squads.flatMap((s) => s.players);
  const pitches = world.initialDefinitions.squads.flatMap((s) => s.pitches);
  uniqueFinanceIds(
    players.map((p) => p.playerId),
    '選手資料のID',
  );
  uniqueFinanceIds(
    pitches.map((p) => p.pitchId),
    '持ち球資料のID',
  );
  requireFinance(
    eligible.every((id) => players.some((p) => p.playerId === id)),
    '登録選手の能力資料がありません',
  );
  const pitchers = [
    ...squad.pitchers.rotationSlots.map((r) => r.playerId!),
    ...squad.pitchers.reliefRoles.map((r) => r.playerId),
  ];
  requireFinance(
    pitchers.every((id) => pitches.some((p) => p.playerId === id)),
    '投手の持ち球資料がありません',
  );
  const lineup = squad.lineup.battingOrder.map((b) => ({
    playerId: b.playerId!,
    position: b.battingRole,
  }));
  return structuredClone({
    modelVersion: 'trade-squad-roster-v1',
    squadId,
    clubId: squad.clubId,
    category: squad.category,
    benchLimit: squad.benchLimit,
    clubPlayerIds,
    registeredPlayerIds: eligible,
    lineup,
    pitchers: squad.pitchers,
    reserveBatterIds: eligible.filter(
      (id) =>
        world.playerFacts.find((p) => p.playerId === id)?.canBat &&
        !lineup.some((b) => b.playerId === id),
    ),
    basePlayers: players.filter((p) => eligible.includes(p.playerId)),
    basePitches: pitches.filter((p) => eligible.includes(p.playerId)),
  });
}

/** ベンチは呼出元の明示選択を検査。登録全員や空き枠を勝手にベンチへ入れない。 */
export function tradeGameRoster(
  world: TradeApplicationWorld,
  selection: {
    squadId: string;
    benchIds: string[];
    startingPitcherId: string;
    lineup?: TradeLineup;
  },
) {
  const roster = tradeSquadRoster(world, selection.squadId);
  const { benchIds, startingPitcherId } = selection;
  let lineup = roster.lineup;
  if (selection.lineup) {
    const squad = tradeApplicationRosterState(world).squads.find(
      (s) => s.squadId === selection.squadId,
    )!;
    const issues = checkTradeLineup(squad, selection.lineup, new Set(roster.registeredPlayerIds), {
      players: world.playerFacts,
      rules: world.initialDefinitions.registrationRules!,
    });
    requireFinance(!issues.length, issues[0]?.message ?? '当日の打順を解決できません');
    lineup = selection.lineup.battingOrder.map((b) => ({
      playerId: b.playerId!,
      position: b.battingRole,
    }));
  }
  uniqueFinanceIds(benchIds, '試合ベンチの選手ID');
  requireFinance(
    benchIds.length <= roster.benchLimit &&
      benchIds.every((id) => roster.registeredPlayerIds.includes(id)),
    'ベンチの人数・所属・登録を確認してください',
  );
  const foreign = benchIds.filter(
    (id) => world.playerFacts.find((p) => p.playerId === id)?.foreignBaseStatus === 'subject',
  );
  requireFinance(
    roster.category !== 'first' ||
      foreign.length <= world.initialDefinitions.registrationRules!.foreignBenchLimit,
    '外国人ベンチ枠を超えています',
  );
  requireFinance(
    lineup.every((b) => benchIds.includes(b.playerId)) &&
      benchIds.includes(startingPitcherId) &&
      world.playerFacts.some((p) => p.playerId === startingPitcherId && p.canPitch),
    '先発打順と先発投手をベンチに含めてください',
  );
  const reliefPitcherIds = [...roster.pitchers.reliefRoles]
    .sort((a, b) => a.priority - b.priority)
    .map((p) => p.playerId)
    .filter((id) => benchIds.includes(id) && id !== startingPitcherId);
  return structuredClone({
    modelVersion: 'trade-game-roster-v1' as const,
    squadId: roster.squadId,
    clubId: roster.clubId,
    benchIds,
    startingPitcherId,
    lineup,
    reliefPitcherIds,
    basePlayers: roster.basePlayers.filter((p) => benchIds.includes(p.playerId)),
    basePitches: roster.basePitches.filter((p) => benchIds.includes(p.playerId)),
  });
}
