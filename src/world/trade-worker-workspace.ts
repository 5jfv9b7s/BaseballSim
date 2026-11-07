import { previewTradeRoster } from './trade-roster-preview.ts';
import { parseTradeWorkerRequest } from './trade-worker-validation.ts';
import { ensure, integer } from '../engine/validation.ts';
import { tradePlayView } from './trade-play-view.ts';
import { TradeGameSession } from './trade-game-session.ts';
import {
  TRADE_WORKER_PROTOCOL,
  MAX_TRADE_WORKER_ID_CHARS,
  type TradeWorkerRequest,
  type TradeWorkerResponse,
  type TradeWorkerResult,
} from './trade-worker-protocol.ts';
import type { TradeCandidateIndexEntry } from './trade-candidate-index.ts';

/** DB取得だけを差し替え可能にし、UIへ正本の注入窓口は渡さない。 */
export interface TradeWorkerAccess {
  open(localWorldId: string): Promise<TradeGameSession>;
  list(): Promise<TradeCandidateIndexEntry[]>;
}

/** 一つの候補だけを所有する。通常WorldWorkspaceとは状態・通信形式を分離する。 */
export class TradeWorkerWorkspace {
  private session: TradeGameSession | null = null;
  private sessionId: string | null = null;
  private workspaceRevision = 0;
  private viewFailed = false;
  private queue: Promise<void> = Promise.resolve();
  private readonly access: TradeWorkerAccess;
  constructor(access: TradeWorkerAccess) {
    this.access = access;
  }

