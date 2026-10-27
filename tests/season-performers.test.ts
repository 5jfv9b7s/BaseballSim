import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createTwoLeagueDefinitions } from '../src/data/world/two-leagues.ts';
import { seasonClubPerformers } from '../src/world/season-performers.ts';
import { formatStatValue, statValue } from '../src/world/leaderboard.ts';
import { canonicalJson, sha256 } from '../src/storage/codec.ts';
import type { SeasonSummary, SeasonStats, WorldRecord } from '../src/world/types.ts';

/** 手計算できる集計境界用データ。実保存との一致は末尾の固定検体で別に確認する。 */
function example(scope: 'firstRegular' | 'farmRegular' = 'firstRegular') {
  const definitions = createTwoLeagueDefinitions();
  const competition = scope === 'farmRegular' ? definitions.farm! : definitions;
  const squadId = competition.squads[0]!.squadId;
  const key = {
    seasonId: definitions.seasonId,
    competitionId: competition.competitionId,
    statScope: scope,
    squadId,
  };
  const batting = (playerId: string, hits = 2, atBats = 4) => ({
    ...key,
    playerId,
    plateAppearances: atBats,
    atBats,
    hits,
    doubles: 0,
    triples: 0,
    homeRuns: 1,
    runs: 0,
    runsBattedIn: 2,
    walks: 0,
    hitByPitch: 0,
    strikeouts: 0,
    sacrificeFlies: 0,
  });
  const pitching = (playerId: string, outsRecorded = 9, earnedRuns = 1) => ({
    ...key,
    playerId,
    pitches: 40,
    battersFaced: 13,
    outsRecorded,
    hitsAllowed: 1,
    homeRunsAllowed: 0,
    strikeouts: 4,
    walks: 0,
    hitBatters: 0,
    runsAllowed: earnedRuns,
    earnedRuns,
  });
  const stats: SeasonStats = {
    teams: [{ ...key, games: 1, wins: 1, losses: 0, draws: 0, runsFor: 2, runsAgainst: 1 }],
    matchups: [],
    batting: [batting('b'), batting('a')],
    pitching: [pitching('q'), pitching('p')],
    fielding: [],
  };
  const summary: SeasonSummary = {
    version: 'season-summary-v1',
    seasonId: key.seasonId,
    competitionId: key.competitionId,
    statScope: scope,
    completedOn: competition.endDate,
    games: 1,
    standingsRule: definitions.standingsRule,
    clubs: [],
    title: { status: 'unresolved', squadIds: [squadId] },
    stats,
  };
  const report = () => seasonClubPerformers(definitions, summary, squadId);
  const section = (metric: string) => report().find((item) => item.metric.key === metric)!;
  return {
    definitions,
    competition,
    squadId,
    key,
    stats,
    summary,
    batting,
    pitching,
    report,
    section,
  };
}

test('活躍選手：球団内の各部門で全同率者を保持し、数量・投球回・率を既存単位で示す', () => {
  const { report } = example();
  const result = report();
  assert.deepEqual(
    result.map((item) => item.metric.key),
    ['hits', 'homeRuns', 'runsBattedIn', 'average', 'strikeouts', 'outsRecorded', 'era'],
  );
  assert.deepEqual(
    result.map((item) => item.leaders.map((row) => row.playerId)),
    [
      ['a', 'b'],
      ['a', 'b'],
      ['a', 'b'],
      ['a', 'b'],
      ['p', 'q'],
      ['p', 'q'],
      ['p', 'q'],
    ],
  );
  assert.deepEqual(
    result.map((item) => formatStatValue(statValue(item.leaders[0]!, item.metric), item.metric)),
    ['2', '1', '2', '.500', '4', '3.0', '3.00'],
  );
  assert.ok(result.every((item) => item.emptyReason === null));
});

