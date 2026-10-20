import { leaguePlayerLeaderboard, leaderboardLeagues } from '../src/world/league-leaderboard.ts';
import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTwoLeagueDefinitions } from '../src/data/world/two-leagues.ts';
import { createLeagueStructureDefinitions } from '../src/data/world/league-structure.ts';
import { twoLeagueCatalog } from '../src/data/competitions/two-leagues.ts';
import {
  createTwoLeagueWorld,
  createLeagueStructureWorld,
  advanceWorld,
  completeDay,
  worldPhase,
} from '../src/world/engine.ts';
import { leagueStandings, gameLeagueKind } from '../src/world/league-standings.ts';
import { emptyStats, standings } from '../src/world/stats.ts';
import { summarizeSeason } from '../src/world/season.ts';
import { validateWorld } from '../src/world/validation.ts';
import { DexieWorldStorage, WorldDatabase } from '../src/world/dexie-storage.ts';
import { WorldController } from '../src/world/controller.ts';
import type { WorldDefinitions, WorldRecord } from '../src/world/types.ts';

function finishDay(world: WorldRecord): WorldRecord {
  while (worldPhase(world) === 'playing') world = advanceWorld(world, 25);
  return completeDay(world, world.currentDate);
}

function emptySeason(definitions: WorldDefinitions): WorldDefinitions {
  definitions.schedule = [];
  definitions.endDate = definitions.startDate;
  definitions.farm!.endDate = definitions.startDate;
  return definitions;
}

test('2リーグ：短期・年間の参加情報を分け、対戦区分だけを導出して日程・120人を維持する', () => {
  for (const calendar of ['short', 'annual'] as const) {
    const d = createTwoLeagueDefinitions(calendar);
    validateWorld(createTwoLeagueWorld(1, undefined, d));
    assert.equal(d.version, 'world-definitions-v18');
    assert.equal(d.leagueStructure!.version, 'league-structure-v2');
    assert.deepEqual(d.schedule, createLeagueStructureDefinitions(calendar).schedule);
    assert.equal(d.playerProfiles!.players.length, 120);
    assert.deepEqual(
      leagueStandings(d, emptyStats(d)).map((g) => g.clubs.length),
      [2, 2],
    );
    assert.equal(leagueStandings(d, emptyStats(d), 'farmRegular')[0]!.clubs.length, 4);
    const counts = { league: 0, interleague: 0, farm: 0 };
    for (const g of d.schedule) {
      const kind = gameLeagueKind(d, g);
      if (kind) counts[kind]++;
      else counts.farm++;
    }
    assert.deepEqual(
      counts,
      calendar === 'short'
        ? { league: 2, interleague: 4, farm: 4 }
        : { league: 48, interleague: 96, farm: 72 },
    );
  }
});

test('リーグ内順位：他リーグの勝率に引きずられず、同率と未観測を区別する', () => {
  const d = createTwoLeagueDefinitions();
  const stats = emptyStats(d);
  const set = (id: string, wins: number, losses: number, draws = 0) => {
    Object.assign(
      stats.teams.find((t) => t.squadId === id)!,
      { wins, losses, draws, games: wins + losses + draws },
    );
  };
  set('hoshihara-first', 6, 4);
  set('kohaku-first', 5, 5);
  set('aonagi-first', 9, 1);
  set('asagiri-first', 3, 7);
  assert.equal(standings(stats).find((r) => r.squadId === 'hoshihara-first')!.rank, 2);
  const groups = leagueStandings(d, stats);
  assert.deepEqual(
    groups.map((g) => g.clubs.map((r) => r.rank)),
    [
      [1, 2],
      [1, 2],
    ],
  );
  set('kohaku-first', 3, 2);
  assert.deepEqual(
    leagueStandings(d, stats)[0]!.clubs.map((r) => r.rank),
    [1, 1],
  );
  set('asagiri-first', 0, 0, 2);
  const unseen = leagueStandings(d, stats)[1]!.clubs.find((r) => r.squadId === 'asagiri-first')!;
  assert.equal(unseen.winPercentage, null);
  assert.equal(unseen.rank, null);
  assert.equal(unseen.games, 2);
});

