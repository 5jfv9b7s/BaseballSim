import assert from 'node:assert/strict';
import test from 'node:test';
import { TradeWorkerWorkspace } from '../src/world/trade-worker-workspace.ts';
import { TradeGameSession } from '../src/world/trade-game-session.ts';
import { growthBasis } from '../src/world/growth-basis.ts';
import { gameFixture, beginCommand, memoryStorage } from './helpers/trade-game-fixture.ts';
import { idleDayFixture } from './helpers/trade-day-fixture.ts';
import {
  registrationCommand,
  policyCommand,
  rosterDayCommand,
} from './helpers/trade-registration-fixture.ts';
import { opened, request, workerFixture } from './helpers/trade-worker-fixture.ts';

function hasPrivateKey(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(
    ([key, v]) =>
      [
        'rng',
        'fullState',
        'initialDefinitions',
        'tradeApprovals',
        'finance',
        'fingerprint',
        'snapshot',
      ].includes(key) || hasPrivateKey(v),
  );
}

test('初期queryは世界を捏造せず、候補一覧の読取でも所有者や保存を作らない', async () => {
  let opens = 0;
  const workspace = new TradeWorkerWorkspace({
    async open() {
      opens++;
      throw new Error('unexpected');
    },
    async list() {
      return [];
    },
  });
  const first = await workspace.handle(request(null, { kind: 'queryCandidate' }));
  assert.equal(first.ok, true);
  assert.equal(first.view, null);
  assert.equal(first.active, null);
  const listed = await workspace.handle(request(first, { kind: 'listCandidates' }));
  assert.deepEqual(listed.candidates, []);
  assert.equal(opens, 0);
  assert.equal(listed.workspaceRevision, 0);
});

test('表示専用応答は内部正本やRNGを送らず、外部の書換えを次回表示へ持ち込まない', async () => {
  const f = workerFixture(),
    first = await opened(f);
  assert.equal(hasPrivateKey(first), false);
  const original = structuredClone(first.view);
  first.view!.players[0]!.name = '外部の変更';
  first.view!.squads[0]!.lineup.battingOrder[0]!.playerId = null;
  const queried = await f.workspace.handle(request(first, { kind: 'queryCandidate' }));
  assert.deepEqual(queried.view, original);
  assert.equal(f.writes(), 0);
  assert.deepEqual(await f.storage.read(), f.initial);
});

test('内部承認済みの移籍は一つの所有者へ確定し、現在所属と成長後能力を表示する', async () => {
  const g = gameFixture(),
    incoming = g.request.moves.find((m) => m.toClubId === g.request.clubIds[0])!.playerId;
  const ability = growthBasis(g.initial.state.initialDefinitions, incoming).find(
    (a) => a.valueMilli < a.ceilingMilli,
  )!;
  g.initial.state.growth.state.players[incoming]!.values[ability.key] = ability.valueMilli + 1;
  const f = workerFixture(g),
    first = await opened(f);
  assert.equal(first.view!.capabilities.canCommitTrade, true);
  const moved = await f.workspace.handle(
    request(first, { kind: 'candidateCommand', command: f.command }),
  );
  assert.equal(moved.ok, true);
  assert.equal(moved.result!.status, 'committed');
  assert.equal(hasPrivateKey(moved), false);
  const outgoing = f.request.moves.find((m) => m.fromClubId === f.request.clubIds[0])!.playerId;
  assert.ok(moved.view!.players.some((p) => p.playerId === incoming));
  assert.ok(!moved.view!.players.some((p) => p.playerId === outgoing));
  assert.equal(
    moved
      .view!.players.find((p) => p.playerId === incoming)!
      .abilities.find((a) => a.key === ability.key)!.valueMilli,
    ability.valueMilli + 1,
  );
  assert.equal(moved.view!.capabilities.canCommitTrade, false);
  assert.equal(f.writes(), 1);
  const replay = await f.workspace.handle(
    request(moved, { kind: 'candidateCommand', command: f.command }),
  );
  assert.equal(replay.result!.status, 'replayed');
  assert.equal(f.writes(), 1);
});

test('不正要求もrequestIdを返し、後続の正常要求を同じキューで処理する', async () => {
  const f = workerFixture(),
    first = await opened(f);
  const bad = { ...request(first, { kind: 'queryCandidate' }), state: f.initial.state };
  const failed = await f.workspace.handle(bad);
  assert.equal(failed.ok, false);
  assert.equal(failed.requestId, bad.requestId);
  assert.deepEqual(failed.view, first.view);
  const corrected = await f.workspace.handle(request(failed, { kind: 'queryCandidate' }));
  assert.equal(corrected.ok, true);
  assert.equal(f.writes(), 0);
});

test('別候補の復元が失敗した場合は現在の候補と切替版を保持する', async () => {
  const f = workerFixture(),
    first = await opened(f);
  const failed = await f.workspace.handle(
    request(first, { kind: 'openCandidate', localWorldId: 'missing-candidate' }),
  );
  assert.equal(failed.ok, false);
  assert.equal(failed.workspaceRevision, first.workspaceRevision);
  assert.deepEqual(failed.view, first.view);
  assert.deepEqual(failed.active, first.active);
});

