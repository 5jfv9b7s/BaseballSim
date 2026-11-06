import assert from 'node:assert/strict';
import { TradeGameSession } from '../../src/world/trade-game-session.ts';
import { TradeWorkerWorkspace } from '../../src/world/trade-worker-workspace.ts';
import {
  TRADE_WORKER_PROTOCOL,
  type TradeWorkerRequest,
  type TradeWorkerResponse,
} from '../../src/world/trade-worker-protocol.ts';
import { gameFixture, memoryStorage } from './trade-game-fixture.ts';

let requestNo = 0;
type Action<T> = T extends unknown
  ? Omit<T, 'protocol' | 'requestId' | 'expectedWorkspaceRevision' | 'sessionId'>
  : never;
export function request(
  response: TradeWorkerResponse | null,
  action: Action<TradeWorkerRequest>,
): TradeWorkerRequest {
  const session = [
    'candidateCommand',
    'saveCandidateManual',
    'reloadCandidate',
    'closeCandidate',
  ].includes(action.kind);
  return {
    ...action,
    protocol: TRADE_WORKER_PROTOCOL,
    requestId: 'worker-request-' + ++requestNo,
    expectedWorkspaceRevision: response?.workspaceRevision ?? 0,
    ...(session ? { sessionId: response!.active!.sessionId } : {}),
  } as TradeWorkerRequest;
}
export function workerFixture(fixture = gameFixture()) {
  const memory = memoryStorage(fixture.initial);
  const workspace = new TradeWorkerWorkspace({
    async open(id) {
      assert.equal(id, fixture.initial.localWorldId);
      return TradeGameSession.open(memory.storage);
    },
    async list() {
      return [];
    },
  });
  return { ...fixture, ...memory, workspace };
}
export async function opened(f: ReturnType<typeof workerFixture>) {
  const response = await f.workspace.handle(
    request(null, { kind: 'openCandidate', localWorldId: f.initial.localWorldId }),
  );
  assert.equal(response.ok, true);
  assert.ok(response.view);
  assert.ok(response.active);
  return response;
}
