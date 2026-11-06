import { ensure, integer } from '../engine/validation.ts';
import { uniqueFinanceIds } from '../finance/validation.ts';
import { createGame } from '../game/engine.ts';
import { performanceFixture } from '../game/performance.ts';
import { checkTradeLineup } from '../recruitment/trade-roster-lineups.ts';
import { tradeApplicationRosterState } from './trade-application-state.ts';
import { tradeGameRoster, tradeSquadRoster } from './trade-squad-roster.ts';
import { validateTradeMatchState } from './trade-match-state.ts';
import { applyGrowthValues } from './growth-fixture.ts';
import { resolveFielderRestForPlayers } from './fielder-rest.ts';
import { evaluateRest, restRank } from './rest.ts';
import { attachReliefPolicy } from './relief.ts';
import { attachBullpen } from './bullpen.ts';
import { performanceSnapshot } from './performance.ts';
import { scheduledSeed } from './identity.ts';
import { worldSquad } from './squads.ts';
import type { GameFixture, GameRecord, TeamSide } from '../game/types.ts';
import type { GameRoster } from './registration-types.ts';
import type { IdealLineup } from './types.ts';
import type { TradeApplicationWorld } from './trade-application-types.ts';

export interface TradeMatchRequest {
  gameId: string;
  /** 両チームの明示ベンチ。自動選出・CPUの編成判断とは分ける。 */
  benchIds: Record<TeamSide, string[]>;
}

export interface PreparedTradeMatch {
  modelVersion: 'trade-match-preparation-v1';
  game: GameRecord;
  rosters: Record<TeamSide, GameRoster>;
}

/**
 * 移籍後の現在所属・登録と個人状態から、同じ1球エンジンへの入力を作る。
 * 読取だけの準備。世界への開始確定、イベント負荷、日次進行、保存は行わない。
 */
