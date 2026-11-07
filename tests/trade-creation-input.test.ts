import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectTradeCreationInput } from '../src/world/trade-creation-input.ts';
import { MAX_TRADE_INITIAL_INPUT_BYTES } from '../src/world/trade-creation-types.ts';
import { parseTradeWorkerRequest } from '../src/world/trade-worker-validation.ts';
import { request } from './helpers/trade-worker-fixture.ts';
import { creationFixture } from './helpers/trade-creation-fixture.ts';

const inspect = (f: ReturnType<typeof creationFixture>, text = f.text()) =>
  inspectTradeCreationInput(f.source, f.ref, text, f.creationId);

test('ひな型は不明な金額・資格をnullで出力し、未入力を保存可能とみなさない', async () => {
  const f = creationFixture(),
    before = structuredClone(f.source),
    text = f.template(),
    draft = JSON.parse(text);
  assert.ok(text.endsWith('\n'));
  assert.equal(draft.finance.ledger.obligations, null);
  assert.equal(draft.finance.contractYears[0].year.salaryYen, null);
  assert.equal(draft.playerFacts[0].canPitch, null);
  const result = await inspect(f, text);
  assert.equal(result.status, 'blocked');
  if (result.status === 'blocked') {
    assert.ok(result.issueCount > 0);
    assert.ok(result.issues.length <= 100);
  }
  assert.deepEqual(f.source, before);
});

test('完全な明示入力は個人状態と世界IDを保持して独立候補になり、承認を生成しない', async () => {
  const f = creationFixture(),
    before = structuredClone(f.source),
    result = await inspect(f);
  assert.equal(result.status, 'ready');
  if (result.status !== 'ready') return;
  assert.equal(result.saved.localWorldId, 'trade-create-' + f.creationId);
  assert.equal(result.saved.worldId, f.source.worldId);
  assert.equal(result.saved.stateRevision, 0);
  assert.deepEqual(result.saved.state.tradeApprovals, []);
  assert.deepEqual(result.saved.state.growth, f.source.growth);
  assert.deepEqual(result.saved.state.physical, f.source.physical);
  assert.deepEqual(result.saved.state.registration, f.source.registration);
  assert.deepEqual(f.source, before);
  assert.match(result.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal((await inspect(f)).status, 'ready');
});

test('元保存の別版・別日付と、承認や世界の差替項目を拒否する', async () => {
  const f = creationFixture();
  await assert.rejects(
    inspect(f, JSON.stringify({ ...f.data, source: { ...f.data.source, storageRevision: 2 } })),
    /元保存/,
  );
  await assert.rejects(
    inspect(
      f,
      JSON.stringify({ ...f.data, source: { ...f.data.source, currentDate: '2026-01-01' } }),
    ),
    /元保存/,
  );
  await assert.rejects(inspect(f, JSON.stringify({ ...f.data, approvals: [] })), /初期入力/);
  await assert.rejects(inspect(f, JSON.stringify({ ...f.data, state: f.world })), /初期入力/);
});

test('契約欠落・重複資格・存在しない現金参照を補完しない', async () => {
  const f = creationFixture(),
    missing = structuredClone(f.data);
  missing.finance.contractYears = missing.finance.contractYears.slice(1);
  await assert.rejects(inspect(f, JSON.stringify(missing)), /全所属選手/);
  const duplicated = structuredClone(f.data);
  duplicated.playerFacts.push(duplicated.playerFacts[0]!);
  await assert.rejects(inspect(f, JSON.stringify(duplicated)), /重複/);
  const foreign = structuredClone(f.data);
  foreign.finance.ledger.cashEntries.push({
    cashEntryId: 'cash-bad',
    clubId: 'missing-club',
    bookedAt: { ...foreign.asOf },
    seasonId: f.data.source.seasonId,
    category: 'revenue',
    signedAmountYen: 1,
    sourceKey: ['bad-ref'],
    settlementGroupId: 'bad-group',
  });
  await assert.rejects(inspect(f, JSON.stringify(foreign)), /存在しない球団/);
});

test('未記録の予算を0とせず、未来の残高や入出金を初期確定値にしない', async () => {
  const f = creationFixture(),
    unknown = structuredClone(f.data);
  unknown.finance.budgets[0]!.openingBalance = null;
  assert.equal((await inspect(f, JSON.stringify(unknown))).status, 'blocked');
  const future = structuredClone(f.data);
  future.finance.budgets[0]!.openingBalance!.closedThrough.date = '2099-01-01';
  await assert.rejects(inspect(f, JSON.stringify(future)), /未来/);
});

test('初期入力だけの通信上限と試合開始前の境界を守る', async () => {
  const f = creationFixture();
  await assert.rejects(inspect(f, ' '.repeat(MAX_TRADE_INITIAL_INPUT_BYTES + 1)), /2MiB/);
  const large = f.text() + ' '.repeat(40000);
  const command = request(null, {
    kind: 'inspectCandidateCreation',
    source: f.ref,
    inputText: large,
    creationId: f.creationId,
  });
  assert.equal(parseTradeWorkerRequest(command).kind, 'inspectCandidateCreation');
  assert.throws(
    () =>
      parseTradeWorkerRequest({
        ...request(null, { kind: 'queryCandidate' }),
        extra: ' '.repeat(40000),
      }),
    /容量/,
  );
  f.source.dayPlan.cursor = 1;
  await assert.rejects(inspect(f), /全試合開始前/);
});
