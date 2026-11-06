import assert from 'node:assert/strict';
import test from 'node:test';
import { planTradeRosters } from '../src/recruitment/trade-roster.ts';
import { prepareTradeRegistrations } from '../src/recruitment/trade-roster-registration.ts';
import { clearDepartedPlayers } from '../src/recruitment/trade-roster-lineups.ts';
import { batterId, pitcherId, rosterFixture } from './helpers/trade-roster-fixture.ts';

test('所属・登録・旧固定希望・補充編成を一緒に計画し、入力と取引外チームを変えない', () => {
  const input = rosterFixture();
  const before = structuredClone(input);
  const result = planTradeRosters(input);
  assert.equal(result.status, 'ready');
  assert.deepEqual(input, before);
  if (result.status !== 'ready') return;
  const moved = batterId('test-a', 0);
  assert.equal(
    result.changes.memberships.find((m) => m.playerId === moved && m.until === null)!.clubId,
    'test-b',
  );
  assert.equal(
    result.changes.registrations.find((r) => r.playerId === moved && r.until === null)!.clubId,
    'test-b',
  );
  assert.equal(
    result.changes.preferences.some((p) => p.playerId === moved && p.clubId === 'test-a'),
    false,
  );
  assert.equal(result.changes.preferences.find((p) => p.playerId === moved)!.preference, 'auto');
  assert.equal(result.audit.removedPreferences.length, 2);
  assert.strictEqual(
    result.changes.squads.find((s) => s.clubId === 'test-c'),
    input.state.squads.find((s) => s.clubId === 'test-c'),
  );
  const oldRegistration = result.changes.registrations.find(
    (r) => r.registrationId === `test-registration-${moved}`,
  )!;
  assert.deepEqual(oldRegistration.until, input.effectiveAt);
});

test('獲得後の登録区分を指定しない提案に適用用データを返さない', () => {
  const input = rosterFixture();
  input.choices = input.choices.slice(1);
  const result = planTradeRosters(input);
  assert.equal(result.status, 'blocked');
  assert.equal('changes' in result, false);
  if (result.status === 'blocked')
    assert.ok(result.issues.some((issue) => issue.code === 'registrationRequired'));
});

test('旧球団の固定希望を新球団の希望として流用しない', () => {
  const input = rosterFixture();
  input.choices = input.choices.map(({ preference: _preference, ...choice }) => choice);
  const result = planTradeRosters(input);
  assert.equal(result.status, 'blocked');
  if (result.status === 'blocked')
    assert.ok(result.issues.every((issue) => issue.code === 'preferenceRequired'));
});

test('欠員は獲得選手で自動補完せず、明示した補充案を要求する', () => {
  const input = rosterFixture();
  input.squadReplacements = [];
  const result = planTradeRosters(input);
  assert.equal(result.status, 'blocked');
  assert.equal('changes' in result, false);
  if (result.status === 'blocked')
    assert.ok(result.issues.some((issue) => issue.code === 'lineupVacancy' && issue.slotNo === 1));
});

test('取引外球団の選手を補充案の打順へ入れられない', () => {
  const input = rosterFixture();
  input.squadReplacements[0]!.lineup.battingOrder[0]!.playerId = batterId('test-c', 0);
  const result = planTradeRosters(input);
  assert.equal(result.status, 'blocked');
  if (result.status === 'blocked')
    assert.ok(
      result.issues.some(
        (issue) => issue.code === 'playerNotEligible' && issue.playerId === batterId('test-c', 0),
      ),
    );
});

test('一軍固定を選んでも移籍前の再登録待ちを解除しない', () => {
  const input = rosterFixture();
  const playerId = batterId('test-b', 0);
  const registration = input.state.registrations.find((row) => row.playerId === playerId)!;
  registration.category = 'farm';
  registration.nextFirstEligibleOn = '2026-06-16';
  input.choices.find((choice) => choice.playerId === playerId)!.preference = 'firstFixed';
  const result = planTradeRosters(input);
  assert.equal(result.status, 'blocked');
  if (result.status === 'blocked')
    assert.ok(result.issues.some((issue) => issue.code === 'registrationCooldown'));
});

test('二軍から二軍への移籍では既存の再登録可能日を維持する', () => {
  const input = rosterFixture();
  const playerId = batterId('test-b', 0);
  const registration = input.state.registrations.find((row) => row.playerId === playerId)!;
  registration.category = 'farm';
  registration.nextFirstEligibleOn = '2026-06-16';
  input.choices.find((choice) => choice.playerId === playerId)!.category = 'farm';
  const prepared = prepareTradeRegistrations(input);
  assert.equal(prepared.issues.length, 0);
  assert.equal(
    prepared.rows.find((row) => row.playerId === playerId && row.until === null)!
      .nextFirstEligibleOn,
    '2026-06-16',
  );
});

test('移籍と同時の一軍から二軍への変更は既存登録規則の日数を使う', () => {
  const input = rosterFixture();
  const playerId = batterId('test-b', 0);
  input.choices.find((choice) => choice.playerId === playerId)!.category = 'farm';
  const prepared = prepareTradeRegistrations(input);
  assert.equal(prepared.issues.length, 0);
  assert.equal(
    prepared.rows.find((row) => row.playerId === playerId && row.until === null)!
      .nextFirstEligibleOn,
    '2026-06-16',
  );
});

