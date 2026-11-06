import assert from 'node:assert/strict';
import test from 'node:test';
import {
  commitAcceptedTrade,
  type TradeCommitCommand,
  type TradeCommitPort,
  type TradeCommitSnapshot,
} from '../src/recruitment/trade-commit.ts';
import { changeSetFixture } from './helpers/trade-roster-fixture.ts';

type TestState = { roster: unknown; ledger: unknown; preserved: { playerAbility: number } };

function fixture() {
  const input = changeSetFixture();
  let stored: TradeCommitSnapshot<TestState> = {
    localWorldId: 'test-play',
    worldId: 'test-world',
    stateRevision: 2,
    storageRevision: 4,
    currentDate: input.finance.effectiveAt.date,
    seasonId: input.finance.seasonId,
    state: {
      roster: structuredClone(input.roster.state),
      ledger: structuredClone(input.finance.ledger),
      preserved: { playerAbility: 12345 },
    },
    tradeReceipts: [],
  };
  const command: TradeCommitCommand = {
    kind: 'commitAcceptedTrade',
    commandId: 'test-command',
    localWorldId: stored.localWorldId,
    worldId: stored.worldId,
    expectedStateRevision: 2,
    approvalId: 'test-approval',
  };
  let saveCalls = 0,
    applyCalls = 0;
  const port: TradeCommitPort<TestState> = {
    async read() {
      return stored;
    },
    acceptedTrade() {
      return { approvalId: command.approvalId, stateRevision: 2, input };
    },
    applyChanges(state, plan) {
      applyCalls += 1;
      state.roster = plan.roster.changes;
      state.ledger = plan.finance.ledger;
      return state;
    },
    async commit(expected, candidate) {
      saveCalls += 1;
      assert.equal(expected.stateRevision, stored.stateRevision);
      assert.equal(expected.storageRevision, stored.storageRevision);
      assert.equal(expected.localWorldId, stored.localWorldId);
      assert.equal(expected.worldId, stored.worldId);
      stored = structuredClone(candidate);
    },
  };
  return {
    command,
    input,
    port,
    getStored: () => structuredClone(stored),
    replaceStored: (next: typeof stored) => {
      stored = next;
    },
    calls: () => ({ saveCalls, applyCalls }),
  };
}

test('全変更と確定記録を一度に保存し、成功後だけ候補を返す', async () => {
  const f = fixture(),
    before = f.getStored();
  const result = await commitAcceptedTrade(f.command, f.port);
  assert.equal(result.status, 'committed');
  if (result.status !== 'committed') return;
  assert.equal(result.snapshot.stateRevision, 3);
  assert.equal(result.snapshot.storageRevision, 5);
  assert.equal(result.snapshot.tradeReceipts.length, 1);
  assert.deepEqual(result.snapshot.state.preserved, before.state.preserved);
  assert.notDeepEqual(result.snapshot.state.roster, before.state.roster);
  assert.notDeepEqual(result.snapshot.state.ledger, before.state.ledger);
  assert.deepEqual(f.getStored(), result.snapshot);
  assert.deepEqual(f.calls(), { saveCalls: 1, applyCalls: 1 });
});

test('保存が完了するまでは結果を公開せず、元の参照を変更しない', async () => {
  const f = fixture(),
    original = await f.port.read(),
    before = structuredClone(original);
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const entering = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const save = f.port.commit;
  f.port.commit = async (expected, candidate) => {
    entered();
    await gate;
    await save(expected, candidate);
  };
  let returned = false;
  const promise = commitAcceptedTrade(f.command, f.port).then((r) => {
    returned = true;
    return r;
  });
  await entering;
  assert.equal(returned, false);
  assert.deepEqual(original, before);
  release();
  assert.equal((await promise).status, 'committed');
});

test('同一指示の再送は永続記録から返し、再保存・再適用しない', async () => {
  const f = fixture();
  await commitAcceptedTrade(f.command, f.port);
  const after = f.getStored();
  // Worker再起動を想定し、一時的なprocessed Mapは使わない。
  const result = await commitAcceptedTrade(structuredClone(f.command), { ...f.port });
  assert.equal(result.status, 'replayed');
  assert.equal('snapshot' in result, false);
  assert.deepEqual(f.getStored(), after);
  assert.deepEqual(f.calls(), { saveCalls: 1, applyCalls: 1 });
});

test('同じ指示IDで条件を変えた再送と、別IDで同じ承認の二重適用を拒否する', async () => {
  const f = fixture();
  await commitAcceptedTrade(f.command, f.port);
  await assert.rejects(
    commitAcceptedTrade({ ...f.command, approvalId: 'other' }, f.port),
    /同じトレード指示ID/,
  );
  await assert.rejects(
    commitAcceptedTrade({ ...f.command, commandId: 'other', expectedStateRevision: 3 }, f.port),
    /既に適用/,
  );
  assert.deepEqual(f.calls(), { saveCalls: 1, applyCalls: 1 });
});

