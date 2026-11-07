import assert from 'node:assert/strict';
import test from 'node:test';
import { tradePlayView } from '../src/world/trade-play-view.ts';
import { tradeApplicationRosterState } from '../src/world/trade-application-state.ts';
import { tradeSquadRoster } from '../src/world/trade-squad-roster.ts';
import { gameFixture, beginCommand, applied } from './helpers/trade-game-fixture.ts';
import { committedTradeSaveFixture } from './helpers/trade-save-fixture.ts';
import type { TradeSavedState } from '../src/world/trade-save-validation.ts';

const read = (snapshot: TradeSavedState, pendingCommands = 0) => ({
  snapshot,
  pendingCommands,
  saving: false,
  reloadRequired: false,
});

test('ベンチ表示は両軍の現在登録を射影し、試合・RNG・保存元を変更しない', () => {
  const f = gameFixture(),
    before = structuredClone(f.initial);
  const view = tradePlayView(read(f.initial));
  assert.ok(view.matchSetup);
  const scheduled = f.initial.state.initialDefinitions.schedule.find(
    (g) => g.gameId === view.nextGameId,
  )!;
  for (const side of ['away', 'home'] as const) {
    const team: NonNullable<typeof view.matchSetup>['sides']['away'] = view.matchSetup.sides[side];
    const squadId = side === 'away' ? scheduled.awaySquadId : scheduled.homeSquadId;
    assert.equal(team.squadId, squadId);
    assert.deepEqual(
      team.players.map((p) => p.playerId),
      tradeSquadRoster(f.initial.state, squadId).registeredPlayerIds,
    );
    assert.equal(team.savedBenchIds, null);
    assert.ok(view.teams.some((t) => t.squadId === squadId));
  }
  view.matchSetup.sides.away.players[0]!.name = '表示側の変更';
  assert.deepEqual(f.initial, before);
});

test('保存済みの当日ベンチ・打順・先発指定を表示し、自動選択に置き換えない', () => {
  const f = gameFixture(),
    world = f.initial.state,
    begin = beginCommand(f.initial);
  const scheduled = world.initialDefinitions.schedule.find((g) => g.gameId === begin.gameId)!;
  const controlledClub = world.initialDefinitions.squads.find(
    (s) => s.squadId === world.management.controlledSquadId,
  )!.team.clubId;
  const plans = tradeApplicationRosterState(world);
  const side =
    plans.squads.find((s) => s.squadId === scheduled.awaySquadId)!.clubId === controlledClub
      ? 'away'
      : 'home';
  const squadId = side === 'away' ? scheduled.awaySquadId : scheduled.homeSquadId;
  const roster = tradeSquadRoster(world, squadId);
  world.registration.benchOverrides[begin.gameId] = [...begin.benchIds[side]];
  world.gameLineups[begin.gameId] = structuredClone(
    plans.squads.find((s) => s.squadId === squadId)!.lineup,
  ) as (typeof world.gameLineups)[string];
  world.management.starterOverrides[begin.gameId] =
    roster.pitchers.rotationSlots[roster.pitchers.nextSlotNo! - 1]!.playerId!;
  const projected = tradePlayView(read(f.initial)).matchSetup!.sides[side];
  assert.deepEqual(projected.savedBenchIds, begin.benchIds[side]);
  assert.equal(projected.lineupSource, 'gameOverride');
  assert.equal(projected.explicitStarterId, world.management.starterOverrides[begin.gameId]);
  projected.savedBenchIds!.pop();
  assert.deepEqual(world.registration.benchOverrides[begin.gameId], begin.benchIds[side]);
});

test('移籍後の試合候補は初期の球団別名簿へ戻らず現在所属を表示する', async () => {
  const f = await committedTradeSaveFixture();
  const view = tradePlayView(read(f.candidate));
  assert.ok(view.matchSetup);
  for (const side of ['away', 'home'] as const) {
    const team: NonNullable<typeof view.matchSetup>['sides']['away'] = view.matchSetup.sides[side];
    for (const player of team.players)
      assert.ok(
        f.candidate.state.registration.memberships.some(
          (m) => m.playerId === player.playerId && m.clubId === team.clubId && m.until === null,
        ),
      );
    for (const move of f.request.moves) {
      if (move.fromClubId === team.clubId)
        assert.ok(!team.players.some((p) => p.playerId === move.playerId));
    }
  }
});

test('開始後はベンチの選び直しを出さず、実際の回・カウントと未保存指示数を表示する', () => {
  const f = gameFixture(),
    saved = applied(f.initial, beginCommand(f.initial));
  const view = tradePlayView(read(saved, 1));
  const game = saved.state.games[view.nextGameId!]!;
  assert.equal(view.matchSetup, null);
  assert.equal(view.phase, 'playing');
  assert.equal(view.saveState.pendingCommands, 1);
  const situation = view.games.find((g) => g.gameId === view.nextGameId)!.situation!;
  assert.equal(situation.inning, game.state.inning);
  assert.deepEqual(situation.count, game.state.count);
  assert.deepEqual(
    situation.occupiedBases,
    game.state.baseOccupants.map((r) => r !== null),
  );
  assert.equal(view.capabilities.canSwitch, false);
  assert.equal(view.capabilities.canSaveManual, true);
});