  /** 受信時に入力を複製。失敗した要求で後続キューを壊さない。 */
  handle(input: unknown): Promise<TradeWorkerResponse> {
    let received: unknown,
      cloneError = false;
    try {
      received = structuredClone(input);
    } catch {
      cloneError = true;
    }
    const next = this.queue.then(() => this.process(received, cloneError));
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private response(
    requestId: string | null,
    result?: TradeWorkerResult,
    error?: string,
    candidates?: TradeCandidateIndexEntry[],
  ): TradeWorkerResponse {
    const read = this.session?.read();
    let view = null;
    if (read) {
      try {
        view = tradePlayView(read, this.viewFailed);
      } catch (failure) {
        this.viewFailed = true;
        error =
          failure instanceof Error
            ? failure.message
            : '候補の表示を構成できません。再読込が必要です';
      }
    }
    const active = read
      ? {
          sessionId: this.sessionId!,
          localWorldId: read.snapshot.localWorldId,
          worldId: read.snapshot.worldId,
          stateRevision: read.snapshot.stateRevision,
          storageRevision: read.snapshot.storageRevision,
          reloadRequired: read.reloadRequired || this.viewFailed,
        }
      : null;
    return {
      protocol: TRADE_WORKER_PROTOCOL,
      requestId,
      workspaceRevision: this.workspaceRevision,
      active,
      view,
      ...(error === undefined ? { ok: true as const } : { ok: false as const, error }),
      ...(result && error === undefined ? { result } : {}),
      ...(candidates ? { candidates } : {}),
    };
  }

  private requireActive(request: Extract<TradeWorkerRequest, { sessionId: string }>) {
    ensure(
      this.session && request.sessionId === this.sessionId,
      '切替前・再読込前の候補への要求です',
    );
    if (request.kind !== 'reloadCandidate')
      ensure(!this.viewFailed, '表示の構成に失敗しています。明示的に再読込してください');
    if ('expectedStateRevision' in request)
      ensure(
        request.expectedStateRevision === this.session.read().snapshot.stateRevision,
        '古い状態への保存・切替要求です',
      );
    return this.session;
  }
  private requireSwitchable() {
    if (!this.session) return;
    const read = this.session.read();
    ensure(
      !read.saving && !read.reloadRequired && !this.viewFailed && read.pendingCommands === 0,
      '未保存・成否不明の候補があります。保存または明示再読込を完了してください',
    );
  }
  private nextActivation() {
    integer(this.workspaceRevision, 0, Number.MAX_SAFE_INTEGER - 2, 'Workerの切替版');
    const revision = this.workspaceRevision + 1;
    // 操作用の識別子。試合や日次のRNGには混ぜない。
    return { revision, sessionId: crypto.randomUUID() };
  }

  private async process(value: unknown, cloneError: boolean): Promise<TradeWorkerResponse> {
    let requestId: string | null = null;
    try {
      ensure(!cloneError, 'Worker要求を複製できません');
      if (
        value &&
        typeof value === 'object' &&
        'requestId' in value &&
        typeof value.requestId === 'string' &&
        value.requestId.trim().length > 0 &&
        value.requestId.length <= MAX_TRADE_WORKER_ID_CHARS
      )
        requestId = value.requestId;
      const request = parseTradeWorkerRequest(value);
      requestId = request.requestId;
      ensure(
        request.expectedWorkspaceRevision === this.workspaceRevision,
        '古いWorker切替状態への要求です',
      );
      if (request.kind === 'listCandidates')
        return this.response(requestId, undefined, undefined, await this.access.list());
      if (request.kind === 'queryCandidate') return this.response(requestId);
      let result: TradeWorkerResult;
      if (request.kind === 'openCandidate') {
        this.requireSwitchable();
        const activation = this.nextActivation();
        const next = await this.access.open(request.localWorldId);
        const read = next.read();
        ensure(
          read.snapshot.localWorldId === request.localWorldId &&
            read.pendingCommands === 0 &&
            !read.reloadRequired,
          '再開した候補の対象・保存状態が異なります',
        );
        tradePlayView(read); // 表示も構成できた後だけ所有者を切り替える。
        this.session = next;
        this.sessionId = activation.sessionId;
        this.workspaceRevision = activation.revision;
        this.viewFailed = false;
        result = { status: 'opened' };
      } else {
        const session = this.requireActive(request);
        if (request.kind === 'previewCandidateRoster') {
          const rosterPreview = previewTradeRoster(session.read(), request.command);
          const response = this.response(requestId);
          return response.ok ? { ...response, rosterPreview } : response;
        }
        if (request.kind === 'closeCandidate') {
          this.requireSwitchable();
          const activation = this.nextActivation();
          this.session = null;
          this.sessionId = null;
          this.workspaceRevision = activation.revision;
          result = { status: 'closed' };
        } else if (request.kind === 'reloadCandidate') {
          const activation = this.nextActivation();
          await session.reload();
          this.sessionId = activation.sessionId;
          this.workspaceRevision = activation.revision;
          this.viewFailed = false;
          result = { status: 'reloaded' };
        } else if (request.kind === 'saveCandidateManual')
          result = { status: await session.saveManual() };
        else {
          const command = request.command;
          const executed =
            command.kind === 'beginTradeGame' || command.kind === 'advanceTradeGame'
              ? session.execute(command)
              : command.kind === 'setTradeRegistrations' || command.kind === 'setTradeRosterPolicy'
                ? await session.changeRoster(command)
                : command.kind === 'commitAcceptedTrade'
                  ? await session.commitTrade(command)
                  : await session.completeDay(command);
          if (executed.status === 'blocked') {
            const issues =
              'issues' in executed
                ? executed.issues
                : executed.reason === 'conditions'
                  ? executed.details.stage === 'roster'
                    ? executed.details.issues
                    : executed.details.blockers
                  : [];
            result = {
              status: 'blocked',
              reason: 'reason' in executed ? executed.reason : 'registrationConditions',
              issues: issues.map((i) => ({
                code: i.code,
                message: i.message,
                ...(i.clubId !== undefined ? { clubId: i.clubId } : {}),
                ...(i.playerId !== undefined ? { playerId: i.playerId } : {}),
                ...('squadId' in i && i.squadId !== undefined ? { squadId: i.squadId } : {}),
                ...('gameId' in i && i.gameId !== undefined ? { gameId: i.gameId } : {}),
              })),
            };
          } else {
            const { fingerprint: _fingerprint, ...receipt } = executed.receipt;
            result = { status: executed.status, receipt };
          }
        }
      }
      return this.response(requestId, result);
    } catch (error) {
      // 不正要求・保存失敗も応答する。セッション側が成否不明を保持し、勝手に再試行しない。
      return this.response(
        requestId,
        undefined,
        error instanceof Error ? error.message : '候補の処理に失敗しました',
      );
    }
  }
}