test('古い状態・別プレイ・別世界の新規指示は適用も保存もしない', async () => {
  const f = fixture(),
    before = f.getStored();
  for (const patch of [
    { expectedStateRevision: 1 },
    { localWorldId: 'other' },
    { worldId: 'other' },
  ])
    await assert.rejects(commitAcceptedTrade({ ...f.command, ...patch }, f.port));
  assert.deepEqual(f.getStored(), before);
  assert.deepEqual(f.calls(), { saveCalls: 0, applyCalls: 0 });
});

test('未承認・承認後に状態が変わった取引は停止する', async () => {
  const f = fixture();
  f.port.acceptedTrade = () => null;
  assert.deepEqual(await commitAcceptedTrade(f.command, f.port), {
    modelVersion: 'trade-commit-v1',
    status: 'blocked',
    reason: 'approvalRequired',
  });
  f.port.acceptedTrade = () => ({
    approvalId: f.command.approvalId,
    stateRevision: 1,
    input: f.input,
  });
  assert.deepEqual(await commitAcceptedTrade(f.command, f.port), {
    modelVersion: 'trade-commit-v1',
    status: 'blocked',
    reason: 'approvalChanged',
  });
  assert.deepEqual(f.calls(), { saveCalls: 0, applyCalls: 0 });
});

test('登録・編成か会計が通らなければ、候補・確定記録を保存しない', async () => {
  for (const stage of ['roster', 'finance']) {
    const f = fixture(),
      before = f.getStored();
    if (stage === 'roster') f.input.roster.squadReplacements = [];
    else f.input.finance.budgets[0].openingBalance!.balanceYen = 0;
    const result = await commitAcceptedTrade(f.command, f.port);
    assert.equal(result.status, 'blocked');
    if (result.status === 'blocked' && result.reason === 'conditions')
      assert.equal(result.details.stage, stage);
    else assert.fail('審査で停止するはず');
    assert.deepEqual(f.getStored(), before);
    assert.deepEqual(f.calls(), { saveCalls: 0, applyCalls: 0 });
  }
});

test('保存失敗では正本・台帳・確定記録を保持し、同じ指示で再試行できる', async () => {
  const f = fixture(),
    original = await f.port.read(),
    before = structuredClone(original);
  const save = f.port.commit;
  f.port.commit = async () => {
    throw new Error('保存abort');
  };
  await assert.rejects(commitAcceptedTrade(f.command, f.port), /保存abort/);
  assert.deepEqual(original, before);
  assert.deepEqual(f.getStored(), before);
  f.port.commit = save;
  assert.equal((await commitAcceptedTrade(f.command, f.port)).status, 'committed');
});

test('他タブの保存で版が変わった場合はCASで止め、後発の保存を上書きしない', async () => {
  const f = fixture();
  const save = f.port.commit;
  f.port.commit = async (expected, candidate) => {
    const external = f.getStored();
    external.storageRevision += 1;
    f.replaceStored(external);
    await save(expected, candidate);
  };
  await assert.rejects(commitAcceptedTrade(f.command, f.port));
  assert.equal(f.getStored().tradeReceipts.length, 0);
  assert.equal(f.getStored().stateRevision, 2);
  assert.equal(f.getStored().storageRevision, 5);
});

test('保存成功後に応答が失われても、再送は確定記録を返す', async () => {
  const f = fixture();
  const save = f.port.commit;
  f.port.commit = async (expected, candidate) => {
    await save(expected, candidate);
    throw new Error('応答喪失');
  };
  await assert.rejects(commitAcceptedTrade(f.command, f.port), /応答喪失/);
  assert.equal((await commitAcceptedTrade(f.command, f.port)).status, 'replayed');
  assert.deepEqual(f.calls(), { saveCalls: 1, applyCalls: 1 });
});

test('別承認で同じ取引IDを再使用できず、日付違いも受理しない', async () => {
  const f = fixture();
  const stored = f.getStored();
  stored.tradeReceipts.push({
    commandId: 'other',
    fingerprint: 'other',
    approvalId: 'other',
    transactionId: f.input.finance.transactionId,
    committedStateRevision: 1,
  });
  f.replaceStored(stored);
  await assert.rejects(commitAcceptedTrade(f.command, f.port), /同じ取引/);
  stored.tradeReceipts = [];
  f.replaceStored(stored);
  f.input.finance.effectiveAt.date = '2020-01-01';
  await assert.rejects(commitAcceptedTrade(f.command, f.port), /日付・シーズン/);
  assert.deepEqual(f.calls(), { saveCalls: 0, applyCalls: 0 });
});

test('非同期読取中に呼出元が指示を書き換えても、受理した入力を固定する', async () => {
  const f = fixture();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const read = f.port.read;
  f.port.read = async () => {
    await gate;
    return read();
  };
  const command = structuredClone(f.command);
  const result = commitAcceptedTrade(command, f.port);
  command.approvalId = '書換えた別承認';
  command.worldId = '書換えた別世界';
  release();
  const committed = await result;
  assert.equal(committed.status, 'committed');
  if (committed.status === 'committed')
    assert.equal(committed.receipt.approvalId, f.command.approvalId);
  assert.equal((await commitAcceptedTrade(f.command, f.port)).status, 'replayed');
});