test('活躍選手：打率は表示の丸めで同率にせず、等しい分数だけを同率にする', () => {
  const { stats, batting, section } = example();
  stats.batting = [batting('a', 3334, 10000), batting('b', 3333, 9997)];
  assert.deepEqual(
    section('average').leaders.map((r) => r.playerId),
    ['b'],
  );
  stats.batting = [batting('a', 2, 6), batting('b', 1, 3)];
  assert.deepEqual(
    section('average').leaders.map((r) => r.playerId),
    ['a', 'b'],
  );
});

test('活躍選手：防御率は最小の分数で選び、投球アウトを小数回として計算しない', () => {
  const { stats, pitching, section } = example();
  stats.pitching = [pitching('a', 300, 100), pitching('b', 303, 101), pitching('c', 10, 4)];
  assert.deepEqual(
    section('era').leaders.map((r) => r.playerId),
    ['a', 'b'],
  );
  assert.deepEqual(
    section('outsRecorded').leaders.map((r) => r.playerId),
    ['b'],
  );
});

test('活躍選手：全員0の数量・有効な率0・記録なし・規定未到達を区別する', () => {
  const { stats, section } = example();
  for (const row of stats.batting) {
    row.hits = 0;
    row.homeRuns = 0;
    row.runsBattedIn = 0;
  }
  for (const row of stats.pitching) {
    row.strikeouts = 0;
    row.earnedRuns = 0;
  }
  assert.equal(section('homeRuns').emptyReason, 'noPositiveValue');
  assert.equal(section('strikeouts').emptyReason, 'noPositiveValue');
  assert.deepEqual(
    section('average').leaders.map((r) => r.playerId),
    ['a', 'b'],
  );
  assert.deepEqual(
    section('era').leaders.map((r) => r.playerId),
    ['p', 'q'],
  );
  stats.teams[0]!.games = 10;
  assert.equal(section('average').emptyReason, 'noQualifiedPlayer');
  assert.equal(section('era').emptyReason, 'noQualifiedPlayer');
  stats.batting = [];
  assert.equal(section('hits').emptyReason, 'noRecord');
  assert.equal(section('average').emptyReason, 'noRecord');
});

test('活躍選手：分母0を0率にせず、旧記録で分子の未記録も0にしない', () => {
  const { stats, section } = example();
  for (const row of stats.batting) {
    row.atBats = 0;
    row.hits = 0;
    row.walks = 4;
  }
  assert.equal(section('average').emptyReason, 'noRecord');
  // 旧形式の欠損を模す。型を迂回するのは表示用Queryの未記録境界を検査するため。
  for (const row of stats.batting) Reflect.deleteProperty(row, 'homeRuns');
  assert.equal(section('homeRuns').emptyReason, 'noRecord');
  for (const row of stats.pitching) row.outsRecorded = 0;
  assert.equal(section('era').emptyReason, 'noQualifiedPlayer');
});

test('活躍選手：未到達者の率が高くても選ばず、数量実績は規定を要求しない', () => {
  const { stats, batting, pitching, section } = example();
  stats.batting = [batting('small', 2, 2), batting('qualified', 1, 4)];
  stats.batting[0]!.homeRuns = 2;
  stats.pitching = [pitching('small', 2, 0), pitching('qualified', 9, 1)];
  stats.pitching[0]!.strikeouts = 9;
  assert.deepEqual(
    section('average').leaders.map((r) => r.playerId),
    ['qualified'],
  );
  assert.deepEqual(
    section('homeRuns').leaders.map((r) => r.playerId),
    ['small'],
  );
  assert.deepEqual(
    section('era').leaders.map((r) => r.playerId),
    ['qualified'],
  );
  assert.deepEqual(
    section('strikeouts').leaders.map((r) => r.playerId),
    ['small'],
  );
});

