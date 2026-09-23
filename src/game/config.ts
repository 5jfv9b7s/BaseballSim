import defaults from '../../config/match.ts';
import schema, { type Rule, type NumberRule, type ArrayRule } from './config-schema.ts';
import { ensure } from '../engine/validation.ts';

export type MatchConfig = typeof defaults;

/** 保存済み設定も同じ固定スキーマで検査する。現在の既定値とは比較しない。 */
export function validateMatchConfig(value: unknown): asserts value is MatchConfig {
  const visit = (value: unknown, rule: Rule, path: string): void => {
    if ('min' in rule && 'max' in rule) {
      const numberRule = rule as NumberRule;
      ensure(
        typeof value === 'number' &&
          Number.isFinite(value) &&
          !Object.is(value, -0) &&
          value >= numberRule.min &&
          value <= numberRule.max,
        `設定 ${path} の数値が範囲外です`,
      );
      return;
    }

    if ('items' in rule && 'length' in rule) {
      const arrayRule = rule as ArrayRule;
      ensure(
        Array.isArray(value) && value.length === arrayRule.length,
        `設定 ${path} の配列長が不正です`,
      );
      value.forEach((item, i) => visit(item, arrayRule.items, `${path}[${i}]`));
      return;
    }

    ensure(
      value !== null &&
        typeof value === 'object' &&
        Object.getPrototypeOf(value) === Object.prototype,
      `設定 ${path} はオブジェクトが必要です`,
    );
    const object = value as Record<string, unknown>;
    ensure(
      Object.keys(object).length === Object.keys(rule).length &&
        Object.keys(rule).every((key) => Object.hasOwn(object, key)),
      `設定 ${path} の項目が不足または余分です`,
    );
    for (const [key, child] of Object.entries(rule)) visit(object[key], child, `${path}.${key}`);
  };

  visit(value, schema, 'match');
  const c = value as MatchConfig;
  const p = c.pitch;
  const b = c.battedBall;
  ensure(
    p.zone.leftMm < p.zone.rightMm && p.zone.bottomMm < p.zone.topMm,
    'ゾーンの上下左右が逆です',
  );
  ensure(p.bodyBottomMm < p.bodyTopMm && p.contactMin <= p.contactMax, '投球設定の上下限が逆です');
  ensure(
    p.avoidanceReactionSeconds >= p.avoidanceDisciplineReductionSeconds,
    '回避反応時間が負になります',
  );
  for (const key of [
    'aimXMm',
    'aimZMm',
    'chaseAimXMm',
    'chaseAimZMm',
    'threeBallAimXMm',
    'threeBallAimZMm',
  ] as const) {
    const values = p[key];
    ensure(
      values.every(Number.isSafeInteger) && values[0]! <= values[1]! && values[1]! <= values[2]!,
      '狙いは昇順のmm整数3個です',
    );
  }
  ensure(
    b.angleMinimumDegrees < b.angleModeDegrees && b.angleModeDegrees < b.angleMaximumDegrees,
    '打球角度は最小 < 最頻 < 最大が必要です',
  );
  ensure(b.fenceCornerMeters <= b.fenceCenterMeters, 'フェンス距離の大小が不正です');
  ensure(
    b.fielderReactionBaseSeconds >= b.fielderReactionReductionSeconds,
    '守備反応時間が負になります',
  );
  ensure(
    b.protectExitSpeedPenaltyCentiKph >= b.protectContactRecoveryCentiKph,
    '接触優先の減速が負になります',
  );
  ensure(
    b.exitSpeedBaseKph - b.exitSpeedNoiseKph / 2 - b.protectExitSpeedPenaltyCentiKph / 100 > 0,
    '最低打球速度は正でなければなりません',
  );
}

export function createMatchConfig(): MatchConfig {
  validateMatchConfig(defaults);
  return structuredClone(defaults);
}
