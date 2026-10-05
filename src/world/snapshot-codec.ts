import { ensure, integer } from '../engine/validation.ts';
import { canonicalJson, definitionsFor, sha256 } from '../storage/codec.ts';
import { WorldValidator } from './validation.ts';
import { decompress } from './compression.ts';
import {
  formatFor,
  MAX_ANNUAL_RAW_BYTES,
  MAX_BYTES,
  type Snapshot,
  type Block,
} from './save-format.ts';
import type { WorldRecord } from './types.ts';

export const MAX_BLOCK_RAW_BYTES = 16 * 1024 * 1024;

export function exactKeys(value: object, keys: string[], name: string) {
  ensure(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).sort().join('|') === [...keys].sort().join('|'),
    name + 'の項目が不正です',
  );
}

/** DB・ファイルで共用。展開・再実行前に件数、型、役割と宣言容量を検査する。 */
export function validateSnapshot(snapshot: Snapshot): void {
  exactKeys(
    snapshot,
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
    '保存目録',
  );
  for (const value of [snapshot.snapshotId, snapshot.worldId])
    ensure(
      typeof value === 'string' && value.length > 0 && value.length <= 256,
      '保存目録のIDが不正です',
    );
  ensure(
    snapshot.parentSnapshotId === null ||
      (typeof snapshot.parentSnapshotId === 'string' &&
        snapshot.parentSnapshotId.length > 0 &&
        snapshot.parentSnapshotId.length <= 256),
    '親保存IDが不正です',
  );
  ensure(
    typeof snapshot.createdAt === 'string' && Number.isFinite(Date.parse(snapshot.createdAt)),
    '保存日時が不正です',
  );
  ensure(
    typeof snapshot.gameDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(snapshot.gameDate),
    '保存日が不正です',
  );
  integer(snapshot.stateRevision, 0, Number.MAX_SAFE_INTEGER, '保存の状態版');
  ensure(['dailyAuto', 'manual', 'actionAuto'].includes(snapshot.saveKind), '保存種別が不正です');
  exactKeys(snapshot.versions, ['saveFormatVersion', 'simulationVersion'], '保存形式');
  ensure(
    /^world-prototype-v([1-9]|1[0-4])$/.test(snapshot.versions.simulationVersion) &&
      snapshot.versions.saveFormatVersion === formatFor(snapshot.versions.simulationVersion),
    '未対応の世界保存形式です',
  );
  ensure(
    typeof snapshot.manifestHash === 'string' && /^[a-f0-9]{64}$/.test(snapshot.manifestHash),
    '保存目録のハッシュが不正です',
  );
  ensure(
    Array.isArray(snapshot.blockRefs) &&
      snapshot.blockRefs.length >= 3 &&
      snapshot.blockRefs.length <= 259,
    '保存ブロック数が不正です',
  );
  const keys = new Set<string>(),
    ids = new Set<string>();
  let rawTotal = 0;
  for (const ref of snapshot.blockRefs) {
    exactKeys(
      ref,
      ['logicalKey', 'blockId', 'kind', 'schemaVersion', 'contentHash', 'rawBytes'],
      '保存ブロック参照',
    );
    ensure(
      typeof ref.logicalKey === 'string' && ref.logicalKey.length <= 256,
      '保存ブロックの役割が不正です',
    );
    const gameId = ref.logicalKey.startsWith('game/') ? ref.logicalKey.slice(5) : null;
    ensure(
      gameId !== null
        ? gameId.length > 0 &&
            !['__proto__', 'constructor', 'prototype'].includes(gameId) &&
            ref.kind === 'game'
        : ['definitions', 'world', 'stats'].includes(ref.logicalKey) && ref.kind === ref.logicalKey,
      '未対応の保存ブロックです',
    );
    ensure(
      !keys.has(ref.logicalKey) && !ids.has(ref.blockId),
      '保存ブロックの役割・IDが重複しています',
    );
    keys.add(ref.logicalKey);
    ids.add(ref.blockId);
    ensure(
      ref.schemaVersion === snapshot.versions.saveFormatVersion &&
        typeof ref.contentHash === 'string' &&
        /^[a-f0-9]{64}$/.test(ref.contentHash) &&
        ref.blockId === 'block-' + ref.contentHash,
      '保存ブロックの参照が不正です',
    );
    integer(ref.rawBytes, 1, MAX_BLOCK_RAW_BYTES, '保存ブロックの展開容量');
    rawTotal += ref.rawBytes;
  }
  ensure(
    ['definitions', 'world', 'stats'].every((key) => keys.has(key)),
    '世界保存の必須ブロックが不足しています',
  );
  ensure(
    rawTotal <=
      (['world-prototype-v1', 'world-prototype-v2'].includes(snapshot.versions.simulationVersion)
        ? MAX_BYTES
        : MAX_ANNUAL_RAW_BYTES),
    '保存の展開容量上限を超えました',
  );
}

