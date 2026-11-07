import type {
  TradeCreationSourceRef,
  TradeCreationSource,
  TradeCreationInspection,
  TradeCreationStatus,
} from './trade-creation-types.ts';
import type { TradeRegistrationCommand, TradeRosterPreview } from './trade-roster-preview.ts';
import type { TradeGameCommand, TradeGameReceipt } from './trade-game-commands.ts';
import type { TradeDayCommand, TradeDayReceipt } from './trade-day-commands.ts';
import type { TradeRosterCommand, TradeRosterReceipt } from './trade-roster-commands.ts';
import type { TradeCommitCommand, TradeCommitReceipt } from '../recruitment/trade-commit.ts';
import type { TradePlayView } from './trade-play-view.ts';
import type { TradeCandidateIndexEntry } from './trade-candidate-index.ts';

/** 画面へ渡すのは定数と型だけ。実行時の検査はWorker側モジュールへ分ける。 */
export const TRADE_WORKER_PROTOCOL = 'trade-worker-v1' as const;
/** 通信だけの試作上限。保存形式やゲーム内IDの上限とは別。 */
export const MAX_TRADE_WORKER_REQUEST_CHARS = 32 * 1024;
export const MAX_TRADE_WORKER_ID_CHARS = 200;
export type TradeWorkerCommand =
  TradeGameCommand | TradeDayCommand | TradeRosterCommand | TradeCommitCommand;
interface Header {
  protocol: typeof TRADE_WORKER_PROTOCOL;
  requestId: string;
  expectedWorkspaceRevision: number;
}
interface SessionScope {
  sessionId: string;
}
export type TradeWorkerRequest = Header &
  (
    | { kind: 'listCandidates' }
    | { kind: 'queryCandidate' }
    | { kind: 'listCandidateSources' }
    | { kind: 'getCandidateInitialTemplate'; source: TradeCreationSourceRef }
    | {
        kind: 'inspectCandidateCreation';
        source: TradeCreationSourceRef;
        inputText: string;
        creationId: string;
      }
    | { kind: 'createCandidate'; creationId: string }
    | { kind: 'clearCandidateCreation'; creationId: string }
    | { kind: 'openCandidate'; localWorldId: string }
    | (SessionScope & { kind: 'candidateCommand'; command: TradeWorkerCommand })
    | (SessionScope & { kind: 'previewCandidateRoster'; command: TradeRegistrationCommand })
    | (SessionScope & { kind: 'saveCandidateManual'; expectedStateRevision: number })
    | (SessionScope & { kind: 'reloadCandidate'; expectedStateRevision: number })
    | (SessionScope & { kind: 'closeCandidate'; expectedStateRevision: number })
  );
export interface TradeWorkerActive {
  sessionId: string;
  localWorldId: string;
  worldId: string;
  stateRevision: number;
  storageRevision: number;
  reloadRequired: boolean;
}
type PublicReceipt<T> = T extends { fingerprint: string } ? Omit<T, 'fingerprint'> : never;
export type TradeWorkerResult =
  | { status: 'opened' | 'closed' | 'reloaded' | 'saved' | 'unchanged' }
  | {
      status: 'applied' | 'committed' | 'replayed';
      receipt: PublicReceipt<
        TradeGameReceipt | TradeDayReceipt | TradeRosterReceipt | TradeCommitReceipt
      >;
    }
  | {
      status: 'blocked';
      reason: string;
      issues: {
        code: string;
        message: string;
        clubId?: string;
        playerId?: string;
        squadId?: string;
        gameId?: string;
      }[];
    };
export type TradeWorkerResponse = {
  protocol: typeof TRADE_WORKER_PROTOCOL;
  requestId: string | null;
  workspaceRevision: number;
  active: TradeWorkerActive | null;
  view: TradePlayView | null;
  result?: TradeWorkerResult;
  candidates?: TradeCandidateIndexEntry[];
  rosterPreview?: TradeRosterPreview;
  creationSources?: TradeCreationSource[];
  initialTemplate?: { source: TradeCreationSourceRef; text: string };
  creationInspection?: TradeCreationInspection;
  creation?: TradeCreationStatus | null;
} & ({ ok: true } | { ok: false; error: string });