test('活躍選手：年度・大会・一二軍・球団外の記録を混ぜない', () => {
  for (const scope of ['firstRegular', 'farmRegular'] as const) {
    const { stats, batting, competition, key, section } = example(scope);
    const other = competition.squads[1]!.squadId;
    stats.batting.push(
      { ...batting('other', 9, 10), squadId: other },
      { ...batting('old', 9, 10), seasonId: key.seasonId + '-old' },
      { ...batting('cup', 9, 10), competitionId: key.competitionId + '-cup' },
      {
        ...batting('level', 9, 10),
        statScope: scope === 'firstRegular' ? 'farmRegular' : 'firstRegular',
      },
    );
    assert.deepEqual(
      section('hits').leaders.map((r) => r.playerId),
      ['a', 'b'],
    );
    assert.deepEqual(
      section('average').leaders.map((r) => r.playerId),
      ['a', 'b'],
    );
  }
});

test('活躍選手：複数所属者は他球団分を合算せず、率の資格未決定を補完しない', () => {
  const { stats, batting, competition, section } = example();
  const other = competition.squads[1]!.squadId;
  stats.batting.push({ ...batting('a', 9, 10), squadId: other });
  assert.deepEqual(
    section('hits').leaders.map((r) => r.playerId),
    ['a', 'b'],
  );
  assert.equal(section('hits').leaders[0]!.counters.hits, 2);
  assert.deepEqual(
    section('average').leaders.map((r) => r.playerId),
    ['b'],
  );
});

test('活躍選手：配列順・再表示を変えても不変で、年度要約や定義を更新しない', () => {
  const { definitions, stats, summary, report } = example();
  const before = structuredClone({ definitions, summary });
  const expected = report();
  assert.deepEqual(report(), expected);
  assert.deepEqual({ definitions, summary }, before);
  stats.batting.reverse();
  stats.pitching.reverse();
  assert.deepEqual(report(), expected);
});

test('活躍選手：違う年度・大会・参加外チームを推測で処理しない', () => {
  const { definitions, summary, squadId } = example();
  assert.throws(() => seasonClubPerformers(definitions, summary, 'missing'), /参加していない/);
  assert.throws(
    () => seasonClubPerformers(definitions, { ...summary, seasonId: 'other' }, squadId),
    /一致しません/,
  );
  assert.throws(
    () => seasonClubPerformers(definitions, { ...summary, competitionId: 'other' }, squadId),
    /一致しません/,
  );
});

test('活躍選手：0.38.0の固定保存から確定成績を読み、初期名簿・履歴・乱数と全状態を維持する', async () => {
  const world = JSON.parse(
    gunzipSync(
      readFileSync(new URL('./fixtures/world-v16-training-baseline.json.gz', import.meta.url)),
    ).toString('utf8'),
  ) as WorldRecord;
  assert.ok(
    'seasonSummary' in world && world.seasonSummary && 'farmSummary' in world && world.farmSummary,
  );
  const before = await sha256(canonicalJson(world));
  assert.equal(before, '64218a64ca155e8ed9f1b0d64bc72550fb711800504dad2924a920adf9a6e8ce');
  const summaries: SeasonSummary[] = [world.seasonSummary, world.farmSummary];
  for (const summary of summaries) {
    const competition: { squads: { squadId: string }[] } =
      summary.statScope === 'farmRegular' ? world.definitions.farm! : world.definitions;
    for (const squad of competition.squads) {
      const report = seasonClubPerformers(world.definitions, summary, squad.squadId);
      for (const [category, key] of [
        ['batting', 'hits'],
        ['batting', 'homeRuns'],
        ['pitching', 'strikeouts'],
        ['pitching', 'outsRecorded'],
      ] as const) {
        const sources: { playerId: string }[] = summary.stats[category].filter(
          (r) => r.squadId === squad.squadId,
        );
        const values: number[] = sources.map((r) => (r as unknown as Record<string, number>)[key]!);
        const maximum = Math.max(0, ...values);
        const expected: string[] = sources
          .filter((_, i) => maximum > 0 && values[i] === maximum)
          .map((r) => r.playerId)
          .sort();
        assert.deepEqual(
          report
            .find((item) => item.category === category && item.metric.key === key)!
            .leaders.map((r) => r.playerId),
          expected,
        );
      }
    }
  }
  assert.equal(await sha256(canonicalJson(world)), before);
});
