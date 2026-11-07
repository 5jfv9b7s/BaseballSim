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

function copiedCreationAction(request: TradeWorkerRequest) {
  return {
    kind: request.kind,
    ...('creationId' in request ? { creationId: request.creationId } : {}),
    ...('source' in request ? { source: structuredClone(request.source) } : {}),
  };
}
function validCreationRef(source: unknown) {
  if (!source || typeof source !== 'object') return false;
  const s = source as {
    localWorldId: unknown;
    snapshotId: unknown;
    storageRevision: unknown;
    slotKind: unknown;
  };
  return (
    typeof s.localWorldId === 'string' &&
    s.localWorldId.length > 0 &&
    typeof s.snapshotId === 'string' &&
    s.snapshotId.length > 0 &&
    Number.isSafeInteger(s.storageRevision) &&
    (s.storageRevision as number) > 0 &&
    ['auto', 'manual', 'previousAuto'].includes(s.slotKind as string)
  );
}
function validCreationSummary(value: unknown) {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.date === 'string' &&
    typeof s.seasonId === 'string' &&
    typeof s.controlledClub === 'string' &&
    ['playerCount', 'clubCount', 'contractCount'].every(
      (key) => Number.isSafeInteger(s[key]) && (s[key] as number) >= 0,
    ) &&
    Array.isArray(s.budgets) &&
    s.budgets.length === s.clubCount &&
    s.budgets.every((b: unknown) => {
      if (!b || typeof b !== 'object') return false;
      const row = b as Record<string, unknown>;
      return (
        typeof row.clubId === 'string' &&
        typeof row.name === 'string' &&
        Number.isSafeInteger(row.cashYen) &&
        Number.isSafeInteger(row.availableYen)
      );
    })
  );
}
function validCreationResponse(
  response: TradeWorkerResponse,
  action: ReturnType<typeof copiedCreationAction>,
) {
  const status = response?.creation;
  if (
    status !== undefined &&
    status !== null &&
    (!status ||
      typeof status !== 'object' ||
      typeof status.creationId !== 'string' ||
      status.localWorldId !== 'trade-create-' + status.creationId ||
      !['ready', 'uncertain', 'created'].includes(status?.state) ||
      response.active !== null ||
      !validCreationSummary(status.summary) ||
      !validCreationRef(status.source))
  )
    return false;
  if (!response?.ok) return true;
  if (
    action.kind === 'createCandidate' &&
    (status?.creationId !== action.creationId || status?.state !== 'created')
  )
    return false;
  if (action.kind === 'clearCandidateCreation' && status !== null) return false;
  if (action.kind === 'inspectCandidateCreation') {
    const result = response.creationInspection;
    if (
      !result ||
      result.creationId !== action.creationId ||
      !['ready', 'blocked'].includes(result.status) ||
      !Array.isArray(result.issues) ||
      !Number.isSafeInteger(result.issueCount) ||
      result.issueCount < 0 ||
      !result.issues.every((i) => i && typeof i.path === 'string' && typeof i.message === 'string')
    )
      return false;
    if (
      result.status === 'ready' &&
      (status?.creationId !== action.creationId || status?.state !== 'ready')
    )
      return false;
    if (
      result.status === 'ready' &&
      (!action.source ||
        !status?.source ||
        Object.entries(action.source).some(
          ([key, value]) => Reflect.get(status.source, key) !== value,
        ))
    )
      return false;
    if (result.status === 'blocked' && status !== null) return false;
  }
  if (action.kind === 'getCandidateInitialTemplate') {
    const template = response.initialTemplate;
    if (
      !template ||
      typeof template.text !== 'string' ||
      !template.source ||
      !action.source ||
      Object.entries(action.source).some(
        ([key, value]) => Reflect.get(template.source, key) !== value,
      )
    )
      return false;
  }
  if (
    action.kind === 'listCandidateSources' &&
    (!Array.isArray(response.creationSources) ||
      response.creationSources.some(
        (s) =>
          !s ||
          typeof s.localWorldId !== 'string' ||
          typeof s.snapshotId !== 'string' ||
          typeof s.label !== 'string' ||
          typeof s.gameDate !== 'string' ||
          typeof s.supported !== 'boolean' ||
          !Number.isSafeInteger(s.storageRevision) ||
          !['auto', 'manual', 'previousAuto'].includes(s.slotKind),
      ))
  )
    return false;
  return true;
}