test('所属・一軍上限を超える片側への移籍を検出する', () => {
  const input = rosterFixture();
  input.rules = { ...input.rules, clubLimit: 11, firstLimit: 11, benchLimit: 10 };
  input.state.squads.forEach((squad) => {
    squad.benchLimit = 10;
  });
  input.state.overrides = [];
  input.squadReplacements = [];
  input.moves = input.moves.filter((move) => move.fromClubId === 'test-b');
  input.choices = input.choices.filter((choice) => choice.clubId === 'test-a');
  const result = planTradeRosters(input);
  assert.equal(result.status, 'blocked');
  if (result.status === 'blocked')
    assert.ok(
      result.issues.some((issue) => issue.code === 'rosterLimit' && issue.clubId === 'test-a'),
    );
});

test('外国人枠を氏名等で推測せず、明示した資格で両球団を検査する', () => {
  const input = rosterFixture();
  input.rules.foreignFirstLimit = 1;
  input.rules.foreignBenchLimit = 1;
  input.players.find((p) => p.playerId === batterId('test-a', 1))!.foreignBaseStatus = 'subject';
  input.players.find((p) => p.playerId === batterId('test-b', 0))!.foreignBaseStatus = 'subject';
  const result = planTradeRosters(input);
  assert.equal(result.status, 'blocked');
  if (result.status === 'blocked')
    assert.ok(
      result.issues.some((issue) => issue.code === 'rosterLimit' && issue.clubId === 'test-a'),
    );
});

test('過去試合の指定は保持し、無効になる未開始試合の指定だけを解除履歴へ残す', () => {
  const input = rosterFixture();
  const result = planTradeRosters(input);
  assert.equal(result.status, 'ready');
  if (result.status !== 'ready') return;
  assert.strictEqual(result.changes.overrides[0], input.state.overrides[0]);
  assert.equal(result.changes.overrides[1]!.lineup, null);
  assert.equal(result.changes.overrides[1]!.benchIds, null);
  assert.equal(result.changes.overrides[1]!.starterId, pitcherId('test-a', 0));
  assert.deepEqual(result.audit.invalidatedOverrides[0]!.fields, ['lineup', 'benchIds']);
  assert.equal(input.state.overrides[1]!.lineup!.battingOrder[0]!.playerId, batterId('test-a', 0));
});

test('試合別指定が存在しなくても、当日試合開始後は成立案を作らない', () => {
  const input = rosterFixture();
  input.dayPhase = 'gamesStarted';
  input.state.overrides = [];
  const result = planTradeRosters(input);
  assert.equal(result.status, 'blocked');
  if (result.status === 'blocked') assert.equal(result.issues[0]!.code, 'gameDayStarted');
});

test('重複する試合別ベンチ指定を残した案は通さない', () => {
  const input = rosterFixture();
  const bench = input.state.memberships
    .filter((m) => m.clubId === 'test-a')
    .map((m) => (m.playerId === batterId('test-a', 0) ? batterId('test-b', 0) : m.playerId));
  input.state.overrides[1]!.benchIds = [...bench, pitcherId('test-a', 0)];
  const result = planTradeRosters(input);
  assert.equal(result.status, 'blocked');
  if (result.status === 'blocked')
    assert.ok(result.issues.some((issue) => issue.code === 'invalidOverride'));
});

test('放出投手のローテ枠はnull、救援・個別休養・条件別救援は旧球団から外す', () => {
  const input = rosterFixture();
  const original = input.state.squads[0]!;
  const before = structuredClone(original);
  const cleaned = clearDepartedPlayers(
    original,
    new Set([batterId('test-a', 0), pitcherId('test-a', 0), pitcherId('test-a', 1)]),
  );
  assert.equal(cleaned.lineup.battingOrder[0]!.playerId, null);
  assert.equal(cleaned.pitchers.rotationSlots[0]!.playerId, null);
  assert.equal(cleaned.pitchers.nextSlotNo, 1);
  assert.deepEqual(
    [
      cleaned.pitchers.reliefRoles.length,
      cleaned.individualRest.length,
      cleaned.conditionalRelief.length,
    ],
    [0, 0, 0],
  );
  assert.deepEqual(original, before);
});

test('所属と矛盾する登録期間・重複登録を不正入力として拒否する', () => {
  const input = rosterFixture();
  input.state.registrations.push({
    ...input.state.registrations[0]!,
    registrationId: 'test-overlap',
  });
  assert.throws(() => planTradeRosters(input));
});

test('一軍枠に収まっても先発の外国人ベンチ枠を超える編成を通さない', () => {
  const input = rosterFixture();
  input.rules.foreignBenchLimit = 1;
  input.players.find((p) => p.playerId === batterId('test-a', 1))!.foreignBaseStatus = 'subject';
  input.players.find((p) => p.playerId === batterId('test-b', 0))!.foreignBaseStatus = 'subject';
  const result = planTradeRosters(input);
  assert.equal(result.status, 'blocked');
  if (result.status === 'blocked')
    assert.ok(
      result.issues.some(
        (issue) => issue.code === 'rosterLimit' && issue.squadId === 'test-a-first',
      ),
    );
});

test('資格・投打役割の未記録を日本人や野手の既定値で埋めない', () => {
  const input = rosterFixture();
  input.players = input.players.filter((p) => p.playerId !== batterId('test-a', 0));
  const result = planTradeRosters(input);
  assert.equal(result.status, 'blocked');
  if (result.status === 'blocked')
    assert.ok(
      result.issues.some(
        (issue) => issue.code === 'missingPlayerData' && issue.playerId === batterId('test-a', 0),
      ),
    );
});
