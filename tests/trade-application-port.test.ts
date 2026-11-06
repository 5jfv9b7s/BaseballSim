import assert from 'node:assert/strict';
import test from 'node:test';
import {
  commitAcceptedTrade,
  type TradeCommitCommand,
  type TradeCommitSnapshot,
} from '../src/recruitment/trade-commit.ts';
import { planTradeChangeSet } from '../src/recruitment/trade-change-set.ts';
import { createTradeApplicationPort } from '../src/world/trade-application-port.ts';
import { tradeApplicationInput } from '../src/world/trade-application.ts';
import type { TradeApplicationWorld } from '../src/world/trade-application-types.ts';
import { applicationFixture } from './helpers/trade-application-fixture.ts';

function fixture() {
  const f = applicationFixture();
  f.world.tradeApprovals.push({
    approvalId: 'test-internal-approval',
    acceptedStateRevision: 2,
    approvedForClubId: f.request.clubIds[0],
    acceptedAt: { ...f.world.rosterAsOf },
    validThrough: { date: f.world.currentDate, order: 10 },
    request: structuredClone(f.request),
    appliedTransactionId: null,
  });
  let stored: TradeCommitSnapshot<TradeApplicationWorld> = {
    localWorldId: 'test-play',
    worldId: f.world.worldId,
    stateRevision: 2,
    storageRevision: 4,
    currentDate: f.world.currentDate,
    seasonId: f.world.initialDefinitions.seasonId,
    state: f.world,
    tradeReceipts: [],
  };
  const command: TradeCommitCommand = {
    kind: 'commitAcceptedTrade',
    commandId: 'test-world-command',
    localWorldId: stored.localWorldId,
    worldId: stored.worldId,
    expectedStateRevision: 2,
    approvalId: 'test-internal-approval',
  };
  let saves = 0,
    fail = false;
  const storage = {
    async read() {
      return stored;
    },
    async commit(
      expected: Pick<
        typeof stored,
        'localWorldId' | 'worldId' | 'stateRevision' | 'storageRevision'
      >,
      candidate: typeof stored,
    ) {
      saves += 1;
      if (fail) throw new Error('test atomic abort');
      assert.equal(expected.stateRevision, stored.stateRevision);
      assert.equal(expected.storageRevision, stored.storageRevision);
      assert.equal(expected.localWorldId, stored.localWorldId);
      assert.equal(expected.worldId, stored.worldId);
      stored = structuredClone(candidate);
    },
  };
  return {
    ...f,
    command,
    storage,
    getStored: () => structuredClone(stored),
    replaceStored: (value: typeof stored) => {
      stored = value;
    },
    setFailure: (value: boolean) => {
      fail = value;
    },
    saves: () => saves,
  };
}

test('具体的な名簿・会計・内部承認・receiptを全候補へまとめ、再送で二重反映しない', async () => {
  const f = fixture(),
    before = f.getStored();
  const result = await commitAcceptedTrade(f.command, createTradeApplicationPort(f.storage));
  assert.equal(result.status, 'committed');
  if (result.status !== 'committed') return;
  const world = result.snapshot.state;
  assert.equal(world.transactions.length, 1);
  assert.equal(world.tradeApprovals[0]!.appliedTransactionId, f.request.transactionId);
  assert.equal(result.snapshot.tradeReceipts.length, 1);
  assert.equal(result.snapshot.stateRevision, 3);
  assert.equal(result.snapshot.storageRevision, 5);
  assert.deepEqual(world.physical, before.state.physical);
  assert.deepEqual(world.growth, before.state.growth);
  assert.deepEqual(f.getStored(), result.snapshot);
  const after = f.getStored();
  assert.equal(
    (await commitAcceptedTrade(f.command, createTradeApplicationPort(f.storage))).status,
    'replayed',
  );
  assert.deepEqual(f.getStored(), after);
  assert.equal(f.saves(), 1);
});

test('担当球団違い・期限切れ・承認後の状態変更は保存しない', async () => {
  for (const mode of ['club', 'expired', 'stale']) {
    const f = fixture(),
      stored = f.getStored(),
      approval = stored.state.tradeApprovals[0]!;
    if (mode === 'club') approval.approvedForClubId = 'other-club';
    if (mode === 'expired') approval.validThrough = { ...stored.state.rosterAsOf };
    if (mode === 'stale') approval.acceptedStateRevision = 1;
    f.replaceStored(stored);
    const port = createTradeApplicationPort(f.storage);
    if (mode === 'stale') {
      const result = await commitAcceptedTrade(f.command, port);
      assert.equal(result.status, 'blocked');
    } else await assert.rejects(commitAcceptedTrade(f.command, port));
    assert.deepEqual(f.getStored(), stored);
    assert.equal(f.saves(), 0);
  }
});

test('具体的な全候補の保存失敗でも、個人状態・所属・会計・承認とreceiptを維持する', async () => {
  const f = fixture(),
    before = f.getStored();
  f.setFailure(true);
  await assert.rejects(
    commitAcceptedTrade(f.command, createTradeApplicationPort(f.storage)),
    /test atomic abort/,
  );
  assert.deepEqual(f.getStored(), before);
  f.setFailure(false);
  assert.equal(
    (await commitAcceptedTrade(f.command, createTradeApplicationPort(f.storage))).status,
    'committed',
  );
  assert.equal(
    f.getStored().state.tradeApprovals[0]!.appliedTransactionId,
    f.request.transactionId,
  );
});

test('世界ルートの不一致と、審査済みの案を書き換えた直接適用を拒否する', async () => {
  const f = fixture(),
    stored = f.getStored();
  stored.currentDate = '2020-01-01';
  f.replaceStored(stored);
  await assert.rejects(
    commitAcceptedTrade(f.command, createTradeApplicationPort(f.storage)),
    /保存ルート/,
  );
  const plan = planTradeChangeSet(tradeApplicationInput(f.world, f.request));
  assert.equal(plan.status, 'ready');
  if (plan.status !== 'ready') return;
  plan.finance.ledger.cashEntries.pop();
  assert.throws(
    () => createTradeApplicationPort(f.storage).applyChanges(f.world, plan),
    /変更案が異なります/,
  );
  assert.equal(f.world.transactions.length, 0);
  assert.equal(f.saves(), 0);
});