export function prepareTradeMatch(
  world: TradeApplicationWorld,
  request: TradeMatchRequest,
): PreparedTradeMatch {
  const defs = world.initialDefinitions;
  ensure(world.version === 'trade-application-world-v1', '対応する移籍候補の世界が必要です');
  const scheduled = defs.schedule.find((g) => g.gameId === request.gameId);
  ensure(
    scheduled && scheduled.date === world.currentDate && world.dayPlan.date === world.currentDate,
    '当日の日程にある試合だけを準備できます',
  );
  integer(world.seed, 1, 0xffffffff, '世界seed');
  integer(world.dayPlan.cursor, 0, world.dayPlan.gameIds.length, '日次cursor');
  uniqueFinanceIds(world.dayPlan.gameIds, '日次試合のID');
  const gameIndex = world.dayPlan.gameIds.indexOf(request.gameId);
  ensure(gameIndex >= world.dayPlan.cursor, '日次計画に未処理の対象試合がありません');
  ensure(!world.games[request.gameId], '開始済みの試合入力・乱数は作り直せません');
  const controlledClubId = defs.squads.find((s) => s.squadId === world.management.controlledSquadId)
    ?.team.clubId;
  ensure(controlledClubId, '担当球団がありません');
  const plans = tradeApplicationRosterState(world);

  const resolve = (side: TeamSide) => {
    const squadId = side === 'away' ? scheduled.awaySquadId : scheduled.homeSquadId;
    const squad = plans.squads.find((s) => s.squadId === squadId);
    ensure(squad, '当日のチーム設定がありません');
    const roster = tradeSquadRoster(world, squadId);
    validateTradeMatchState(world, roster);
    const bench = request.benchIds[side];
    ensure(Array.isArray(bench), '両チームのベンチを明示してください');
    uniqueFinanceIds(bench, '試合ベンチのID');
    const controlled = squad.clubId === controlledClubId;
    const savedBench = controlled ? world.registration.benchOverrides[request.gameId] : undefined;
    if (savedBench) {
      uniqueFinanceIds(savedBench, '保存済みベンチのID');
      ensure(
        savedBench.length === bench.length && savedBench.every((id) => bench.includes(id)),
        '保存済みの当日ベンチ指定と異なります',
      );
    }
    const explicitLineup = controlled ? world.gameLineups[request.gameId] : undefined;
    const desired = explicitLineup ?? squad.lineup;
    const issues = checkTradeLineup(squad, desired, new Set(roster.registeredPlayerIds), {
      players: world.playerFacts,
      rules: defs.registrationRules!,
    });
    ensure(!issues.length, issues[0]?.message ?? '当日打順を解決できません');
    const rest = Object.fromEntries(
      roster.registeredPlayerIds
        .filter((id) => world.playerFacts.find((p) => p.playerId === id)!.canPitch)
        .map((id) => [id, evaluateRest(world, squadId, id)]),
    );
    const pitchers = squad.pitchers;
    const planned = pitchers.rotationSlots[pitchers.nextSlotNo! - 1]!.playerId!;
    const priority = [
      ...new Set([
        planned,
        ...pitchers.reliefRoles.map((r) => r.playerId),
        ...pitchers.rotationSlots.map((r) => r.playerId!),
      ]),
    ];
    priority.sort((a, b) => restRank(rest[a]!) - restRank(rest[b]!));
    const explicitStarter = controlled
      ? world.management.starterOverrides[request.gameId]
      : undefined;
    const starter = explicitStarter ?? priority.find((id) => bench.includes(id));
    ensure(starter, 'ベンチに先発可能な投手がいません');
    const selected = tradeGameRoster(world, {
      squadId,
      benchIds: bench,
      startingPitcherId: starter,
      lineup: desired,
    });
    const lineup: IdealLineup = {
      ...structuredClone(desired),
      battingOrder: desired.battingOrder.map((slot) => ({ ...slot, playerId: slot.playerId! })),
    };
    const fielder = resolveFielderRestForPlayers(
      world,
      squadId,
      roster.basePlayers.filter(
        (p) => world.playerFacts.find((f) => f.playerId === p.playerId)!.canBat,
      ),
      bench,
      lineup,
      !!explicitLineup,
    );
    const relief = selected.reliefPitcherIds.sort(
      (a, b) => restRank(rest[a]!) - restRank(rest[b]!),
    );
    for (const decision of Object.values(rest)) {
      const id = decision.playerId;
      decision.outcome =
        id === starter
          ? 'starter'
          : relief.includes(id)
            ? decision.requested === 'available'
              ? 'relief'
              : 'preferRest'
            : bench.includes(id)
              ? 'notSelected'
              : decision.requested === 'benchRest'
                ? 'benchRest'
                : 'notSelected';
      if (decision.requested !== 'available') {
        if (id === explicitStarter) decision.exception = '当日の手動先発指定を優先';
        else if (id === starter) decision.exception = '先発を確保するため休養希望を保留';
        else if (bench.includes(id) && decision.requested === 'benchRest')
          decision.exception = '明示したベンチ指定を優先し、救援は休養優先';
      }
    }
    const team = {
      side,
      clubId: squad.clubId,
      name: worldSquad(defs, squadId)!.team.name,
      lineup: fielder.lineup.battingOrder.map((slot) => ({
        playerId: slot.playerId,
        position: slot.battingRole,
      })),
      pitcherIds: [starter, ...relief],
    };
    const active = [...team.lineup.map((s) => s.playerId), ...team.pitcherIds];
    const gameRoster: GameRoster = {
      squadId,
      playerIds: [...bench],
      participants: selected.basePlayers.map((p) => ({
        playerId: p.playerId,
        displayName: p.familyName + ' ' + p.givenName,
        appeared: false,
      })),
      fielderRestSnapshot: fielder.snapshot,
      restSnapshot: {
        version: 'pitcher-rest-v1',
        date: world.currentDate,
        policyRevision: world.restControl.teamPolicies[squadId]!.policyRevision,
        decisions: Object.values(rest),
      },
    };
    return {
      team,
      roster: gameRoster,
      players: selected.basePlayers.filter((p) => active.includes(p.playerId)),
      pitches: selected.basePitches.filter((p) => active.includes(p.playerId)),
    };
  };
  const away = resolve('away'),
    home = resolve('home');
  ensure(away.team.clubId !== home.team.clubId, '同じ球団の一二軍間の試合には対応していません');
  const fixture: GameFixture = {
    initialDatasetVersion: 'game-fixture-v2',
    pitchProfiles: structuredClone(defs.pitchProfiles!),
    players: [...away.players, ...home.players],
    pitches: [...away.pitches, ...home.pitches],
    teams: { away: away.team, home: home.team },
    clubs: [away, home].map(({ team }) => ({
      clubId: team.clubId,
      name: team.name,
      playerIds: [...team.lineup.map((s) => s.playerId), ...team.pitcherIds],
    })),
  };
  // 旧世界を可変な別正本として作らず、純粋関数が読む項目だけを渡す。
  const inputs = {
    definitions: defs,
    currentDate: world.currentDate,
    growth: world.growth,
    condition: world.condition,
    physical: world.physical,
    restControl: world.restControl,
    reliefControl: world.reliefControl,
  };
  applyGrowthValues(inputs, fixture, true);
  attachReliefPolicy(inputs, request.gameId, fixture);
  attachBullpen(inputs, request.gameId, fixture);
  const game = createGame(
    scheduledSeed(world.seed, request.gameId),
    fixture,
    'game-prototype-v11',
    defs.matchConfig,
    defs.errorConfig,
  );
  game.state.gameId = request.gameId;
  game.state.rng.streamId = request.gameId + ':attempt:1';
  game.performance = performanceSnapshot(inputs, request.gameId, game.fixture);
  performanceFixture(game);
  return structuredClone({
    modelVersion: 'trade-match-preparation-v1',
    game,
    rosters: { away: away.roster, home: home.roster },
  });
}
