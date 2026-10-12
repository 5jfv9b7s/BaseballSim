import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STAT_METRICS,
  playerLeaderboard,
  qualificationThreshold,
  statValue,
  formatStatValue,
} from '../src/world/leaderboard.ts';
import {
  advanceWorld,
  completeDay,
  createBullpenWorld,
  createWorld,
  worldPhase,
} from '../src/world/engine.ts';
import { DexieWorldStorage, WorldDatabase } from '../src/world/dexie-storage.ts';
import type { LeaderboardQuery } from '../src/world/leaderboard.ts';
import type {
  SeasonBatting,
  SeasonPitching,
  SeasonStats,
  StatKey,
  WorldRecord,
} from '../src/world/types.ts';

const scope: StatKey = {
  seasonId: 'S2026',
  competitionId: 'league',
  statScope: 'firstRegular',
  squadId: 'A',
};
const query: LeaderboardQuery = {
  ...scope,
  squadId: undefined,
  category: 'batting',
  metric: 'average',
};
function team(squadId: string, games: number) {
  return { ...scope, squadId, games, wins: games, losses: 0, draws: 0, runsFor: 0, runsAgainst: 0 };
}
function batting(playerId: string, values: Partial<SeasonBatting> = {}): SeasonBatting {
  return {
    ...scope,
    playerId,
    plateAppearances: 10,
    atBats: 9,
    hits: 3,
    doubles: 0,
    triples: 0,
    homeRuns: 0,
    runs: 0,
    runsBattedIn: 0,
    walks: 1,
    hitByPitch: 0,
    strikeouts: 0,
    ...values,
  };
}
function pitching(playerId: string, values: Partial<SeasonPitching> = {}): SeasonPitching {
  return {
    ...scope,
    playerId,
    pitches: 12,
    battersFaced: 4,
    outsRecorded: 3,
    hitsAllowed: 0,
    homeRunsAllowed: 0,
    strikeouts: 1,
    walks: 0,
    hitBatters: 0,
    runsAllowed: 0,
    earnedRuns: 0,
    ...values,
  };
}
function stats(): SeasonStats {
  return {
    teams: [team('A', 3), team('B', 5)],
    batting: [],
    pitching: [],
    fielding: [],
    matchups: [],
  };
}

test('成績順位：規定は実施試合数で四捨五入し、打席とアウトを使う', () => {
  assert.equal(qualificationThreshold(143, 'batting'), 443);
  assert.equal(qualificationThreshold(5, 'batting'), 16);
  assert.equal(qualificationThreshold(3, 'batting'), 9);
  assert.equal(qualificationThreshold(143, 'pitching'), 429);
  assert.equal(qualificationThreshold(0, 'pitching'), 0);
  for (const value of [-1, 1.5, NaN, Infinity])
    assert.throws(() => qualificationThreshold(value, 'batting'));
  const data = stats();
  data.batting = [
    batting('atBoundary', { plateAppearances: 9 }),
    batting('below', { plateAppearances: 8 }),
    batting('otherClub', { squadId: 'B', plateAppearances: 15 }),
  ];
  assert.deepEqual(
    playerLeaderboard(data, { ...query, qualifiedOnly: true }).map((row) => row.playerId),
    ['atBoundary'],
  );
  assert.equal(
    playerLeaderboard(data, query).find((row) => row.playerId === 'otherClub')!.qualification!
      .required,
    16,
  );
  data.teams[0]!.games = 0;
  assert.equal(playerLeaderboard(data, { ...query, qualifiedOnly: true }).length, 0);
});