export async function decodeWorldSnapshot(
  snapshot: Snapshot,
  blocks: (Block | undefined)[],
  validator: WorldValidator = new WorldValidator(),
): Promise<WorldRecord> {
  validateSnapshot(snapshot);
  ensure(blocks.length === snapshot.blockRefs.length, '保存ブロック数が不正です');
  for (const block of blocks)
    ensure(
      block && block.payloadBytes instanceof Uint8Array,
      '保存ブロックがありません、または未対応です',
    );
  const format = snapshot.versions.saveFormatVersion;
  const { manifestHash, ...manifest } = snapshot;
  ensure(
    (await sha256(canonicalJson(manifest))) === manifestHash,
    '保存目録のハッシュが一致しません',
  );
  ensure(
    [
      'world-prototype-v1',
      'world-prototype-v2',
      'world-prototype-v3',
      'world-prototype-v4',
      'world-prototype-v5',
      'world-prototype-v6',
      'world-prototype-v7',
      'world-prototype-v8',
      'world-prototype-v9',
      'world-prototype-v10',
      'world-prototype-v11',
      'world-prototype-v12',
      'world-prototype-v13',
      'world-prototype-v14',
    ].includes(snapshot.versions.simulationVersion) &&
      format === formatFor(snapshot.versions.simulationVersion),
    '未対応の世界保存形式です',
  );
  const values = new Map<string, unknown>();
  let bytes = 0;
  let storedBytes = 0;
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    const ref = snapshot.blockRefs[index]!;
    ensure(
      block && ['none', 'gzip'].includes(block.codec) && block.schemaVersion === format,
      '保存ブロックがありません、または未対応です',
    );
    ensure(!values.has(ref.logicalKey), '保存ブロックの役割が重複しています');
    const { payloadBytes, codec: _codec, ...metadata } = block;
    ensure(canonicalJson(metadata) === canonicalJson(ref), '保存ブロックの参照が一致しません');
    bytes += ref.rawBytes;
    storedBytes += payloadBytes.length;
    ensure(
      Number.isSafeInteger(bytes) &&
        bytes >= 0 &&
        bytes <=
          ([
            'v04-world-snapshot-v3',
            'v05-world-snapshot-v4',
            'v06-world-snapshot-v5',
            'v07-world-snapshot-v6',
            'v08-world-snapshot-v7',
            'v09-world-snapshot-v8',
            'v010-world-snapshot-v9',
            'v011-world-snapshot-v10',
            'v012-world-snapshot-v11',
            'v013-world-snapshot-v12',
            'v014-world-snapshot-v13',
            'v015-world-snapshot-v14',
          ].includes(format)
            ? MAX_ANNUAL_RAW_BYTES
            : MAX_BYTES) &&
        storedBytes <= MAX_BYTES,
      '保存容量が不正です',
    );
    const raw =
      block.codec === 'gzip' ? await decompress(payloadBytes, ref.rawBytes) : payloadBytes;
    ensure(ref.rawBytes === raw.length, '保存容量が不正です');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
    ensure(
      (await sha256(block.kind + ':' + format + ':' + text)) === ref.contentHash &&
        ref.blockId === 'block-' + ref.contentHash,
      '保存ブロックのハッシュが一致しません',
    );
    values.set(ref.logicalKey, JSON.parse(text));
  }
  const definitions = values.get('definitions') as {
    world: WorldRecord['definitions'];
    engine: unknown;
  };
  ensure(
    definitions && values.has('world') && values.has('stats'),
    '世界保存の必須ブロックが不足しています',
  );
  const games: WorldRecord['games'] = {};
  for (const [key, value] of values) {
    if (key.startsWith('game/')) games[key.slice(5)] = value as WorldRecord['games'][string];
    else ensure(['world', 'stats', 'definitions'].includes(key), '未対応の保存ブロックです');
  }
  const world = {
    ...(values.get('world') as object),
    ...(values.get('stats') as object),
    definitions: definitions.world,
    games,
  };
  validator.validate(world);
  ensure(
    world.version === snapshot.versions.simulationVersion,
    '保存目録と世界モデルが一致しません',
  );
  ensure(
    canonicalJson(definitions.engine) ===
      canonicalJson(
        definitionsFor(
          'game-prototype-v10',
          world.definitions.matchConfig,
          world.definitions.errorConfig,
        ),
      ),
    '試合の計算定義が一致しません',
  );
  ensure(
    snapshot.worldId === world.worldId && snapshot.gameDate === world.currentDate,
    '保存目録と世界が一致しません',
  );

  return world;
}