test('閉じて同じ世界を開き直しても、切替前の指示・古いopen要求を受理しない', async () => {
  const f = workerFixture(),
    first = await opened(f);
  const oldOpen = request(null, { kind: 'openCandidate', localWorldId: f.initial.localWorldId });
  const oldGame = request(first, { kind: 'candidateCommand', command: beginCommand(f.initial) });
  const closed = await f.workspace.handle(
    request(first, { kind: 'closeCandidate', expectedStateRevision: first.active!.stateRevision }),
  );
  assert.equal(closed.view, null);
  assert.equal((await f.workspace.handle(oldOpen)).ok, false);
  const reopened = await f.workspace.handle(
    request(closed, { kind: 'openCandidate', localWorldId: f.initial.localWorldId }),
  );
  assert.equal(reopened.ok, true);
  assert.notEqual(reopened.active!.sessionId, first.active!.sessionId);
  const stale = await f.workspace.handle(oldGame);
  assert.equal(stale.ok, false);
  assert.deepEqual(stale.view, reopened.view);
  assert.equal(f.writes(), 0);
});

test('未保存の試合がある候補の切替・終了を拒否し、手動保存の状態版も検査する', async () => {
  const f = workerFixture(),
    first = await opened(f);
  const begun = await f.workspace.handle(
    request(first, { kind: 'candidateCommand', command: beginCommand(f.initial) }),
  );
  assert.equal(begun.view!.saveState.pendingCommands, 1);
  assert.equal(begun.view!.capabilities.canSwitch, false);
  assert.equal(
    (
      await f.workspace.handle(
        request(begun, { kind: 'openCandidate', localWorldId: f.initial.localWorldId }),
      )
    ).ok,
    false,
  );
  assert.equal(
    (
      await f.workspace.handle(
        request(begun, {
          kind: 'closeCandidate',
          expectedStateRevision: begun.active!.stateRevision,
        }),
      )
    ).ok,
    false,
  );
  assert.equal(
    (
      await f.workspace.handle(
        request(begun, {
          kind: 'saveCandidateManual',
          expectedStateRevision: first.active!.stateRevision,
        }),
      )
    ).ok,
    false,
  );
  const saved = await f.workspace.handle(
    request(begun, {
      kind: 'saveCandidateManual',
      expectedStateRevision: begun.active!.stateRevision,
    }),
  );
  assert.equal(saved.result!.status, 'saved');
  assert.equal(saved.view!.saveState.pendingCommands, 0);
  assert.equal(
    (
      await f.workspace.handle(
        request(saved, {
          kind: 'closeCandidate',
          expectedStateRevision: saved.active!.stateRevision,
        }),
      )
    ).ok,
    true,
  );
});

test('同時到着した同一試合指示は直列化し、二度目は一つの適用receiptを返す', async () => {
  const f = workerFixture(),
    first = await opened(f),
    command = beginCommand(f.initial);
  const [a, b] = await Promise.all([
    f.workspace.handle(request(first, { kind: 'candidateCommand', command })),
    f.workspace.handle(request(first, { kind: 'candidateCommand', command })),
  ]);
  assert.equal(a.result!.status, 'applied');
  assert.equal(b.result!.status, 'replayed');
  assert.equal(a.active!.stateRevision, b.active!.stateRevision);
  assert.equal(b.view!.saveState.pendingCommands, 1);
  assert.equal(f.writes(), 0);
});

test('キュー待ち中に呼出元が登録指示を書き換えても受信時の内容を使う', async () => {
  const f = gameFixture(),
    memory = memoryStorage(f.initial);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const workspace = new TradeWorkerWorkspace({
    open: () => TradeGameSession.open(memory.storage),
    list: async () => {
      await gate;
      return [];
    },
  });
  const first = await workspace.handle(
    request(null, { kind: 'openCandidate', localWorldId: f.initial.localWorldId }),
  );
  const listing = workspace.handle(request(first, { kind: 'listCandidates' }));
  const command = registrationCommand(f.initial),
    id = command.changes[0]!.playerId;
  const changing = workspace.handle(request(first, { kind: 'candidateCommand', command }));
  command.changes[0]!.category = 'first';
  release();
  await listing;
  const result = await changing;
  assert.equal(result.result!.status, 'committed');
  assert.equal(result.view!.players.find((p) => p.playerId === id)!.category, 'farm');
});

test('登録の既知の不成立は理由を返し、状態・保存・後続要求を壊さない', async () => {
  const f = workerFixture(),
    first = await opened(f),
    command = registrationCommand(f.initial);
  command.changes[0]!.playerId = first.view!.squads.find(
    (s) => s.category === 'first',
  )!.lineup.battingOrder[0]!.playerId!;
  const blocked = await f.workspace.handle(request(first, { kind: 'candidateCommand', command }));
  assert.equal(blocked.ok, true);
  assert.equal(blocked.result!.status, 'blocked');
  assert.deepEqual(blocked.view, first.view);
  assert.equal(f.writes(), 0);
  const corrected = await f.workspace.handle(
    request(blocked, {
      kind: 'candidateCommand',
      command: registrationCommand(f.initial, 'corrected'),
    }),
  );
  assert.equal(corrected.result!.status, 'committed');
});

