import {
  createTradeRosterDraft,
  swapDraftPositions,
  buildTradeRosterAction,
} from '../src/ui/trade-play/trade-roster-draft.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { TradeWorkerClient } from '../src/world/trade-worker-client.ts';
import {
  TRADE_WORKER_PROTOCOL,
  type TradeWorkerRequest,
  type TradeWorkerResponse,
} from '../src/world/trade-worker-protocol.ts';
import { workerFixture } from './helpers/trade-worker-fixture.ts';
import { beginCommand } from './helpers/trade-game-fixture.ts';

/** メッセージ境界だけを模倣。実ブラウザーのWorker起動試験ではない。 */
class Port extends EventTarget {
  sent: TradeWorkerRequest[] = [];
  terminated = false;
  throwOnSend = false;
  postMessage(request: TradeWorkerRequest) {
    if (this.throwOnSend) throw new Error('send-failed');
    this.sent.push(request);
  }
  terminate() {
    this.terminated = true;
  }
  reply(value: unknown) {
    this.dispatchEvent(new MessageEvent('message', { data: value }));
  }
}
function emptyResponse(port: Port): TradeWorkerResponse {
  return {
    protocol: TRADE_WORKER_PROTOCOL,
    requestId: port.sent.at(-1)!.requestId,
    workspaceRevision: 0,
    active: null,
    view: null,
    ok: true,
    candidates: [],
  };
}

test('clientは通信IDを付け、表示用応答を複製して保持する', async () => {
  const port = new Port(),
    client = new TradeWorkerClient(port),
    promise = client.request({ kind: 'listCandidates' });
  assert.equal(client.connectionState, 'waiting');
  assert.equal(port.sent[0]!.expectedWorkspaceRevision, 0);
  const response = emptyResponse(port);
  port.reply(response);
  const received = await promise;
  received.candidates!.push({
    localWorldId: 'external',
    worldId: null,
    label: '変更',
    gameDate: null,
    stateRevision: null,
    storageRevision: null,
    status: 'unavailable',
    error: 'test',
  });
  assert.deepEqual(client.read()!.candidates, []);
  assert.equal(client.connectionState, 'idle');
  client.dispose();
  assert.equal(port.terminated, true);
});

test('応答待ちに二重送信せず、直前の重複応答を新しい要求へ結び付けない', async () => {
  const port = new Port(),
    client = new TradeWorkerClient(port),
    first = client.request({ kind: 'queryCandidate' });
  await assert.rejects(client.request({ kind: 'queryCandidate' }), /応答を待って/);
  assert.equal(port.sent.length, 1);
  const old = emptyResponse(port);
  port.reply(old);
  await first;
  const second = client.request({ kind: 'queryCandidate' });
  port.reply(old);
  assert.equal(client.connectionState, 'waiting');
  port.reply(emptyResponse(port));
  await second;
  assert.equal(client.connectionState, 'idle');
  client.dispose();
});

test('送信できなかった要求と送信後の要求を区別し、入力は送信時点で複製する', async () => {
  const port = new Port(),
    client = new TradeWorkerClient(port),
    f = workerFixture();
  port.throwOnSend = true;
  await assert.rejects(client.request({ kind: 'queryCandidate' }), /send-failed/);
  assert.equal(client.connectionState, 'idle');
  port.throwOnSend = false;
  const open = client.request({ kind: 'openCandidate', localWorldId: f.initial.localWorldId });
  port.reply(await f.workspace.handle(port.sent.at(-1)));
  const opened = await open;
  const command = beginCommand(f.initial),
    expected = structuredClone(command),
    running = client.request({
      kind: 'candidateCommand',
      sessionId: opened.active!.sessionId,
      command,
    });
  command.benchIds.away = [];
  const sent = port.sent.at(-1)!;
  assert.equal(sent.kind, 'candidateCommand');
  if (sent.kind !== 'candidateCommand') return;
  assert.deepEqual(sent.command, expected);
  port.reply(await f.workspace.handle(sent));
  assert.equal((await running).result!.status, 'applied');
  client.dispose();
});

test('通信失敗はclientを停止し、自動再送や保存成功の推測をしない', async () => {
  const port = new Port(),
    client = new TradeWorkerClient(port),
    promise = client.request({ kind: 'queryCandidate' });
  const rejected = assert.rejects(promise, /保存の成否/);
  port.dispatchEvent(new Event('error'));
  await rejected;
  assert.equal(client.connectionState, 'stopped');
  assert.equal(port.terminated, true);
  assert.equal(port.sent.length, 1);
  await assert.rejects(client.request({ kind: 'queryCandidate' }), /停止/);
  client.dispose();
});

test('不正形式・無対応ID・欠けたviewを受けても待ち続けず、応答照合エラーで停止する', async () => {
  const breakResponse: ((value: TradeWorkerResponse) => unknown)[] = [
    (value) => ({ ...value, protocol: 'unknown' }),
    (value) => ({ ...value, ok: false }),
    (value) => ({ ...value, requestId: null }),
    (value) => ({ ...value, workspaceRevision: -1 }),
    (value) => ({ ...value, view: { kind: 'unknown' } }),
    (value) => ({
      ...value,
      active: {
        sessionId: 'token',
        localWorldId: 'x',
        worldId: 'w',
        stateRevision: 1,
        storageRevision: 1,
        reloadRequired: false,
      },
    }),
  ];
  for (const change of breakResponse) {
    const port = new Port(),
      client = new TradeWorkerClient(port),
      promise = client.request({ kind: 'queryCandidate' });
    const rejected = assert.rejects(promise, /応答を照合/);
    port.reply(change(emptyResponse(port)));
    await rejected;
    assert.equal(client.connectionState, 'stopped');
  }
});

