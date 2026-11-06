import { ensure, integer } from '../engine/validation.ts';
import { dateDays } from '../finance/validation.ts';
import { exactKeys } from './snapshot-codec.ts';
import { MAX_BYTES, MAX_ANNUAL_RAW_BYTES, type Snapshot } from './save-format.ts';

export const TRADE_SAVE_FORMAT = 'trade-application-snapshot-v1' as const;
export const TRADE_STORAGE_PROFILE = 'trade-application-v1' as const;
export const MAX_TRADE_BLOCKS = 640;
export const MAX_TRADE_BLOCK_BYTES = 16 * 1024 * 1024;

/** 共通の物理ストアを使い、旧Snapshotの世界版には追加しない。 */
export type TradeStoredSnapshot = Omit<Snapshot, 'versions'> & {
  versions: {
    saveFormatVersion: typeof TRADE_SAVE_FORMAT;
    simulationVersion: 'trade-application-world-v1';
  };
};

const fixedKinds: Record<string, string> = {
  context: 'tradeContext',
  definitions: 'definitions',
  world: 'world',
  finance: 'tradeFinance',
  transactions: 'tradeTransactions',
  stats: 'stats',
  growth: 'growth',
};

export function tradeBlockKind(key: string): string {
  if (Object.hasOwn(fixedKinds, key)) return fixedKinds[key]!;
  if (/^growth\/day\/\d{4}-\d{2}-\d{2}$/.test(key)) {
    dateDays(key.slice(11));
    return 'growthDay';
  }
  if (/^game\/[A-Za-z0-9_-]{1,200}$/.test(key)) return 'game';
  throw new Error('未対応の移籍候補ブロックです');
}

/** バイトの展開前に形式・役割・容量・重複を検査する。 */
export function validateTradeManifest(value: unknown): asserts value is TradeStoredSnapshot {
  ensure(value && typeof value === 'object' && !Array.isArray(value), '候補保存の目録が不正です');
  const s = value as TradeStoredSnapshot;
  exactKeys(
    s,
    [
      'snapshotId',
      'worldId',
      'parentSnapshotId',
      'createdAt',
      'gameDate',
      'stateRevision',
      'saveKind',
      'versions',
      'blockRefs',
      'manifestHash',
    ],
    '候補保存目録',
  );
  for (const id of [s.snapshotId, s.worldId])
    ensure(typeof id === 'string' && id.length > 0 && id.length <= 256, '候補保存のIDが不正です');
  ensure(
    s.parentSnapshotId === null ||
      (typeof s.parentSnapshotId === 'string' &&
        s.parentSnapshotId.length > 0 &&
        s.parentSnapshotId.length <= 256),
    '候補保存の親IDが不正です',
  );
  ensure(
    typeof s.createdAt === 'string' && Number.isFinite(Date.parse(s.createdAt)),
    '候補保存の日時が不正です',
  );
  dateDays(s.gameDate);
  integer(s.stateRevision, 0, Number.MAX_SAFE_INTEGER, '候補保存の状態版');
  ensure(s.saveKind === 'actionAuto', '候補保存の種別が不正です');
  exactKeys(s.versions, ['saveFormatVersion', 'simulationVersion'], '候補保存の版');
  ensure(
    s.versions.saveFormatVersion === TRADE_SAVE_FORMAT &&
      s.versions.simulationVersion === 'trade-application-world-v1',
    '未対応の候補保存形式です',
  );
  ensure(
    typeof s.manifestHash === 'string' && /^[a-f0-9]{64}$/.test(s.manifestHash),
    '候補目録のハッシュが不正です',
  );
  ensure(
    Array.isArray(s.blockRefs) && s.blockRefs.length >= 7 && s.blockRefs.length <= MAX_TRADE_BLOCKS,
    '候補保存のブロック数が不正です',
  );
  const keys = new Set<string>(),
    ids = new Set<string>();
  let raw = 0;
  for (const ref of s.blockRefs) {
    exactKeys(
      ref,
      ['logicalKey', 'blockId', 'kind', 'schemaVersion', 'contentHash', 'rawBytes'],
      '候補ブロック参照',
    );
    ensure(
      typeof ref.logicalKey === 'string' && !keys.has(ref.logicalKey),
      '候補ブロックの役割が重複しています',
    );
    ensure(
      ref.kind === tradeBlockKind(ref.logicalKey) && ref.schemaVersion === TRADE_SAVE_FORMAT,
      '候補ブロックの役割・版が不正です',
    );
    ensure(
      typeof ref.contentHash === 'string' &&
        /^[a-f0-9]{64}$/.test(ref.contentHash) &&
        ref.blockId === 'block-' + ref.contentHash &&
        !ids.has(ref.blockId),
      '候補ブロックのID・ハッシュが不正です',
    );
    integer(ref.rawBytes, 1, MAX_TRADE_BLOCK_BYTES, '候補ブロック容量');
    raw += ref.rawBytes;
    ensure(raw <= MAX_ANNUAL_RAW_BYTES, '候補保存の展開容量を超えました');
    keys.add(ref.logicalKey);
    ids.add(ref.blockId);
  }
  ensure(
    Object.keys(fixedKinds).every((key) => keys.has(key)),
    '候補保存の必須ブロックが不足しています',
  );
}

export const TRADE_STORED_LIMIT = MAX_BYTES;
