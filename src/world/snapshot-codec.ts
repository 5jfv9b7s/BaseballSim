import type { ReportWorkProgress } from './work-progress.ts';
import { createPitchLearningHistoryCodec } from './pitch-learning-history-codec.ts';
import { createCampHistoryCodec } from './camp-history-codec.ts';
import { createAwakeningHistoryCodec } from './awakening-history-codec.ts';
import { createAgeHistoryCodec } from './age-history-codec.ts';
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
    /^world-prototype-v([1-9]|1[0-9]|2[01])$/.test(snapshot.versions.simulationVersion) &&
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
      snapshot.blockRefs.length <=
        ([
          'v017-world-snapshot-v16',
          'v018-world-snapshot-v17',
          'v019-world-snapshot-v18',
          'v020-world-snapshot-v19',
          'v021-world-snapshot-v20',
          'v022-world-snapshot-v21',
        ].includes(snapshot.versions.saveFormatVersion)
          ? 625
          : 259),
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
      ref.logicalKey.startsWith('growth/day/')
        ? [
            'v017-world-snapshot-v16',
            'v018-world-snapshot-v17',
            'v019-world-snapshot-v18',
            'v020-world-snapshot-v19',
            'v021-world-snapshot-v20',
            'v022-world-snapshot-v21',
          ].includes(snapshot.versions.saveFormatVersion) &&
            /^growth\/day\/\d{4}-\d{2}-\d{2}$/.test(ref.logicalKey) &&
            ref.kind === 'growthDay'
        : gameId !== null
          ? gameId.length > 0 &&
            !['__proto__', 'constructor', 'prototype'].includes(gameId) &&
            ref.kind === 'game'
          : ['definitions', 'world', 'stats'].includes(ref.logicalKey) &&
            ref.kind === ref.logicalKey,
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
  report?: ReportWorkProgress,
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
      'world-prototype-v15',
      'world-prototype-v16',
      'world-prototype-v17',
      'world-prototype-v18',
      'world-prototype-v19',
      'world-prototype-v20',
      'world-prototype-v21',
    ].includes(snapshot.versions.simulationVersion) &&
      format === formatFor(snapshot.versions.simulationVersion),
    '未対応の世界保存形式です',
  );
  const values = new Map<string, unknown>();
  let bytes = 0;
  let storedBytes = 0;
  const prepared: { block: Block; key: string; rawBytes: number; contentHash: string }[] = [];
  const preparedKeys = new Set<string>();
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    const ref = snapshot.blockRefs[index]!;
    ensure(
      block && ['none', 'gzip'].includes(block.codec) && block.schemaVersion === format,
      '保存ブロックがありません、または未対応です',
    );
    ensure(!preparedKeys.has(ref.logicalKey), '保存ブロックの役割が重複しています');
    preparedKeys.add(ref.logicalKey);
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
            'v016-world-snapshot-v15',
            'v017-world-snapshot-v16',
            'v018-world-snapshot-v17',
            'v019-world-snapshot-v18',
            'v020-world-snapshot-v19',
            'v021-world-snapshot-v20',
            'v022-world-snapshot-v21',
          ].includes(format)
            ? MAX_ANNUAL_RAW_BYTES
            : MAX_BYTES) &&
        storedBytes <= MAX_BYTES,
      '保存容量が不正です',
    );
    prepared.push({
      block,
      key: ref.logicalKey,
      rawBytes: ref.rawBytes,
      contentHash: ref.contentHash,
    });
  }
  report?.({
    stage: 'decode',
    message: '保存データを展開・照合しています',
    completed: 0,
    total: prepared.length,
  });
  // 圧縮展開とSHAを2件まで並行する。全件同時に展開せず、元の順で結果を組み立てる。
  for (let offset = 0; offset < prepared.length; offset += 2) {
    const batch = prepared.slice(offset, offset + 2);
    const results = await Promise.allSettled(
      batch.map(async ({ block, key, rawBytes, contentHash }) => {
        const raw =
          block.codec === 'gzip'
            ? await decompress(block.payloadBytes, rawBytes)
            : block.payloadBytes;
        ensure(rawBytes === raw.length, '保存容量が不正です');
        const text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
        ensure(
          (await sha256(block.kind + ':' + format + ':' + text)) === contentHash &&
            block.blockId === 'block-' + contentHash,
          '保存ブロックのハッシュが一致しません',
        );
        return { key, value: JSON.parse(text) as unknown };
      }),
    );
    // 失敗時もこの2件は終了を待つ。部分的な世界や未処理の非同期処理を返さない。
    for (const result of results) if (result.status === 'rejected') throw result.reason;
    for (const result of results)
      if (result.status === 'fulfilled') values.set(result.value.key, result.value.value);
    report?.({
      stage: 'decode',
      message: '保存データを展開・照合しています',
      completed: Math.min(offset + 2, prepared.length),
      total: prepared.length,
    });
  }
  const definitions = values.get('definitions') as {
    world: WorldRecord['definitions'];
    engine: unknown;
  };
  ensure(
    definitions && values.has('world') && values.has('stats'),
    '世界保存の必須ブロックが不足しています',
  );
  const ageCodec =
    format === 'v022-world-snapshot-v21'
      ? createPitchLearningHistoryCodec(definitions.world)
      : format === 'v021-world-snapshot-v20'
        ? createCampHistoryCodec(definitions.world)
        : format === 'v020-world-snapshot-v19'
          ? createAwakeningHistoryCodec(definitions.world)
          : format === 'v019-world-snapshot-v18'
            ? createAgeHistoryCodec(definitions.world)
            : null;
  const growthDays: Record<string, import('./growth-types.ts').TrainingDay> = {};
  const games: WorldRecord['games'] = {};
  for (const [key, value] of values) {
    if (key.startsWith('game/')) games[key.slice(5)] = value as WorldRecord['games'][string];
    else if (key.startsWith('growth/day/')) {
      const day = ageCodec
        ? ageCodec.decode(value)
        : (value as import('./growth-types.ts').TrainingDay);
      ensure(day && day.date === key.slice(11), '練習履歴ブロックの日付が一致しません');
      growthDays[day.date] = day;
    } else ensure(['world', 'stats', 'definitions'].includes(key), '未対応の保存ブロックです');
  }
  const world = {
    ...(values.get('world') as object),
    ...(values.get('stats') as object),
    definitions: definitions.world,
    games,
  };
  const decoded = world as WorldRecord;
  if ('growth' in decoded) {
    ensure(
      decoded.growth?.state && !Object.hasOwn(decoded.growth.state, 'days'),
      '練習履歴の格納位置が不正です',
    );
    if (decoded.growth.version === 'daily-development-v6') {
      ensure(
        Object.values(growthDays).every((day) => Object.hasOwn(day, 'pitchLearning')),
        '球種習得履歴がありません',
      );
      decoded.growth.state.days = growthDays as Record<
        string,
        import('./pitch-learning-types.ts').PitchLearningDay
      >;
    } else if (decoded.growth.version === 'daily-development-v5') {
      ensure(
        Object.values(growthDays).every((day) => Object.hasOwn(day, 'camp')),
        'キャンプ履歴がありません',
      );
      decoded.growth.state.days = growthDays as Record<
        string,
        import('./camp-types.ts').CampDevelopmentDay
      >;
    } else if (decoded.growth.version === 'daily-development-v4') {
      ensure(
        Object.values(growthDays).every((day) =>
          Array.isArray((day as import('./awakening-types.ts').RookieAwakeningDay).awakening),
        ),
        '覚醒履歴がありません',
      );
      decoded.growth.state.days = growthDays as Record<
        string,
        import('./awakening-types.ts').RookieAwakeningDay
      >;
    } else if (decoded.growth.version === 'daily-development-v3') {
      ensure(
        Object.values(growthDays).every(
          (day) =>
            Array.isArray((day as import('./age-types.ts').AgeDevelopmentDay).experience) &&
            Array.isArray((day as import('./age-types.ts').AgeDevelopmentDay).aging),
        ),
        '年齢変化の履歴がありません',
      );
      decoded.growth.state.days = growthDays as Record<
        string,
        import('./age-types.ts').AgeDevelopmentDay
      >;
    } else if (decoded.growth.version === 'daily-development-v2') {
      ensure(
        Object.values(growthDays).every((day) =>
          Array.isArray((day as import('./growth-types.ts').DevelopmentDay).experience),
        ),
        '実戦経験履歴がありません',
      );
      // 出場量・対象・全乱数・能力値の意味は、直後のモデル別再実行で照合する。
      decoded.growth.state.days = growthDays as Record<
        string,
        import('./growth-types.ts').DevelopmentDay
      >;
    } else decoded.growth.state.days = growthDays;
  } else ensure(Object.keys(growthDays).length === 0, '旧保存へ成長履歴を追加できません');
  report?.({ stage: 'validate', message: '試合と日次記録の整合性を確認しています' });
  validator.validate(world);
  ensure(
    world.version === snapshot.versions.simulationVersion,
    '保存目録と世界モデルが一致しません',
  );
  ensure(
    canonicalJson(definitions.engine) ===
      canonicalJson(
        definitionsFor(
          world.version === 'world-prototype-v15' ||
            world.version === 'world-prototype-v16' ||
            world.version === 'world-prototype-v17' ||
            world.version === 'world-prototype-v18' ||
            world.version === 'world-prototype-v19' ||
            world.version === 'world-prototype-v20' ||
            world.version === 'world-prototype-v21'
            ? 'game-prototype-v11'
            : 'game-prototype-v10',
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