test('日次v2は翌日を保存した後だけ返し、queryで日次やRNGを進めない', async () => {
  const f = workerFixture(idleDayFixture()),
    first = await opened(f);
  assert.equal(first.view!.phase, 'dayComplete');
  assert.equal(first.view!.capabilities.canCompleteDay, true);
  const completed = await f.workspace.handle(
    request(first, { kind: 'candidateCommand', command: rosterDayCommand(f.initial) }),
  );
  assert.equal(completed.ok, true);
  assert.equal(completed.result!.status, 'committed');
  assert.notEqual(completed.view!.currentDate, first.view!.currentDate);
  assert.equal(completed.view!.lastCompletedDate, first.view!.currentDate);
  assert.equal(f.writes(), 1);
  const persisted = await f.storage.read();
  await f.workspace.handle(request(completed, { kind: 'queryCandidate' }));
  assert.deepEqual(await f.storage.read(), persisted);
  assert.equal(f.writes(), 1);
});

test('手動保存の成否不明は停止し、明示reload後だけ新しいsessionIdで照合を再開する', async () => {
  const f = gameFixture(),
    memory = memoryStorage(f.initial);
  let failed = false;
  const storage = {
    read: () => memory.storage.read(),
    async commit(
      e: Parameters<typeof memory.storage.commit>[0],
      c: Parameters<typeof memory.storage.commit>[1],
    ) {
      await memory.storage.commit(e, c);
      if (!failed) {
        failed = true;
        throw new Error('after-write');
      }
    },
  };
  const workspace = new TradeWorkerWorkspace({
    open: () => TradeGameSession.open(storage),
    list: async () => [],
  });
  const first = await workspace.handle(
    request(null, { kind: 'openCandidate', localWorldId: f.initial.localWorldId }),
  );
  const command = beginCommand(f.initial),
    begun = await workspace.handle(request(first, { kind: 'candidateCommand', command }));
  const saved = await workspace.handle(
    request(begun, {
      kind: 'saveCandidateManual',
      expectedStateRevision: begun.active!.stateRevision,
    }),
  );
  assert.equal(saved.ok, false);
  assert.equal(saved.active!.reloadRequired, true);
  assert.equal(saved.view!.capabilities.canBeginGame, false);
  assert.equal(
    (
      await workspace.handle(
        request(saved, { kind: 'openCandidate', localWorldId: f.initial.localWorldId }),
      )
    ).ok,
    false,
  );
  const old = request(saved, { kind: 'candidateCommand', command });
  const resumed = await workspace.handle(
    request(saved, { kind: 'reloadCandidate', expectedStateRevision: saved.active!.stateRevision }),
  );
  assert.equal(resumed.ok, true);
  assert.notEqual(resumed.active!.sessionId, saved.active!.sessionId);
  assert.equal((await workspace.handle(old)).ok, false);
  const replayed = await workspace.handle(request(resumed, { kind: 'candidateCommand', command }));
  assert.equal(replayed.result!.status, 'replayed');
  assert.equal(memory.writes(), 1);
});

test('承認不足・古い承認は不成立として返し、保存を試みる前に停止扱いへ変えない', async () => {
  for (const approved of [false, true]) {
    const g = gameFixture();
    if (approved) g.initial.state.tradeApprovals[0]!.acceptedStateRevision--;
    else g.initial.state.tradeApprovals = [];
    const f = workerFixture(g),
      first = await opened(f);
    const result = await f.workspace.handle(
      request(first, { kind: 'candidateCommand', command: f.command }),
    );
    assert.equal(result.ok, true);
    assert.equal(result.result!.status, 'blocked');
    if (result.result?.status === 'blocked')
      assert.equal(result.result.reason, approved ? 'approvalChanged' : 'approvalRequired');
    assert.equal(result.active!.reloadRequired, false);
    assert.equal(f.writes(), 0);
    assert.equal((await f.workspace.handle(request(result, { kind: 'queryCandidate' }))).ok, true);
  }
});

test('別種類の指示IDを移籍に使い回さず、固定希望の最終評価時点を保持する', async () => {
  const f = workerFixture(),
    first = await opened(f),
    registration = registrationCommand(f.initial);
  const policy = policyCommand(f.initial, { [registration.changes[0]!.playerId]: 'farmFixed' });
  const changed = await f.workspace.handle(
    request(first, { kind: 'candidateCommand', command: policy }),
  );
  assert.equal(changed.view!.lastReconciliation!.stateRevision, changed.active!.stateRevision);
  const invalid = await f.workspace.handle(
    request(changed, {
      kind: 'candidateCommand',
      command: {
        ...f.command,
        commandId: policy.commandId,
        expectedStateRevision: changed.active!.stateRevision,
      },
    }),
  );
  assert.equal(invalid.ok, false);
  assert.equal(invalid.active!.reloadRequired, false);
  assert.deepEqual(invalid.view!.lastReconciliation, changed.view!.lastReconciliation);
  assert.equal(f.writes(), 1);
});
