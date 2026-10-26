import { ensure, integer } from '../engine/validation.ts';
import { growthAbilityKey, growthBasis } from './growth-basis.ts';
import { freezeGrowthData } from './growth.ts';
import type { AgeDevelopmentDay } from './age-types.ts';
import type { WorldDefinitions } from './types.ts';

/** v019の保存表現だけを小さくする。メモリ上の詳細な変更履歴は従来どおり。 */
interface AgeDayWire extends Omit<AgeDevelopmentDay, 'changes'> {
  historySchema: 'age-day-v1';
  changes: AgeDevelopmentDay['changes'];
  /** 保存内の選手順/能力順への参照・変更前・変更後。日付や理由等は復元可能。 */
  agingChanges: [number, number, number, number][];
}
const cache = new WeakMap<WorldDefinitions, WeakMap<AgeDevelopmentDay, AgeDayWire>>();

type AgeReferences = ReturnType<typeof makeReferences>;
const referencesCache = new WeakMap<WorldDefinitions, AgeReferences>();
function makeReferences(definitions: WorldDefinitions) {
  const ids = definitions.squads.flatMap((s) => s.players.map((p) => p.playerId)).sort();
  const bases = ids.map((id) => growthBasis(definitions, id));
  return {
    ids,
    bases,
    playerIndex: new Map(ids.map((id, index) => [id, index])),
    abilityIndexes: bases.map((basis) => new Map(basis.map((a, index) => [a.key, index]))),
  };
}
function ageReferences(definitions: WorldDefinitions): AgeReferences {
  const cached = referencesCache.get(definitions);
  if (cached) return cached;
  const refs = makeReferences(definitions);
  if (Object.isFrozen(definitions)) referencesCache.set(definitions, refs);
  return refs;
}
/** 一つの保存内では参照辞書を共用。編集可能な定義を恒久キャッシュしない。 */
export function createAgeHistoryCodec(definitions: WorldDefinitions) {
  const refs = ageReferences(definitions);
  return {
    encode: (day: AgeDevelopmentDay) => encodeAgeDay(day, definitions, refs),
    decode: (value: unknown) => decodeAgeDay(value, definitions, refs),
  };
}

export function encodeAgeDay(
  day: AgeDevelopmentDay,
  definitions: WorldDefinitions,
  refs = ageReferences(definitions),
): AgeDayWire {
  const cached = cache.get(definitions)?.get(day);
  if (cached) return cached;
  const { playerIndex, abilityIndexes } = refs;
  const first = day.changes.findIndex((change) => change.reason === 'aging');
  const split = first < 0 ? day.changes.length : first;
  const agingChanges = day.changes.slice(split).map((change): [number, number, number, number] => {
    ensure(change.reason === 'aging', '年齢変化の履歴順が不正です');
    const index = playerIndex.get(change.playerId);
    ensure(index !== undefined, '年齢変化の選手参照が不正です');
    const ability = abilityIndexes[index]!.get(growthAbilityKey(change.abilityRef)) ?? -1;
    ensure(ability >= 0, '年齢変化の能力参照が不正です');
    return [index, ability, change.beforeValue, change.afterValue];
  });
  const wire: AgeDayWire = {
    ...day,
    historySchema: 'age-day-v1',
    changes: day.changes.slice(0, split),
    agingChanges,
  };
  if (Object.isFrozen(day) && Object.isFrozen(definitions)) {
    const days = cache.get(definitions) ?? new WeakMap<AgeDevelopmentDay, AgeDayWire>();
    days.set(day, freezeGrowthData(wire));
    cache.set(definitions, days);
  }
  return wire;
}

/** 参照範囲を先に検査し、展開後はWorldValidatorが全試合/全成長を再実行する。 */
export function decodeAgeDay(
  value: unknown,
  definitions: WorldDefinitions,
  refs = ageReferences(definitions),
): AgeDevelopmentDay {
  ensure(value && typeof value === 'object' && !Array.isArray(value), '年齢履歴ブロックが不正です');
  const wire = value as AgeDayWire;
  const keys = [
    'date',
    'outcomes',
    'displayDeltas',
    'experience',
    'aging',
    'changes',
    'historySchema',
    'agingChanges',
  ];
  ensure(
    Object.keys(wire).length === keys.length && keys.every((key) => Object.hasOwn(wire, key)),
    '年齢履歴の項目が不正です',
  );
  ensure(
    wire.historySchema === 'age-day-v1' &&
      typeof wire.date === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(wire.date),
    '未対応の年齢履歴形式です',
  );
  ensure(
    Array.isArray(wire.changes) &&
      Array.isArray(wire.agingChanges) &&
      wire.agingChanges.length <= 100000,
    '年齢履歴の変更列が不正です',
  );
  ensure(
    wire.changes.every((c) => c && c.reason !== 'aging'),
    '年齢履歴の格納位置が不正です',
  );
  const { ids, bases } = refs;
  const changes = [...wire.changes];
  for (const tuple of wire.agingChanges) {
    ensure(Array.isArray(tuple) && tuple.length === 4, '年齢履歴の圧縮行が不正です');
    const [playerIndex, abilityIndex, before, after] = tuple;
    integer(playerIndex, 0, ids.length - 1, '年齢履歴の選手番号');
    const playerId = ids[playerIndex]!;
    const basis = bases[playerIndex]!;
    integer(abilityIndex, 0, basis.length - 1, '年齢履歴の能力番号');
    const ability = basis[abilityIndex]!;
    integer(before, 0, ability.ceilingMilli, '年齢履歴の変更前');
    integer(after, 0, ability.ceilingMilli, '年齢履歴の変更後');
    ensure(before !== after, '年齢履歴に変化がありません');
    const order = changes.length + 1;
    changes.push({
      changeId: `aging-${wire.date}-${playerId}-${order}`,
      playerId,
      effectiveOn: wire.date,
      eventOrder: order,
      abilityRef: structuredClone(ability.abilityRef),
      unitCode: 'ratingMilli',
      changeKind: 'value',
      beforeValue: before,
      afterValue: after,
      reason: 'aging',
      sourceEventId: 'aging-day-' + wire.date,
      abilityCatalogVersion: 'common-abilities-v1',
    });
  }
  const { historySchema: _schema, agingChanges: _aging, ...day } = wire;
  return { ...day, changes };
}
