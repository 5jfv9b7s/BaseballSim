import { ensure, integer } from '../engine/validation.ts';
import { MODEL as PITCH_MODEL } from '../engine/model.ts';
import { createGame, runToCompletion } from '../game/engine.ts';
import { finalizeGame } from '../game/results.ts';
import { createGameFixture } from '../game/fixture.ts';
import { FIELD_POSITIONS, GAME_MODEL } from '../game/model.ts';
import type { GameRecord } from '../game/types.ts';
import { GAME_MODEL_V2 } from '../game/model-v2.ts';
import { GAME_MODEL_V5 } from '../game/model-v5.ts';
import { GAME_MODEL_V4 } from '../game/model-v4.ts';
import { PITCH_MODEL_V3 } from '../engine/model-v3.ts';
import { GAME_MODEL_V3 } from '../game/model-v3.ts';
import { PITCH_MODEL_V2 } from '../engine/model-v2.ts';
import { gameModel, type GameModelVersion } from '../game/model-registry.ts';

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
const VERSIONS_V2 = Object.freeze({
  ...VERSIONS,
  saveFormatVersion: 'v01-completed-game-2',
  dataSchemaVersion: 'game-prototype-schema-v2',
  simulationVersion: GAME_MODEL_V2.version,
  rulesetVersion: GAME_MODEL_V2.rulesetVersion,
});
const VERSIONS_V3 = Object.freeze({
  ...VERSIONS_V2,
  saveFormatVersion: 'v01-completed-game-3',
  dataSchemaVersion: 'game-prototype-schema-v3',
  simulationVersion: GAME_MODEL_V3.version,
  rulesetVersion: GAME_MODEL_V3.rulesetVersion,
});
const VERSIONS_V4 = Object.freeze({
  ...VERSIONS_V3,
  saveFormatVersion: 'v01-completed-game-4',
  dataSchemaVersion: 'game-prototype-schema-v4',
  simulationVersion: GAME_MODEL_V4.version,
  rulesetVersion: GAME_MODEL_V4.rulesetVersion,
});

const VERSIONS_V5 = Object.freeze({
  ...VERSIONS_V4,
  saveFormatVersion: 'v01-completed-game-5',
  dataSchemaVersion: 'game-prototype-schema-v5',
  simulationVersion: GAME_MODEL_V5.version,
  rulesetVersion: GAME_MODEL_V5.rulesetVersion,
});

export function versionsFor(version: GameModelVersion) {
  gameModel(version);
  return version === 'game-prototype-v1'
    ? VERSIONS
    : version === 'game-prototype-v2'
      ? VERSIONS_V2
      : version === 'game-prototype-v3'
        ? VERSIONS_V3
        : version === 'game-prototype-v4'
          ? VERSIONS_V4
          : VERSIONS_V5;
}
export function definitionsFor(version: GameModelVersion) {
  return version === 'game-prototype-v1'
    ? DEFINITIONS
    : {
        versions: versionsFor(version),
        pitchModel:
          version === 'game-prototype-v4' || version === 'game-prototype-v5'
            ? PITCH_MODEL_V3
            : version === 'game-prototype-v3'
              ? PITCH_MODEL_V2
              : PITCH_MODEL,
        gameModel: gameModel(version),
        fieldPositions: FIELD_POSITIONS,
      };
}

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
    candidate.kind === 'completed-game-prototype-v1' ||
      candidate.kind === 'completed-game-prototype-v2' ||
      candidate.kind === 'completed-game-prototype-v3' ||
      candidate.kind === 'completed-game-prototype-v4' ||
      candidate.kind === 'completed-game-prototype-v5',
    '終了したv0.1試合だけを保存・復元できます',
  );
  integer(candidate.seed, 1, 0xffffffff, '保存seed');
  ensure(
    canonicalJson(candidate.fixture) === canonicalJson(createGameFixture()),
    '未対応の初期データです',
  );
  const version =
    candidate.kind === 'completed-game-prototype-v1'
      ? 'game-prototype-v1'
      : candidate.kind === 'completed-game-prototype-v2'
        ? 'game-prototype-v2'
        : candidate.kind === 'completed-game-prototype-v3'
          ? 'game-prototype-v3'
          : candidate.kind === 'completed-game-prototype-v4'
            ? 'game-prototype-v4'
            : 'game-prototype-v5';
  const replay = createGame(candidate.seed, undefined, version);
  runToCompletion(replay);
  finalizeGame(replay);
  ensure(
    canonicalJson(replay) === encoded,
    '記録・成績・乱数状態・参照またはモデル版が一致しません',
  );
}
