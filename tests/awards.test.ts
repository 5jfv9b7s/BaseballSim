import 'fake-indexeddb/auto';
import test from 'node:test';
import { completedRecordDay } from './record-sample.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import {
  selectSeasonHonors,
  formatAwardEvidence,
  validateAwardsRules,
} from '../src/world/awards.ts';
import { AWARDS_RULES } from '../config/awards.ts';
import { summarizeSeason } from '../src/world/season.ts';
import { canonicalJson, sha256 } from '../src/storage/codec.ts';
import { WorldController } from '../src/world/controller.ts';
import { WorldDatabase, DexieWorldStorage } from '../src/world/dexie-storage.ts';
import { emptyWorldSlots } from '../src/world/storage.ts';
import type { WorldRecord } from '../src/world/types.ts';

function original(): WorldRecord {
  return JSON.parse(
    gunzipSync(
      readFileSync(new URL('./fixtures/world-v19-in-progress.json.gz', import.meta.url)),
    ).toString('utf8'),
  );
}
/** 選考境界用の投影。年度を実際に完走した保存の代用にはしない。 */
function example(scope: 'firstRegular' | 'farmRegular' = 'firstRegular') {
  const world = completedRecordDay();
  world.definitions.schedule = world.definitions.schedule.filter(
    (m) => world.games[m.gameId]?.result && world.games[m.gameId]?.state.phase === 'gameComplete',
  );
  world.currentDate = '2026-10-01';
  world.completedDates.push(world.definitions.endDate, world.definitions.farm!.endDate);
  const summary = summarizeSeason(world, scope);
  assert.equal(summary.version, 'season-summary-v2');
  const report = () => selectSeasonHonors(world, summary, AWARDS_RULES);
  return { world, summary, report };
}
test('参考選考：両リーグ別のタイトル7部門・B9全10位置・GG全9位置、DHのGGは作らない', () => {
  const { report } = example();
  const r = report();
  assert.equal(r.leagues.length, 2);
  for (const league of r.leagues) {
    assert.equal(league.awards.filter((a) => a.category === 'title').length, 7);
    assert.equal(league.awards.filter((a) => a.category === 'bestNine').length, 10);
    assert.equal(league.awards.filter((a) => a.category === 'goldGlove').length, 9);
    assert.ok(!league.awards.some((a) => a.category === 'goldGlove' && a.position === 'DH'));
  }
});
test('参考選考：数量0の候補は作らず、率は規定到達者だけ、完全同率は全員', () => {
  const { summary, report } = example();
  for (const row of summary.stats.batting) {
    row.homeRuns = 0;
    row.hits = 0;
    row.plateAppearances = 1;
    row.atBats = 1;
    row.walks = 0;
    row.hitByPitch = 0;
    row.sacrificeFlies = 0;
  }
  const league =
    report().leagues.find((l) =>
      l.awards.some((a) => a.category === 'bestNine' && a.winners.length),
    ) ?? report().leagues[0]!;
  const ids =
    summary.version === 'season-summary-v2'
      ? summary.leagues.find((l) => l.leagueId === league.leagueId)!.clubs.map((c) => c.squadId)
      : [];
  const rows = summary.stats.batting.filter((b) => ids.includes(b.squadId));
  assert.ok(rows.length >= 2);
  rows[0]!.homeRuns = 2;
  rows[1]!.homeRuns = 2;
  const r = report().leagues.find((l) => l.leagueId === league.leagueId)!;
  assert.equal(r.awards.find((a) => a.code === 'homeRuns')!.winners.length, 2);
  assert.equal(r.awards.find((a) => a.code === 'average')!.status, 'noEligiblePlayer');
  assert.equal(r.awards.find((a) => a.code === 'onBasePercentage')!.status, 'noEligiblePlayer');
});
test('参考選考：表示の丸めで同率にせず、分数が等しければ併記', () => {
  const { summary, report } = example();
  const rows = summary.stats.batting;
  for (const r of rows) {
    r.hits = 0;
    r.atBats = 10000;
    r.plateAppearances = 10000;
  }
  const pair = rows.filter((r) => r.squadId === rows[0]!.squadId).slice(0, 2);
  assert.equal(pair.length, 2);
  pair[0]!.hits = 3334;
  pair[1]!.hits = 3333;
  pair[1]!.atBats = 9997;
  const award = () =>
    report()
      .leagues.flatMap((l) => l.awards)
      .find(
        (a) =>
          a.code === 'average' &&
          a.winners.some((w) => pair.some((p) => p.playerId === w.playerId)),
      )!;
  assert.deepEqual(
    award().winners.map((w) => w.playerId),
    [pair[1]!.playerId],
  );
  pair[0]!.hits = 2;
  pair[0]!.atBats = 6;
  pair[1]!.hits = 1;
  pair[1]!.atBats = 3;
  assert.equal(award().winners.length, 2);
});
test('参考選考：GGの未観測を0失策扱いしない、条件を変更すると候補だけが変わる', () => {
  const { world, summary, report } = example();
  const field = summary.stats.fielding[0]!;
  assert.ok(field);
  const position = field.position;
  for (const row of summary.stats.fielding.filter((f) => f.position === position))
    delete row.errors;
  assert.ok(
    report().leagues.every(
      (l) =>
        l.awards.find((a) => a.category === 'goldGlove' && a.position === position)!.status !==
        'awarded',
    ),
  );
  const before = canonicalJson(world),
    rules = { ...AWARDS_RULES, battingRolePaPerTeamGame: 100, pitchingOutsPerTeamGame: 100 };
  const stricter = selectSeasonHonors(world, summary, rules);
  assert.ok(
    stricter.leagues.every((l) =>
      l.awards.filter((a) => a.category === 'bestNine').every((a) => a.winners.length === 0),
    ),
  );
  assert.equal(canonicalJson(world), before);
});
test('参考選考：一二軍を分離、名前と所属は保存内の試合名簿、規則と返却値は複製', () => {
  const { world, summary, report } = example('farmRegular');
  const r = report();
  assert.equal(r.statScope, 'farmRegular');
  const winner = r.leagues.flatMap((l) => l.awards).flatMap((a) => a.winners)[0]!;
  assert.ok(winner);
  assert.ok(world.definitions.farm!.squads.some((s) => s.squadId === winner.squadId));
  const game = Object.values(world.games).find((g) =>
    g.fixture.players.some((p) => p.playerId === winner.playerId),
  )!;
  const name = game.fixture.players.find((p) => p.playerId === winner.playerId)!;
  assert.equal(winner.displayName, name.familyName + ' ' + name.givenName);
  r.rules.battingRolePaPerTeamGame = 99;
  winner.displayName = '改変';
  assert.equal(report().rules.battingRolePaPerTeamGame, AWARDS_RULES.battingRolePaPerTeamGame);
  assert.ok(
    !report()
      .leagues.flatMap((l) => l.awards)
      .flatMap((a) => a.winners)
      .some((w) => w.displayName === '改変'),
  );
  const wrong = structuredClone(summary);
  wrong.competitionId = 'different';
  assert.throws(() => selectSeasonHonors(world, wrong, AWARDS_RULES), /一致/);
});
test('参考選考：設定を厳密に検査、率・防御率・回を単位通り整形', () => {
  validateAwardsRules(AWARDS_RULES);
  for (const bad of [
    { ...AWARDS_RULES, fieldingOutsPerTeamGame: 0 },
    { ...AWARDS_RULES, extra: true },
    { ...AWARDS_RULES, ties: 'firstId' },
  ])
    assert.throws(() => validateAwardsRules(bad));
  const e = {
    label: '率',
    numerator: '1',
    denominator: '3',
    format: 'average' as const,
    direction: 'higher' as const,
  };
  assert.equal(formatAwardEvidence(e), '.333');
  assert.equal(formatAwardEvidence({ ...e, numerator: '27', format: 'era' }), '9.00');
  assert.equal(formatAwardEvidence({ ...e, numerator: '8', format: 'innings' }), '2.2');
});
test('参考選考：旧固定保存の全状態SHA・Worker照会・保存枠を変えない', async () => {
  const world = original(),
    before = await sha256(canonicalJson(world));
  assert.equal(before, 'd5d3ffb05563f11e039dbea7c5625673a73341a94deeaae2741ad6e7b815a823');
  const db = new WorldDatabase('reference-honors-' + crypto.randomUUID());
  try {
    const storage = new DexieWorldStorage(db),
      slots = emptyWorldSlots();
    const controller = WorldController.fromCommitted(storage, 'reference-only', 1, world, slots);
    const view = controller.query();
    assert.equal(view.referenceHonors.firstRegular, null);
    assert.deepEqual(view.hitlessStreaks, controller.query().hitlessStreaks);
    assert.deepEqual(await storage.listSlots(), slots);
    assert.equal(await sha256(canonicalJson(world)), before);
  } finally {
    await db.delete();
  }
});

