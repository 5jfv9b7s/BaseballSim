import {
  MAX_TRADE_CREATION_REQUEST_CHARS,
  MAX_TRADE_INITIAL_INPUT_BYTES,
} from './trade-creation-types.ts';
import { ensure, integer } from '../engine/validation.ts';
import { canonicalJson } from '../storage/canonical.ts';
import { exactKeys } from './snapshot-codec.ts';
import { parseTradeGameCommand } from './trade-game-commands.ts';
import { parseTradeDayCommand } from './trade-day-commands.ts';
import { parseTradeRosterCommand } from './trade-roster-commands.ts';
import { receiptCommand } from './trade-save-validation.ts';
import {
  TRADE_WORKER_PROTOCOL,
  MAX_TRADE_WORKER_REQUEST_CHARS,
  MAX_TRADE_WORKER_ID_CHARS,
  type TradeWorkerRequest,
} from './trade-worker-protocol.ts';

function transportId(id: unknown): asserts id is string {
  ensure(
    typeof id === 'string' && id.trim().length > 0 && id.length <= MAX_TRADE_WORKER_ID_CHARS,
    'Workerの識別子が不正です',
  );
}

/** 世界全体・承認済みフラグ・台帳の直接差替は受けない。既存の指示検査を使う。 */
export function parseTradeWorkerRequest(value: unknown): TradeWorkerRequest {
  ensure(value && typeof value === 'object', 'Workerの要求が不正です');
  ensure(
    canonicalJson(value).length <=
      ('kind' in value && value.kind === 'inspectCandidateCreation'
        ? MAX_TRADE_CREATION_REQUEST_CHARS
        : MAX_TRADE_WORKER_REQUEST_CHARS),
    'Worker要求の容量を超えています',
  );
  const request = value as TradeWorkerRequest;
  ensure(request.protocol === TRADE_WORKER_PROTOCOL, '未対応のWorker通信形式です');
  transportId(request.requestId);
  integer(request.expectedWorkspaceRevision, 0, Number.MAX_SAFE_INTEGER - 1, 'Workerの切替版');
  const common = ['protocol', 'requestId', 'expectedWorkspaceRevision', 'kind'];
  switch (request.kind) {
    case 'listCandidates':
    case 'queryCandidate':
    case 'listCandidateSources':
      exactKeys(request, common, '読取要求');
      break;
    case 'getCandidateInitialTemplate':
    case 'inspectCandidateCreation': {
      exactKeys(
        request,
        [
          ...common,
          'source',
          ...(request.kind === 'inspectCandidateCreation' ? ['inputText', 'creationId'] : []),
        ],
        '新規候補の初期入力要求',
      );
      exactKeys(
        request.source,
        ['localWorldId', 'slotKind', 'snapshotId', 'storageRevision'],
        '元保存の参照',
      );
      transportId(request.source.localWorldId);
      transportId(request.source.snapshotId);
      ensure(
        ['auto', 'manual', 'previousAuto'].includes(request.source.slotKind),
        '元保存の枠が不正です',
      );
      integer(request.source.storageRevision, 1, Number.MAX_SAFE_INTEGER, '元保存の版');
      if (request.kind === 'inspectCandidateCreation') {
        ensure(
          typeof request.inputText === 'string' &&
            new TextEncoder().encode(request.inputText).length <= MAX_TRADE_INITIAL_INPUT_BYTES,
          '初期入力ファイルは2MiB以下にしてください',
        );
        ensure(
          typeof request.creationId === 'string' &&
            /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
              request.creationId,
            ),
          '作成IDが不正です',
        );
      }
      break;
    }
    case 'createCandidate':
    case 'clearCandidateCreation':
      exactKeys(request, [...common, 'creationId'], '新規候補の作成・破棄要求');
      transportId(request.creationId);
      break;
    case 'openCandidate':
      exactKeys(request, [...common, 'localWorldId'], '候補を開く要求');
      transportId(request.localWorldId);
      break;
    case 'saveCandidateManual':
    case 'reloadCandidate':
    case 'closeCandidate':
      exactKeys(request, [...common, 'sessionId', 'expectedStateRevision'], '候補の保存・切替要求');
      transportId(request.sessionId);
      integer(request.expectedStateRevision, 0, Number.MAX_SAFE_INTEGER, '候補の状態版');
      break;
    case 'previewCandidateRoster':
      exactKeys(request, [...common, 'sessionId', 'command'], '編成確認要求');
      transportId(request.sessionId);
      ensure(
        parseTradeRosterCommand(request.command).kind === 'setTradeRegistrations',
        '登録・編成案だけを確認できます',
      );
      break;
    case 'candidateCommand': {
      exactKeys(request, [...common, 'sessionId', 'command'], '候補への指示要求');
      transportId(request.sessionId);
      const command = request.command;
      ensure(command && typeof command === 'object', '候補への指示がありません');
      switch (command.kind) {
        case 'beginTradeGame':
        case 'advanceTradeGame':
          parseTradeGameCommand(command);
          break;
        case 'completeTradeDay':
        case 'completeTradeDayWithRoster':
          parseTradeDayCommand(command);
          break;
        case 'setTradeRegistrations':
        case 'setTradeRosterPolicy':
          parseTradeRosterCommand(command);
          break;
        case 'commitAcceptedTrade':
          receiptCommand(canonicalJson(command));
          break;
        default:
          throw new Error('未対応の候補指示です');
      }
      break;
    }
    default:
      throw new Error('未対応のWorker要求です');
  }
  return request;
}
