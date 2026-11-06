import { ensure } from '../engine/validation.ts';
import { canonicalJson, definitionsFor, sha256 } from '../storage/codec.ts';
import { compress, decompress } from './compression.ts';
import { exactKeys } from './snapshot-codec.ts';
import { MAX_ANNUAL_RAW_BYTES, type Block } from './save-format.ts';
import type { WorldDefinitions } from './types.ts';
import {
  TRADE_SAVE_FORMAT,
  TRADE_GAME_SAVE_FORMAT,
  TRADE_DAY_SAVE_FORMAT,
  TRADE_ROSTER_SAVE_FORMAT,
  TRADE_STORED_LIMIT,
  MAX_TRADE_BLOCK_BYTES,
  MAX_TRADE_BLOCKS,
  tradeBlockKind,
  validateTradeManifest,
  type TradeStoredSnapshot,
} from './trade-save-format.ts';
import {
  TRADE_WORLD_KEYS,
  validateTradeSavedState,
  type TradeSavedState,
} from './trade-save-validation.ts';

const separated = [
  'initialDefinitions',
  'finance',
  'transactions',
  'tradeApprovals',
  'games',
  'stats',
  'contributions',
  'statApplicationMarkers',
  'growth',
];
const coreKeys = TRADE_WORLD_KEYS.filter((key) => !separated.includes(key));

/** 呼出元の更新と分離し、DBの外で検査・直列化・圧縮・ハッシュを完了する。 */
export async function encodeTradeSnapshot(
  input: TradeSavedState,
  parentSnapshotId: string | null,
  saveKind: 'actionAuto' | 'manual' | 'dailyAuto' = 'actionAuto',
): Promise<{ snapshot: TradeStoredSnapshot; blocks: Block[] }> {
  const saved = structuredClone(input);
  validateTradeSavedState(saved);
  const format = Object.hasOwn(saved, 'rosterReceipts')
    ? TRADE_ROSTER_SAVE_FORMAT
    : Object.hasOwn(saved, 'dayReceipts')
      ? TRADE_DAY_SAVE_FORMAT
      : Object.hasOwn(saved, 'gameReceipts')
        ? TRADE_GAME_SAVE_FORMAT
        : TRADE_SAVE_FORMAT;
  const { state, tradeReceipts, ...context } = saved;
  const {
    initialDefinitions,
    finance,
    transactions,
    tradeApprovals,
    games,
    stats,
    contributions,
    statApplicationMarkers,
    growth,
    ...world
  } = state;
  const { days, ...growthState } = growth.state;
  const values: [string, unknown][] = [
    ['context', context],
    [
      'definitions',
      {
        world: initialDefinitions,
        engine: definitionsFor(
          'game-prototype-v11',
          initialDefinitions.matchConfig,
          initialDefinitions.errorConfig,
        ),
      },
    ],
    ['world', world],
    ['finance', finance],
    ['transactions', { transactions, tradeApprovals, tradeReceipts }],
    ['stats', { stats, contributions, statApplicationMarkers }],
    ['growth', { ...growth, state: growthState }],
    ...Object.entries(days).map(([date, day]): [string, unknown] => ['growth/day/' + date, day]),
    ...Object.entries(games).map(([id, game]): [string, unknown] => ['game/' + id, game]),
  ];
  ensure(values.length <= MAX_TRADE_BLOCKS, '候補保存のブロック数を超えました');
  const blocks: Block[] = [];
  let stored = 0,
    rawTotal = 0;
  for (const [logicalKey, value] of values) {
    const kind = tradeBlockKind(logicalKey),
      text = canonicalJson(value);
    const raw = new TextEncoder().encode(text);
    ensure(raw.length <= MAX_TRADE_BLOCK_BYTES, '候補の保存ブロックが16MiBを超えました');
    rawTotal += raw.length;
    ensure(rawTotal <= MAX_ANNUAL_RAW_BYTES, '候補保存の展開容量を超えました');
    const payloadBytes = await compress(raw);
    stored += payloadBytes.length;
    ensure(stored <= TRADE_STORED_LIMIT, '候補保存の圧縮容量を超えました');
    const contentHash = await sha256(kind + ':' + format + ':' + text);
    blocks.push({
      logicalKey,
      kind,
      schemaVersion: format,
      blockId: 'block-' + contentHash,
      contentHash,
      rawBytes: raw.length,
      codec: 'gzip',
      payloadBytes,
    });
  }
  const manifest: Omit<TradeStoredSnapshot, 'manifestHash'> = {
    snapshotId: crypto.randomUUID(),
    worldId: saved.worldId,
    parentSnapshotId,
    createdAt: new Date().toISOString(),
    gameDate: saved.currentDate,
    stateRevision: saved.stateRevision,
    saveKind,
    versions: { saveFormatVersion: format, simulationVersion: state.version },
    blockRefs: blocks.map(({ payloadBytes: _bytes, codec: _codec, ...ref }) => ref),
  };
  const snapshot = { ...manifest, manifestHash: await sha256(canonicalJson(manifest)) };
  validateTradeManifest(snapshot);
  return { snapshot, blocks };
}