test('参考選考：B9は打席時の位置を交代から追跡、同OPSは打席数、完全同率は全員', () => {
  const { world, report } = example();
  const games = Object.values(world.games).filter(
    (g) => g.result && g.state.phase === 'gameComplete',
  );
  const game = games[0]!,
    template = structuredClone(game.events.find((e) => e.pitch && e.outcome)!);
  for (const g of games) g.events = [];
  const a = game.fixture.teams.away.lineup[0]!,
    b = game.fixture.teams.away.lineup[1]!;
  a.position = '1B';
  const event = (playerId: string, outcome: typeof template.outcome) => ({
    ...structuredClone(template),
    pitch: { ...template.pitch!, batterId: playerId },
    outcome,
  });
  const sub = {
    ...structuredClone(template),
    pitch: null,
    outcome: null,
    kind: 'substitution' as const,
    substitution: { side: 'away' as const, outPlayerId: a.playerId, inPlayerId: b.playerId },
  };
  game.events = [
    event(a.playerId, 'single'),
    event(a.playerId, 'battedOut'),
    sub,
    event(b.playerId, 'single'),
    event(b.playerId, 'battedOut'),
    event(b.playerId, 'single'),
    event(b.playerId, 'battedOut'),
  ];
  const award = () =>
    report()
      .leagues.flatMap((l) => l.awards)
      .find((r) => r.category === 'bestNine' && r.position === '1B' && r.winners.length)!;
  assert.deepEqual(
    award().winners.map((w) => w.playerId),
    [b.playerId],
  );
  assert.equal(formatAwardEvidence(award().winners[0]!.evidence[0]!), '1.000');
  game.events.splice(-2);
  assert.equal(award().winners.length, 2);
});