test('複数リーグの境界：重複・欠落・空リーグ・階級・構造版の混用を拒否する', () => {
  const mutations: ((d: WorldDefinitions) => void)[] = [
    (d) => {
      d.leagueStructure!.version = 'league-structure-v1';
    },
    (d) => {
      d.leagueStructure!.leagues.pop();
    },
    (d) => {
      d.leagueStructure!.leagues[1]!.leagueId = d.leagueStructure!.leagues[0]!.leagueId;
    },
    (d) => {
      d.leagueStructure!.leagues[1]!.level = 'farm';
    },
    (d) => {
      d.leagueStructure!.participations.find((p) => p.squadId === 'hoshihara-first')!.leagueId =
        'missing';
    },
    (d) => {
      d.leagueStructure!.participations.find((p) => p.squadId === 'hoshihara-first')!.leagueId =
        'fictional-farm-league';
    },
    (d) => {
      for (const p of d.leagueStructure!.participations)
        if (p.leagueId === 'fictional-sky-league') p.leagueId = 'fictional-ocean-league';
    },
    (d) => {
      d.leagueStructure!.participations.pop();
    },
  ];
  for (const mutate of mutations) {
    const d = createTwoLeagueDefinitions();
    mutate(d);
    assert.throws(() => createTwoLeagueWorld(1, undefined, d));
  }
  const old = createLeagueStructureDefinitions();
  old.leagueStructure!.version = 'league-structure-v2';
  assert.throws(() => createLeagueStructureWorld(1, undefined, old));
});

test('交流戦と保存：一度だけ集計し、所属名の編集後も保存内のリーグで再開する', async () => {
  const db = new WorldDatabase('two-leagues-save');
  const oldName = twoLeagueCatalog[0]!.displayName;
  try {
    const start = createTwoLeagueWorld(1);
    const world = finishDay(start);
    assert.ok(world.stats.teams.every((t) => t.games === 1));
    assert.equal(Object.keys(world.statApplicationMarkers).length, 4);
    assert.equal(
      leagueStandings(world.definitions, world.stats)
        .flatMap((g) => g.clubs)
        .reduce((n, t) => n + t.games, 0),
      4,
    );
    assert.throws(() => completeDay(world, start.currentDate));
    const old = finishDay(createLeagueStructureWorld(1));
    const { definitions: _a, ...a } = old;
    const { definitions: _b, ...b } = world;
    assert.deepEqual(b, a);
    const storage = new DexieWorldStorage(db);
    await storage.save(world, 1, 'manual', 0);
    twoLeagueCatalog[0]!.displayName = '編集中の別名';
    assert.equal(
      createTwoLeagueDefinitions().leagueStructure!.leagues[0]!.displayName,
      '編集中の別名',
    );
    const loaded = (await storage.load('manual')).world;
    assert.equal(leagueStandings(loaded.definitions, loaded.stats)[0]!.displayName, oldName);
    for (const scope of ['firstRegular', 'farmRegular'] as const) {
      const competitionId =
        scope === 'firstRegular'
          ? world.definitions.competitionId
          : world.definitions.farm!.competitionId;
      for (const league of leaderboardLeagues(world.definitions, scope)) {
        for (const [category, metric] of [
          ['batting', 'ops'],
          ['pitching', 'whip'],
          ['fielding', 'fieldingPercentage'],
        ] as const) {
          const query = {
            seasonId: world.definitions.seasonId,
            competitionId,
            statScope: scope,
            category,
            metric,
            leagueId: league.leagueId!,
          };
          const expected = leaguePlayerLeaderboard(world.definitions, world.stats, query);
          assert.ok(expected.length > 0);
          assert.deepEqual(
            leaguePlayerLeaderboard(loaded.definitions, loaded.stats, query),
            expected,
          );
        }
      }
    }
    assert.deepEqual(finishDay(loaded), finishDay(world));
    const controller = new WorldController(storage);
    let view = await controller.initialize();
    view = await controller.dispatch({
      kind: 'load',
      slot: 'manual',
      localWorldId: view.localWorldId,
      expectedStateRevision: view.revision,
      commandId: 'read',
    });
    assert.deepEqual(
      view.standings,
      leagueStandings(world.definitions, world.stats).flatMap((g) => g.clubs),
    );
  } finally {
    twoLeagueCatalog[0]!.displayName = oldName;
    await db.delete();
  }
});