test('成績順位：丸め表示が同じでも率を区別し、真の同率だけ同順位にする', () => {
  const data = stats();
  data.batting = [
    batting('z', { hits: 1, atBats: 3 }),
    batting('a', { hits: 2, atBats: 6 }),
    batting('rounded', { hits: 333, atBats: 1000 }),
    batting('zero', { hits: 0 }),
    batting('walksOnly', { hits: 0, atBats: 0 }),
  ];
  const before = structuredClone(data);
  const result = playerLeaderboard(data, query);
  assert.deepEqual(
    result.map((row) => [row.playerId, row.rank]),
    [
      ['a', 1],
      ['z', 1],
      ['rounded', 3],
      ['zero', 4],
      ['walksOnly', null],
    ],
  );
  const metric = STAT_METRICS.batting[0]!;
  assert.equal(formatStatValue(statValue(result[0]!, metric), metric), '.333');
  assert.equal(formatStatValue(statValue(result[2]!, metric), metric), '.333');
  const reversed = playerLeaderboard(data, { ...query, direction: 'ascending' });
  assert.equal(reversed[0]!.playerId, 'zero');
  assert.equal(reversed.at(-1)!.rank, null);
  assert.deepEqual(data, before);
  result[0]!.counters.hits = 999;
  assert.deepEqual(data, before);
  data.batting.reverse();
  assert.deepEqual(playerLeaderboard(data, query), playerLeaderboard(before, query));
});

test('成績順位：安全整数を超える交差積でも1カウント差を落とさない', () => {
  const data = stats();
  const max = Number.MAX_SAFE_INTEGER;
  data.batting = [
    batting('lower', { plateAppearances: max, hits: max - 2, atBats: max - 1 }),
    batting('higher', { plateAppearances: max, hits: max - 1, atBats: max }),
  ];
  assert.deepEqual(
    playerLeaderboard(data, query).map((row) => [row.playerId, row.rank]),
    [
      ['higher', 1],
      ['lower', 2],
    ],
  );
});

test('成績順位：投球回はアウトで比較し、規定未満・未登板・0アウトを区別する', () => {
  const data = stats();
  data.pitching = [
    pitching('nine', { outsRecorded: 9, earnedRuns: 1 }),
    pitching('eight', { outsRecorded: 8, earnedRuns: 1 }),
    pitching('zeroOut', { outsRecorded: 0, earnedRuns: 2 }),
    pitching('unused', { pitches: 0, battersFaced: 0, outsRecorded: 0 }),
  ];
  const pitchingQuery = { ...query, category: 'pitching' as const, metric: 'era' };
  assert.deepEqual(
    playerLeaderboard(data, pitchingQuery).map((row) => [row.playerId, row.rank]),
    [
      ['nine', 1],
      ['eight', 2],
      ['zeroOut', null],
    ],
  );
  assert.deepEqual(
    playerLeaderboard(data, { ...pitchingQuery, qualifiedOnly: true }).map((row) => row.playerId),
    ['nine'],
  );
  const era = STAT_METRICS.pitching[0]!;
  assert.equal(
    formatStatValue(statValue(playerLeaderboard(data, pitchingQuery)[1]!, era), era),
    '3.38',
  );
  const innings = STAT_METRICS.pitching.find((item) => item.key === 'outsRecorded')!;
  assert.equal(formatStatValue({ numerator: 8n, denominator: 1n }, innings), '2.2');
});

test('成績順位：年度・大会・一二軍を混ぜず、所属をまたぐ同一選手は合算する', () => {
  const data = stats();
  data.batting = [
    batting('P01', { hits: 70 }),
    batting('P01', { squadId: 'B', hits: 50 }),
    batting('P02', { hits: 115 }),
    batting('P01', { statScope: 'farmRegular', hits: 12 }),
    batting('P03', { competitionId: 'other', hits: 200 }),
    batting('P04', { seasonId: 'S2025', hits: 300 }),
  ];
  const result = playerLeaderboard(data, { ...query, metric: 'hits', qualifiedOnly: true });
  assert.deepEqual(
    result.map((row) => [row.playerId, row.counters.hits, row.rank]),
    [
      ['P01', 120, 1],
      ['P02', 115, 2],
    ],
  );
  assert.equal(result[0]!.qualification, null);
  assert.equal(
    playerLeaderboard(data, { ...query, qualifiedOnly: true }).some(
      (row) => row.playerId === 'P01',
    ),
    false,
  );
  assert.deepEqual(playerLeaderboard(data, { ...query, metric: 'hits', squadId: 'B' }), [
    result[0],
  ]);
});

