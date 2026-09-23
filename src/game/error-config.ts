import defaults from '../../config/errors.ts';
import { ensure } from '../engine/validation.ts';

export type ErrorConfig = typeof defaults;

/** v10の固定検査条件。保存済みの設定も同じ条件で検査する。 */
export function validateErrorConfig(value: unknown): asserts value is ErrorConfig {
  ensure(
    value !== null &&
      typeof value === 'object' &&
      Object.getPrototypeOf(value) === Object.prototype,
    '失策設定はオブジェクトが必要です',
  );
  const object = value as Record<string, unknown>;
  const keys = ['baseProbability', 'inabilityProbability', 'maximumProbability'];
  ensure(
    Object.keys(object).length === keys.length && keys.every((key) => Object.hasOwn(object, key)),
    '失策設定の項目が不足または余分です',
  );
  for (const key of keys) {
    const number = object[key];
    ensure(
      typeof number === 'number' &&
        Number.isFinite(number) &&
        !Object.is(number, -0) &&
        number >= 0 &&
        number <= 1,
      '失策設定の確率は0〜1です',
    );
  }
}

export function createErrorConfig(): ErrorConfig {
  validateErrorConfig(defaults);
  return structuredClone(defaults);
}
