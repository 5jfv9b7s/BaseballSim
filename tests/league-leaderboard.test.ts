import test from 'node:test';
import assert from 'node:assert/strict';
import { createTwoLeagueDefinitions } from '../src/data/world/two-leagues.ts';
import { createLeagueStructureDefinitions } from '../src/data/world/league-structure.ts';
import { createPlayerProfileDefinitions } from '../src/data/world/player-profiles.ts';
import { leaderboardLeagues, leaguePlayerLeaderboard } from '../src/world/league-leaderboard.ts';
import { playerLeaderboard } from '../src/world/leaderboard.ts';
import type { SeasonStats } from '../src/world/types.ts';

function example() {
  const definitions = createTwoLeagueDefinitions();
  const [sky, ocean] = leaderboardLeagues(definitions, 'firstRegular');
  const query = {
    seasonId: definitions.seasonId,
    competitionId: definitions.competitionId,
    statScope: 'firstRegular' as const,
    category: 'batting' as const,
    metric: 'hits',
  };
  const squads = [...sky!.squadIds, ...ocean!.squadIds];
  const stats: SeasonStats = {
    teams: squads.map((squadId, i) => ({
      ...query,
      squadId,
      games: i + 1,
      wins: 0,
      losses: 0,
      draws: i + 1,
      runsFor: 0,
      runsAgainst: 0,
    })),
    matchups: [],
    pitching: [],
    fielding: [],
    batting: squads.map((squadId, i) => ({
      ...query,
      squadId,
      playerId: `p${i}`,
      plateAppearances: 10,
      atBats: 9,
      hits: i + 1,
      doubles: 0,
      triples: 0,
      homeRuns: 0,
      runs: 0,
      runsBattedIn: 0,
      walks: 1,
      hitByPitch: 0,
      strikeouts: 0,
      sacrificeFlies: 0,
    })),
  };
  return { definitions, sky: sky!, ocean: ocean!, query, stats };
}

test('個人成績のリーグ：所属で先に絞り、球団表示を絞ってもリーグ順位を保つ', () => {
  const { definitions, sky, ocean, query, stats } = example();
  const before = structuredClone({ definitions, stats });
  const skyRows = leaguePlayerLeaderboard(definitions, stats, {
    ...query,
    leagueId: sky.leagueId!,
  });
  assert.deepEqual(
    skyRows.map((r) => [r.playerId, r.rank]),
    [
      ['p1', 1],
      ['p0', 2],
    ],
  );
  assert.deepEqual(
    leaguePlayerLeaderboard(definitions, stats, { ...query, leagueId: ocean.leagueId! }).map(
      (r) => [r.playerId, r.rank],
    ),
    [
      ['p3', 1],
      ['p2', 2],
    ],
  );
  assert.equal(
    leaguePlayerLeaderboard(definitions, stats, {
      ...query,
      leagueId: sky.leagueId!,
      squadId: sky.squadIds[0],
    })[0]!.rank,
    2,
  );
  assert.deepEqual(
    leaguePlayerLeaderboard(definitions, stats, {
      ...query,
      leagueId: sky.leagueId!,
      squadId: ocean.squadIds[0],
    }),
    [],
  );
  assert.deepEqual({ definitions, stats }, before);
  assert.deepEqual(
    leaguePlayerLeaderboard(definitions, stats, query).map((r) => r.rank),
    [1, 2, 3, 4],
  );
});

test('個人成績のリーグ：交流戦を含む実施試合数から規定を判定する', () => {
  const { definitions, sky, query, stats } = example();
  // p0: 1試合→3打席、p1: 2試合→6打席。対戦相手別の再集計は行わない。
  stats.batting[0]!.plateAppearances = 3;
  stats.batting[1]!.plateAppearances = 5;
  const rows = leaguePlayerLeaderboard(definitions, stats, {
    ...query,
    metric: 'average',
    leagueId: sky.leagueId!,
    qualifiedOnly: true,
  });
  assert.deepEqual(
    rows.map((r) => r.playerId),
    ['p0'],
  );
  assert.equal(rows[0]!.qualification!.required, 3);
  assert.equal(rows[0]!.counters.hits, 1);
});

