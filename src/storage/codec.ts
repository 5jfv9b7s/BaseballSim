import { ensure, integer } from '../engine/validation.ts';
import { MODEL as PITCH_MODEL } from '../engine/model.ts';
import { createGame, runToCompletion } from '../game/engine.ts';
import { finalizeGame } from '../game/results.ts';
import { createGameFixture } from '../game/fixture.ts';
import { FIELD_POSITIONS, GAME_MODEL } from '../game/model.ts';
import type { GameRecord } from '../game/types.ts';

export const SAVE_FORMAT = 'v01-completed-game-1';
export const VERSIONS = Object.freeze({
  saveFormatVersion: SAVE_FORMAT,
  dataSchemaVersion: 'game-prototype-schema-v1',
  simulationVersion: GAME_MODEL.version,
  rulesetVersion: GAME_MODEL.rulesetVersion,
  statDefinitionVersion: 'game-stats-prototype-v1',
  initialDatasetVersion: GAME_MODEL.datasetVersion,
  rngAlgorithmVersion: 'xorshift32-v1',
});
export const DEFINITIONS = Object.freeze({
  versions: VERSIONS,
  pitchModel: PITCH_MODEL,
  gameModel: GAME_MODEL,
  fieldPositions: FIELD_POSITIONS,
});
export const MAX_SAVE_BYTES = 12 * 1024 * 1024;

/** 順序が意味を持つ配列を保ち、オブジェクトのキーだけ正規化する。 */
export function canonicalJson(value: unknown, depth = 0): string {
  ensure(depth < 80, '保存データが深すぎます');
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    ensure(Number.isFinite(value) && !Object.is(value, -0), '非有限数・負のゼロは保存できません');
    return JSON.stringify(value);
  }
  if (Array.isArray(value))
    return '[' + value.map((v) => canonicalJson(v, depth + 1)).join(',') + ']';
  ensure(
    typeof value === 'object' &&
      value !== null &&
      Object.getPrototypeOf(value) === Object.prototype,
    'JSON以外の保存値です',
  );
  return (
    '{' +
    Object.keys(value)
      .sort()
      .map(
        (key) =>
          JSON.stringify(key) +
          ':' +
          canonicalJson((value as Record<string, unknown>)[key], depth + 1),
      )
      .join(',') +
    '}'
  );
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** この版は固定fixtureの終了試合専用。再実行照合で全状態・全記録・参照まで検査する。 */
export function validateCompletedRecord(value: unknown): asserts value is GameRecord {
  const encoded = canonicalJson(value);
  ensure(
    new TextEncoder().encode(encoded).byteLength <= MAX_SAVE_BYTES,
    '保存データの上限12MiBを超えています',
  );
  ensure(value !== null && typeof value === 'object', '試合データが不正です');
  const candidate = value as GameRecord;
  ensure(
    candidate.kind === 'completed-game-prototype-v1',
    '終了したv0.1試合だけを保存・復元できます',
  );
  integer(candidate.seed, 1, 0xffffffff, '保存seed');
  ensure(
    canonicalJson(candidate.fixture) === canonicalJson(createGameFixture()),
    '未対応の初期データです',
  );
  const replay = createGame(candidate.seed);
  runToCompletion(replay);
  finalizeGame(replay);
  ensure(
    canonicalJson(replay) === encoded,
    '記録・成績・乱数状態・参照またはモデル版が一致しません',
  );
}