test('成績順位：積算値に規定を適用せず、旧版の欠けた項目を0で補わない', () => {
  const data = stats();
  data.batting = [
    batting('short', { plateAppearances: 1, homeRuns: 1, sacrificeFlies: 0 }),
    batting('legacy'),
    batting('none', { plateAppearances: 0 }),
    batting('other', { squadId: 'B', homeRuns: 2 }),
  ];
  const all = playerLeaderboard(data, { ...query, metric: 'homeRuns', qualifiedOnly: true });
  assert.deepEqual(
    all.map((row) => row.playerId),
    ['other', 'short', 'legacy'],
  );
  assert.equal(playerLeaderboard(data, { ...query, metric: 'homeRuns', squadId: 'A' })[0]!.rank, 2);
  assert.deepEqual(
    playerLeaderboard(data, { ...query, metric: 'sacrificeFlies', direction: 'ascending' }).map(
      (row) => row.rank,
    ),
    [1, null, null],
  );
  // 一部の所属期間に記録のない項目は、合計を作っても不明のまま。
  data.batting.push(batting('short', { squadId: 'B' }));
  assert.equal(
    playerLeaderboard(data, { ...query, metric: 'sacrificeFlies' }).find(
      (row) => row.playerId === 'short',
    )!.counters.sacrificeFlies,
    undefined,
  );
});

test('成績順位：守備位置別に合算し、守備回と失策0を未対応と区別する', () => {
  const data = stats();
  data.fielding = ['C', '1B'].map((position) => ({
    ...scope,
    playerId: 'P',
    position: position as 'C' | '1B',
    gamesAtPosition: 2,
    fieldingOuts: 17,
    putouts: 3,
    assists: 2,
    doublePlayParticipations: 0,
    errors: 0,
  }));
  data.fielding.push({ ...data.fielding[0]!, squadId: 'B', fieldingOuts: 3 });
  const result = playerLeaderboard(data, {
    ...query,
    category: 'fielding',
    metric: 'fieldingOuts',
  });
  assert.deepEqual(
    result.map((row) => [row.position, row.counters.fieldingOuts]),
    [
      ['C', 20],
      ['1B', 17],
    ],
  );
  assert.equal(
    playerLeaderboard(data, { ...query, category: 'fielding', metric: 'errors', position: 'C' })
      .length,
    1,
  );
  assert.throws(() => playerLeaderboard(data, { ...query, metric: 'wins' }), /未対応/);
});

function finishDay(world: WorldRecord): WorldRecord {
  while (worldPhase(world) === 'playing') world = advanceWorld(world, 25);
  return completeDay(world, world.currentDate);
}

test('成績順位：実試合・休養日・今季確定・保存復元で同じ集計を得る', async () => {
  let world: WorldRecord = createBullpenWorld(1);
  const get = (target: WorldRecord, statScope: StatKey['statScope']) =>
    playerLeaderboard(target.stats, {
      seasonId: target.definitions.seasonId,
      competitionId:
        statScope === 'firstRegular'
          ? target.definitions.competitionId
          : target.definitions.farm!.competitionId,
      statScope,
      category: 'batting',
      metric: 'hits',
    });
  assert.deepEqual(get(world, 'firstRegular'), []);
  world = finishDay(finishDay(world));
  const first = get(world, 'firstRegular');
  const farm = get(world, 'farmRegular');
  assert.ok(first.length > 0 && farm.length > 0);
  assert.ok(first.every((row) => row.qualification?.games === 2));
  world = finishDay(world); // 一軍の試合なし・二軍最終日。
  assert.deepEqual(get(world, 'firstRegular'), first);
  assert.notDeepEqual(get(world, 'farmRegular'), farm);
  world = finishDay(world);
  assert.equal(worldPhase(world), 'scheduleComplete');
  const before = structuredClone(world);
  const db = new WorldDatabase('leaderboard-integration');
  try {
    const storage = new DexieWorldStorage(db);
    await storage.save(world, 1, 'manual', 0);
    const restored = await storage.load('manual');
    for (const scope of ['firstRegular', 'farmRegular'] as const)
      assert.deepEqual(get(restored.world, scope), get(world, scope));
    assert.deepEqual(world, before);
  } finally {
    db.close();
    await db.delete();
  }
  const legacy = finishDay(createWorld());
  assert.ok(get(legacy, 'firstRegular').length > 0);
});