test('個人成績のリーグ：移籍はリーグ分を合算し、未知の資格を到達に変えない', () => {
  const { definitions, sky, ocean, query, stats } = example();
  stats.batting = [
    { ...stats.batting[0]!, playerId: 'transfer', hits: 2 },
    { ...stats.batting[2]!, playerId: 'transfer', hits: 5 },
  ];
  const get = (leagueId?: string) =>
    leaguePlayerLeaderboard(definitions, stats, { ...query, leagueId });
  assert.equal(get(sky.leagueId!)[0]!.counters.hits, 2);
  assert.equal(get(ocean.leagueId!)[0]!.counters.hits, 5);
  assert.equal(get()[0]!.counters.hits, 7);
  assert.ok(
    [get(), get(sky.leagueId!), get(ocean.leagueId!)].every(
      (rows) => rows[0]!.qualification === null,
    ),
  );
  assert.deepEqual(
    leaguePlayerLeaderboard(definitions, stats, {
      ...query,
      leagueId: sky.leagueId!,
      metric: 'average',
      qualifiedOnly: true,
    }),
    [],
  );
  stats.batting[1]!.squadId = sky.squadIds[1]!;
  assert.equal(get(sky.leagueId!)[0]!.counters.hits, 7);
  assert.equal(get(sky.leagueId!)[0]!.qualification, null);
});

test('個人成績のリーグ：二軍・年度・大会・守備位置を混ぜず、不正指定は拒否する', () => {
  const { definitions, sky, query, stats } = example();
  const farmLeague = leaderboardLeagues(definitions, 'farmRegular')[0]!;
  const farmQuery = {
    ...query,
    competitionId: definitions.farm!.competitionId,
    statScope: 'farmRegular' as const,
    leagueId: farmLeague.leagueId!,
  };
  stats.batting.push({
    ...stats.batting[0]!,
    ...farmQuery,
    squadId: farmLeague.squadIds[0]!,
    playerId: 'farm',
    hits: 100,
  });
  stats.batting.push(
    { ...stats.batting[0]!, seasonId: 'old', hits: 999 },
    { ...stats.batting[0]!, competitionId: 'other', hits: 888 },
  );
  assert.equal(
    leaguePlayerLeaderboard(definitions, stats, { ...query, leagueId: sky.leagueId! }).length,
    2,
  );
  assert.deepEqual(
    leaguePlayerLeaderboard(definitions, stats, farmQuery).map((r) => r.playerId),
    ['farm'],
  );
  assert.throws(
    () => leaguePlayerLeaderboard(definitions, stats, { ...query, leagueId: farmLeague.leagueId! }),
    /参加していない/,
  );
  assert.throws(
    () => leaguePlayerLeaderboard(definitions, stats, { ...query, leagueId: 'missing' }),
    /参加していない/,
  );
  assert.throws(
    () => leaguePlayerLeaderboard(definitions, stats, { ...query, seasonId: 'old' }),
    /年度・大会/,
  );
  assert.throws(
    () => leaguePlayerLeaderboard(definitions, stats, { ...query, competitionId: 'missing' }),
    /年度・大会/,
  );
  stats.fielding = ['C', '1B'].flatMap((position) =>
    stats.batting.slice(0, 4).map((r) => ({
      ...r,
      position: position as 'C' | '1B',
      gamesAtPosition: 1,
      fieldingOuts: 3,
      putouts: 1,
      assists: 0,
      doublePlayParticipations: 0,
      errors: 0,
    })),
  );
  assert.equal(
    leaguePlayerLeaderboard(definitions, stats, {
      ...query,
      leagueId: sky.leagueId!,
      category: 'fielding',
      metric: 'fieldingPercentage',
      position: 'C',
    }).length,
    2,
  );
  assert.deepEqual(playerLeaderboard(stats, { ...query, includedSquadIds: [] }), []);
});

test('個人成績のリーグ：旧v16は情報未記録、v17は当時の1リーグを保つ', () => {
  const legacy = createPlayerProfileDefinitions();
  const old = createLeagueStructureDefinitions();
  const oldGroups = leaderboardLeagues(old, 'firstRegular');
  assert.equal(oldGroups.length, 1);
  assert.equal(oldGroups[0]!.squadIds.length, 4);
  const legacyGroups = leaderboardLeagues(legacy, 'firstRegular');
  assert.equal(legacyGroups[0]!.leagueId, null);
  assert.equal(legacyGroups[0]!.displayName, 'リーグ情報の記録なし');
  const { query } = example();
  const data: SeasonStats = { teams: [], matchups: [], batting: [], pitching: [], fielding: [] };
  assert.deepEqual(leaguePlayerLeaderboard(legacy, data, query), []);
  assert.throws(
    () => leaguePlayerLeaderboard(legacy, data, { ...query, leagueId: 'fictional-sky-league' }),
    /参加していない/,
  );
  assert.equal(Object.hasOwn(legacy, 'leagueStructure'), false);
});