test('再読込後は新しいsessionId・切替版を使い、古い画面指示を補正して再送しない', async () => {
  const port = new Port(),
    client = new TradeWorkerClient(port),
    f = workerFixture();
  const open = client.request({ kind: 'openCandidate', localWorldId: f.initial.localWorldId });
  port.reply(await f.workspace.handle(port.sent.at(-1)));
  const first = await open;
  const reload = client.request({
    kind: 'reloadCandidate',
    sessionId: first.active!.sessionId,
    expectedStateRevision: first.active!.stateRevision,
  });
  port.reply(await f.workspace.handle(port.sent.at(-1)));
  const refreshed = await reload;
  assert.notEqual(refreshed.active!.sessionId, first.active!.sessionId);
  await assert.rejects(
    client.request({
      kind: 'candidateCommand',
      sessionId: first.active!.sessionId,
      command: beginCommand(f.initial),
    }),
    /切替・再読込/,
  );
  const command = beginCommand(f.initial),
    run = client.request({
      kind: 'candidateCommand',
      sessionId: refreshed.active!.sessionId,
      command,
    });
  const sent = port.sent.at(-1)!;
  assert.equal(sent.expectedWorkspaceRevision, refreshed.workspaceRevision);
  assert.ok('sessionId' in sent);
  if ('sessionId' in sent) assert.equal(sent.sessionId, refreshed.active!.sessionId);
  port.reply(await f.workspace.handle(sent));
  assert.equal((await run).result!.status, 'applied');
  client.dispose();
});

test('応答待ちでない時の通信停止も購読者へ一度通知し、解除後は呼ばない', () => {
  const port = new Port(),
    client = new TradeWorkerClient(port);
  const states: string[] = [];
  const unsubscribe = client.subscribe(() => states.push(client.connectionState));
  port.dispatchEvent(new Event('error'));
  assert.deepEqual(states, ['stopped']);
  assert.equal(port.sent.length, 0);
  unsubscribe();
  client.dispose();
  assert.deepEqual(states, ['stopped']);
});

test('表示通知の例外で送信済み要求を解放せず、他の購読者と応答を維持する', async () => {
  const port = new Port(),
    client = new TradeWorkerClient(port);
  const unsubscribe = client.subscribe(() => {
    throw new Error('表示通知だけの失敗');
  });
  const states: string[] = [];
  const stop = client.subscribe(() => states.push(client.connectionState));
  const pending = client.request({ kind: 'listCandidates' });
  assert.equal(client.connectionState, 'waiting');
  await assert.rejects(client.request({ kind: 'queryCandidate' }), /応答を待って/);
  port.reply(emptyResponse(port));
  assert.equal((await pending).ok, true);
  assert.deepEqual(states, ['waiting', 'idle']);
  assert.equal(port.sent.length, 1);
  unsubscribe();
  stop();
  client.dispose();
});

test('編成確認にも元画面のsessionを要求し、検査結果を元指示IDへ対応付ける', async () => {
  const port = new Port(),
    client = new TradeWorkerClient(port),
    f = workerFixture();
  const opening = client.request({ kind: 'openCandidate', localWorldId: f.initial.localWorldId });
  port.reply(await f.workspace.handle(port.sent.at(-1)));
  const first = await opening;
  const draft = createTradeRosterDraft(first.active!, first.view!),
    squad = draft.squads[0]!;
  const action = buildTradeRosterAction(
    first.active!,
    first.view!,
    swapDraftPositions(draft, squad.squadId, 1, 2),
    'client-preview',
  );
  await assert.rejects(
    client.request({ kind: 'previewCandidateRoster', sessionId: 'stale', command: action.command }),
    /切替・再読込/,
  );
  const pending = client.request({
    kind: 'previewCandidateRoster',
    sessionId: first.active!.sessionId,
    command: action.command,
  });
  port.reply(await f.workspace.handle(port.sent.at(-1)));
  assert.equal((await pending).rosterPreview?.commandId, 'client-preview');
  assert.equal(f.writes(), 0);
  client.dispose();
});

test('編成検査結果の欠落・別ID・別版・不正形式で待ち続けず停止する', async () => {
  const changes: ((response: TradeWorkerResponse) => unknown)[] = [
    (r) => ({ ...r, rosterPreview: undefined }),
    (r) => ({ ...r, rosterPreview: null }),
    (r) => ({ ...r, rosterPreview: { ...r.rosterPreview, commandId: 'other' } }),
    (r) => ({ ...r, rosterPreview: { ...r.rosterPreview, stateRevision: -1 } }),
    (r) => ({ ...r, rosterPreview: { ...r.rosterPreview, audit: null } }),
  ];
  for (const change of changes) {
    const port = new Port(),
      client = new TradeWorkerClient(port),
      f = workerFixture();
    const opening = client.request({ kind: 'openCandidate', localWorldId: f.initial.localWorldId });
    port.reply(await f.workspace.handle(port.sent.at(-1)));
    const first = await opening;
    const draft = createTradeRosterDraft(first.active!, first.view!),
      squad = draft.squads[0]!;
    const action = buildTradeRosterAction(
      first.active!,
      first.view!,
      swapDraftPositions(draft, squad.squadId, 1, 2),
      'bad-preview',
    );
    const pending = client.request({
      kind: 'previewCandidateRoster',
      sessionId: first.active!.sessionId,
      command: action.command,
    });
    const rejected = assert.rejects(pending, /応答を照合/);
    port.reply(change(await f.workspace.handle(port.sent.at(-1))));
    await rejected;
    assert.equal(client.connectionState, 'stopped');
    assert.equal(f.writes(), 0);
  }
});