test('年度末：リーグごとに優勝・同率・勝敗未観測を確定し、旧v17は要約v1を維持する', () => {
  const world = finishDay(
    createTwoLeagueWorld(1, undefined, emptySeason(createTwoLeagueDefinitions())),
  );
  assert.ok('seasonSummary' in world && world.seasonSummary?.version === 'season-summary-v2');
  assert.deepEqual(
    world.seasonSummary.leagues.map((l) => l.title),
    [
      { status: 'unresolved', squadIds: [] },
      { status: 'unresolved', squadIds: [] },
    ],
  );
  const set = (id: string, wins: number, losses: number) =>
    Object.assign(
      world.stats.teams.find((t) => t.squadId === id)!,
      { wins, losses, games: wins + losses },
    );
  set('hoshihara-first', 6, 4);
  set('kohaku-first', 4, 6);
  set('aonagi-first', 9, 1);
  set('asagiri-first', 1, 9);
  const summary = summarizeSeason(world);
  assert.equal(summary.version, 'season-summary-v2');
  if (summary.version !== 'season-summary-v2') throw new Error('v2 expected');
  assert.deepEqual(
    summary.leagues.map((g) => g.title),
    [
      { status: 'decided', squadId: 'hoshihara-first' },
      { status: 'decided', squadId: 'aonagi-first' },
    ],
  );
  assert.deepEqual(
    summary.clubs.map((r) => r.rank),
    [1, 2, 1, 2],
  );
  set('asagiri-first', 9, 1);
  const tied = summarizeSeason(world);
  assert.ok(tied.version === 'season-summary-v2');
  assert.equal(tied.leagues[1]!.title.status, 'unresolved');
  assert.equal(summary.leagues[1]!.title.status, 'decided');
  const old = finishDay(
    createLeagueStructureWorld(1, undefined, emptySeason(createLeagueStructureDefinitions())),
  );
  assert.ok('seasonSummary' in old && old.seasonSummary?.version === 'season-summary-v1');
  validateWorld(old);
});

test('短期完走：一二軍のリーグ別年度要約を保存・復元し、優勝や所属順位の改変を拒否する', async () => {
  let world: WorldRecord = createTwoLeagueWorld(2);
  while (worldPhase(world) !== 'scheduleComplete') world = finishDay(world);
  assert.ok('seasonSummary' in world && world.seasonSummary?.version === 'season-summary-v2');
  assert.ok('farmSummary' in world && world.farmSummary?.version === 'season-summary-v2');
  assert.equal(world.seasonSummary.leagues.length, 2);
  assert.equal(world.farmSummary.leagues.length, 1);
  assert.equal(world.seasonSummary.games, 6);
  assert.equal(world.farmSummary.games, 4);
  validateWorld(world);
  const db = new WorldDatabase('two-leagues-complete');
  try {
    const storage = new DexieWorldStorage(db);
    await storage.save(world, 1, 'auto', 0);
    assert.deepEqual((await storage.load('auto')).world, world);
    const bad = structuredClone(world);
    if ('seasonSummary' in bad && bad.seasonSummary?.version === 'season-summary-v2')
      bad.seasonSummary.leagues[0]!.title = { status: 'decided', squadId: 'aonagi-first' };
    assert.throws(() => validateWorld(bad), /一致/);
  } finally {
    await db.delete();
  }
});