/** 全参照とハッシュを確認し、自己完結する候補を復元。親目録へは依存しない。 */
export async function decodeTradeSnapshot(
  input: unknown,
  inputBlocks: readonly (Block | undefined)[],
): Promise<TradeSavedState> {
  validateTradeManifest(input);
  ensure(inputBlocks.length === input.blockRefs.length, '候補保存のブロック数が一致しません');
  let incomingBytes = 0;
  for (const block of inputBlocks) {
    ensure(block?.payloadBytes instanceof Uint8Array, '候補保存のブロックがありません');
    incomingBytes += block.payloadBytes.length;
    ensure(incomingBytes <= TRADE_STORED_LIMIT, '候補保存の圧縮容量を超えました');
  }
  const snapshot = structuredClone(input),
    blocks = structuredClone(inputBlocks);
  const { manifestHash, ...manifest } = snapshot;
  ensure(
    (await sha256(canonicalJson(manifest))) === manifestHash,
    '候補保存の目録ハッシュが一致しません',
  );
  ensure(blocks.length === snapshot.blockRefs.length, '候補保存のブロック数が一致しません');
  const values = new Map<string, unknown>();
  let stored = 0;
  for (let i = 0; i < snapshot.blockRefs.length; i++) {
    const ref = snapshot.blockRefs[i]!,
      block = blocks[i];
    ensure(
      block && block.payloadBytes instanceof Uint8Array && ['gzip', 'none'].includes(block.codec),
      '候補保存のブロックがありません、または未対応です',
    );
    const { payloadBytes, codec, ...metadata } = block;
    ensure(canonicalJson(metadata) === canonicalJson(ref), '候補保存のブロック参照が一致しません');
    stored += payloadBytes.length;
    ensure(stored <= TRADE_STORED_LIMIT, '候補保存の圧縮容量を超えました');
    const raw = codec === 'gzip' ? await decompress(payloadBytes, ref.rawBytes) : payloadBytes;
    ensure(raw.length === ref.rawBytes, '候補保存の展開容量が一致しません');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
    ensure(
      (await sha256(ref.kind + ':' + snapshot.versions.saveFormatVersion + ':' + text)) ===
        ref.contentHash,
      '候補保存のブロックハッシュが一致しません',
    );
    values.set(ref.logicalKey, JSON.parse(text));
  }
  const context = values.get('context') as Record<string, unknown>;
  const core = values.get('world') as Record<string, unknown>;
  const definition = values.get('definitions') as { world: WorldDefinitions; engine: unknown };
  const transactions = values.get('transactions') as Record<string, unknown>;
  const stats = values.get('stats') as Record<string, unknown>;
  const growth = values.get('growth') as {
    modelId: string;
    version: string;
    schemaId: string;
    state: Record<string, unknown>;
  };
  exactKeys(
    context,
    [
      'localWorldId',
      'worldId',
      'stateRevision',
      'storageRevision',
      'currentDate',
      'seasonId',
      ...(snapshot.versions.saveFormatVersion !== TRADE_SAVE_FORMAT ? ['gameReceipts'] : []),
      ...([TRADE_DAY_SAVE_FORMAT, TRADE_ROSTER_SAVE_FORMAT].some(
        (f) => f === snapshot.versions.saveFormatVersion,
      )
        ? ['dayReceipts']
        : []),
      ...(snapshot.versions.saveFormatVersion === TRADE_ROSTER_SAVE_FORMAT
        ? ['rosterReceipts']
        : []),
    ],
    '候補保存の文脈',
  );
  exactKeys(core, coreKeys, '候補保存の世界本体');
  exactKeys(definition, ['world', 'engine'], '候補保存の定義');
  exactKeys(transactions, ['transactions', 'tradeApprovals', 'tradeReceipts'], '候補保存の取引');
  exactKeys(stats, ['stats', 'contributions', 'statApplicationMarkers'], '候補保存の集計');
  exactKeys(growth, ['modelId', 'version', 'schemaId', 'state'], '候補保存の成長');
  ensure(
    growth.state && !Object.hasOwn(growth.state, 'days'),
    '候補保存の成長履歴の格納位置が不正です',
  );
  ensure(
    canonicalJson(definition.engine) ===
      canonicalJson(
        definitionsFor(
          'game-prototype-v11',
          definition.world.matchConfig,
          definition.world.errorConfig,
        ),
      ),
    '候補保存の試合定義が未対応です',
  );
  const games = Object.fromEntries(
    [...values]
      .filter(([key]) => key.startsWith('game/'))
      .map(([key, value]) => [key.slice(5), value]),
  );
  const days = Object.fromEntries(
    [...values]
      .filter(([key]) => key.startsWith('growth/day/'))
      .map(([key, value]) => [key.slice(11), value]),
  );
  const saved = {
    ...context,
    tradeReceipts: transactions.tradeReceipts,
    state: {
      ...core,
      ...stats,
      initialDefinitions: definition.world,
      finance: values.get('finance'),
      transactions: transactions.transactions,
      tradeApprovals: transactions.tradeApprovals,
      growth: { ...growth, state: { ...growth.state, days } },
      games,
    },
  };
  validateTradeSavedState(saved);
  ensure(
    saved.worldId === snapshot.worldId &&
      saved.stateRevision === snapshot.stateRevision &&
      saved.currentDate === snapshot.gameDate,
    '候補保存の目録と内容が一致しません',
  );
  return saved;
}