/** 表示用応答だけ保持。送信は一度に一つ、自動再送・自動保存・独自の世界変更をしない。 */
export class TradeWorkerClient {
  private readonly worker: TradeWorkerPort;
  private latest: TradeWorkerResponse | null = null;
  private pending: {
    requestId: string;
    preview: { commandId: string; stateRevision: number } | null;
    creationRequest: ReturnType<typeof copiedCreationAction>;
    resolve: (response: TradeWorkerResponse) => void;
    reject: (error: Error) => void;
  } | null = null;
  private closed = false;
  private listeners = new Set<() => void>();
  /** 応答待ちでない時の通信停止も画面へ通知する。 */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private publish() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* 表示通知の失敗で、送信済み要求を未送信扱いにしない。 */
      }
    }
  }
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
        'previewCandidateRoster',
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
      this.pending = {
        requestId: request.requestId,
        creationRequest: copiedCreationAction(request),
        preview:
          request.kind === 'previewCandidateRoster'
            ? {
                commandId: request.command.commandId,
                stateRevision: request.command.expectedStateRevision,
              }
            : null,
        resolve,
        reject,
      };
      try {
        this.worker.postMessage(request);
        this.publish();
      } catch (error) {
        this.pending = null;
        this.publish();
        reject(error instanceof Error ? error : new Error('要求を送信できませんでした'));
      }
    });
  }

  private onMessage: EventListener = (event) => {
    if (this.closed) return;
    const response = (event as MessageEvent<unknown>).data as TradeWorkerResponse;
    if (this.lastResponseId !== null && response?.requestId === this.lastResponseId) return;
    if (!this.pending) return;
    const preview = response?.rosterPreview;
    const expectedPreview = this.pending.preview;
    const previewValid =
      preview === undefined
        ? !response?.ok || expectedPreview === null
        : preview !== null &&
          typeof preview === 'object' &&
          response?.ok &&
          expectedPreview !== null &&
          preview.commandId === expectedPreview.commandId &&
          preview.stateRevision === expectedPreview.stateRevision &&
          response.active?.stateRevision === expectedPreview.stateRevision &&
          (preview.status === 'blocked'
            ? Array.isArray(preview.issues) &&
              preview.issues.every(
                (i) => i && typeof i.code === 'string' && typeof i.message === 'string',
              )
            : preview.status === 'ready' &&
              preview.audit &&
              Array.isArray(preview.audit.changedPlayerIds) &&
              preview.audit.changedPlayerIds.every((id) => typeof id === 'string') &&
              Array.isArray(preview.audit.invalidatedOverrides) &&
              preview.audit.invalidatedOverrides.every(
                (r) =>
                  r &&
                  typeof r.gameId === 'string' &&
                  Array.isArray(r.fields) &&
                  r.fields.every((f) => ['lineup', 'starterId', 'benchIds'].includes(f)),
              ));
    if (
      !response ||
      !validCreationResponse(response, this.pending.creationRequest) ||
      !previewValid ||
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
    this.publish();
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
    this.publish();
    pending?.reject(new Error(message));
  }
  dispose() {
    this.stop('候補Workerを終了しました。送信済み操作は保存から再確認してください。');
  }
}

/** 開発メニューの候補プレイ画面専用。通常WorldAppの正本は共有しない。 */
export function createTradeWorkerClient() {
  return new TradeWorkerClient(
    new Worker(new URL('../trade-world-worker.ts', import.meta.url), { type: 'module' }),
  );
}
