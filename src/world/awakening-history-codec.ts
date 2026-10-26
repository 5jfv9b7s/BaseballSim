import { ensure } from '../engine/validation.ts';
import { createAgeHistoryCodec } from './age-history-codec.ts';
import { freezeGrowthData } from './growth.ts';
import type { RookieAwakeningDay } from './awakening-types.ts';
import type { WorldDefinitions } from './types.ts';

type Wire = {
  historySchema: 'rookie-day-v1';
  age: unknown;
  awakening: RookieAwakeningDay['awakening'];
  awakeningChanges: RookieAwakeningDay['changes'];
};
const cache = new WeakMap<WorldDefinitions, WeakMap<RookieAwakeningDay, Wire>>();
/** v020だけに使う可逆表現。年齢変更はv019の番号参照、まれな覚醒は詳細で保持する。 */
export function createAwakeningHistoryCodec(definitions: WorldDefinitions) {
  const age = createAgeHistoryCodec(definitions);
  const playerCount = definitions.squads.reduce((sum, squad) => sum + squad.players.length, 0);
  return {
    encode(day: RookieAwakeningDay): Wire {
      const cached = cache.get(definitions)?.get(day);
      if (cached) return cached;
      const first = day.changes.findIndex((c) => c.reason === 'rookieAwakening');
      const split = first < 0 ? day.changes.length : first;
      const awakeningChanges = day.changes.slice(split);
      ensure(
        awakeningChanges.every((c) => c.reason === 'rookieAwakening'),
        '覚醒履歴の順序が不正です',
      );
      const { awakening, ...base } = day;
      const wire: Wire = {
        historySchema: 'rookie-day-v1',
        age: age.encode({ ...base, changes: day.changes.slice(0, split) }),
        awakening,
        awakeningChanges,
      };
      if (Object.isFrozen(day) && Object.isFrozen(definitions)) {
        const days = cache.get(definitions) ?? new WeakMap<RookieAwakeningDay, Wire>();
        days.set(day, freezeGrowthData(wire));
        cache.set(definitions, days);
      }
      return wire;
    },
    decode(value: unknown): RookieAwakeningDay {
      ensure(value && typeof value === 'object' && !Array.isArray(value), '覚醒履歴が不正です');
      const wire = value as Wire;
      const keys = ['historySchema', 'age', 'awakening', 'awakeningChanges'];
      ensure(
        Object.keys(wire).length === keys.length &&
          keys.every((k) => Object.hasOwn(wire, k)) &&
          wire.historySchema === 'rookie-day-v1',
        '未対応の覚醒履歴形式です',
      );
      ensure(
        Array.isArray(wire.awakening) &&
          wire.awakening.length <= playerCount &&
          Array.isArray(wire.awakeningChanges) &&
          wire.awakeningChanges.length <= playerCount,
        '覚醒履歴の件数が不正です',
      );
      ensure(
        wire.awakeningChanges.every((c) => c && c.reason === 'rookieAwakening'),
        '覚醒変更の理由が不正です',
      );
      const base = age.decode(wire.age);
      return {
        ...base,
        awakening: wire.awakening,
        changes: [...base.changes, ...wire.awakeningChanges],
      };
    },
  };
}
