import {
  TRADE_WORKER_PROTOCOL,
  type TradeWorkerRequest,
  type TradeWorkerResponse,
} from './trade-worker-protocol.ts';

type Action<T> = T extends unknown
  ? Omit<T, 'protocol' | 'requestId' | 'expectedWorkspaceRevision'>
  : never;
export type TradeWorkerAction = Action<TradeWorkerRequest>;
export interface TradeWorkerPort {
  postMessage(message: TradeWorkerRequest): void;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
  terminate(): void;
}

/** 表示用応答だけ保持。送信は一度に一つ、自動再送・自動保存・独自の世界変更をしない。 */
export class TradeWorkerClient {
  private readonly worker: TradeWorkerPort;
  private latest: TradeWorkerResponse | null = null;
  private pending: {
    requestId: string;
    resolve: (response: TradeWorkerResponse) => void;
    reject: (error: Error) => void;
  } | null = null;
  private closed = false;
  private lastResponseId: string | null = null;
  constructor(worker: TradeWorkerPort) {
    this.worker = worker;
    worker.addEventListener('message', this.onMessage);
    worker.addEventListener('error', this.onFailure);
    worker.addEventListener('messageerror', this.onFailure);
  }
  get connectionState(): 'idle' | 'waiting' | 'stopped' {
    return this.closed ? 'stopped' : this.pending ? 'waiting' : 'idle';
  }
  read(): TradeWorkerResponse | null {
    return structuredClone(this.latest);
  }

  /** sessionIdは指示を作った画面の値を要求し、古い下書きへ新しい値を補わない。 */
  request(action: TradeWorkerAction): Promise<TradeWorkerResponse> {
    if (this.closed)
      return Promise.reject(
        new Error('候補Workerは停止しています。新しいWorkerで保存から再開してください。'),
      );
    if (this.pending) return Promise.reject(new Error('候補Workerの応答を待ってください。'));
    let request: TradeWorkerRequest;
    try {
      const copied = structuredClone(action);
      const scoped = [
        'candidateCommand',
        'saveCandidateManual',
        'reloadCandidate',
        'closeCandidate',
      ].includes(copied.kind);
      if (scoped && !this.latest?.active) throw new Error('先に移籍候補を開いてください');
      if (
        scoped &&
        (!('sessionId' in copied) || copied.sessionId !== this.latest!.active!.sessionId)
      )
        throw new Error('画面の対象が切替・再読込されています。新しい表示から指示してください');
      request = {
        ...copied,
        protocol: TRADE_WORKER_PROTOCOL,
        requestId: crypto.randomUUID(),
        expectedWorkspaceRevision: this.latest?.workspaceRevision ?? 0,
      } as TradeWorkerRequest;
    } catch (error) {
      return Promise.reject(error);
    }
    return new Promise((resolve, reject) => {
      this.pending = { requestId: request.requestId, resolve, reject };
      try {
        this.worker.postMessage(request);
      } catch (error) {
        this.pending = null;
        reject(error instanceof Error ? error : new Error('要求を送信できませんでした'));
      }
    });
  }

  private onMessage: EventListener = (event) => {
    if (this.closed) return;
    const response = (event as MessageEvent<unknown>).data as TradeWorkerResponse;
    if (this.lastResponseId !== null && response?.requestId === this.lastResponseId) return;
    if (!this.pending) return;
    if (
      !response ||
      response.protocol !== TRADE_WORKER_PROTOCOL ||
      response.requestId !== this.pending.requestId ||
      typeof response.ok !== 'boolean' ||
      (!response.ok && typeof response.error !== 'string') ||
      !Number.isSafeInteger(response.workspaceRevision) ||
      response.workspaceRevision < 0 ||
      (response.active !== null &&
        (!response.active ||
          typeof response.active.sessionId !== 'string' ||
          response.active.sessionId.length === 0 ||
          typeof response.active.localWorldId !== 'string' ||
          response.active.localWorldId.length === 0 ||
          typeof response.active.worldId !== 'string' ||
          response.active.worldId.length === 0 ||
          !Number.isSafeInteger(response.active.stateRevision) ||
          response.active.stateRevision < 0 ||
          !Number.isSafeInteger(response.active.storageRevision) ||
          response.active.storageRevision < 1 ||
          typeof response.active.reloadRequired !== 'boolean')) ||
      (response.view !== null && response.view?.kind !== 'trade-play-view-v1') ||
      response.workspaceRevision < (this.latest?.workspaceRevision ?? 0) ||
      (response.active === null
        ? response.view !== null
        : response.view === null
          ? response.ok || !response.active.reloadRequired
          : response.active.localWorldId !== response.view.localWorldId ||
            response.active.worldId !== response.view.worldId ||
            response.active.stateRevision !== response.view.stateRevision ||
            response.active.storageRevision !== response.view.storageRevision)
    ) {
      this.stop('候補Workerの応答を照合できません。送信済み操作は保存から再確認してください。');
      return;
    }
    const pending = this.pending;
    this.pending = null;
    this.lastResponseId = response.requestId;
    this.latest = structuredClone(response);
    pending.resolve(structuredClone(response));
  };
  private onFailure: EventListener = () => {
    this.stop('候補Workerで通信エラーが発生しました。保存の成否は再開時に確認してください。');
  };
  private stop(message: string) {
    if (this.closed) return;
    this.closed = true;
    this.worker.removeEventListener('message', this.onMessage);
    this.worker.removeEventListener('error', this.onFailure);
    this.worker.removeEventListener('messageerror', this.onFailure);
    this.worker.terminate();
    const pending = this.pending;
    this.pending = null;
    pending?.reject(new Error(message));
  }
  dispose() {
    this.stop('候補Workerを終了しました。送信済み操作は保存から再確認してください。');
  }
}

/** 通常WorldAppはまだ呼ばない。将来の画面から使う候補専用の接続窓口。 */
export function createTradeWorkerClient() {
  return new TradeWorkerClient(
    new Worker(new URL('../trade-world-worker.ts', import.meta.url), { type: 'module' }),
  );
}
