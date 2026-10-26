import { ensure } from '../engine/validation.ts';
import { createAwakeningHistoryCodec } from './awakening-history-codec.ts';
import { freezeGrowthData } from './growth.ts';
import type { WorldDefinitions } from './types.ts';
import type { CampDevelopmentDay } from './camp-types.ts';

type Wire = {
  historySchema: 'camp-day-v1';
  rookie: unknown;
  camp: CampDevelopmentDay['camp'];
  burstChanges: CampDevelopmentDay['changes'];
};
const cache = new WeakMap<WorldDefinitions, WeakMap<CampDevelopmentDay, Wire>>();
/** v021専用の可逆表現。旧形式と容量上限を維持する。 */
export function createCampHistoryCodec(d: WorldDefinitions) {
  const rookie = createAwakeningHistoryCodec(d);
  const maxChanges = d.squads.reduce(
    (n, s) =>
      n +
      s.players.reduce(
        (m, p) => m + 22 + 9 + 2 * s.pitches.filter((x) => x.playerId === p.playerId).length,
        0,
      ),
    0,
  );
  return {
    encode(day: CampDevelopmentDay): Wire {
      const hit = cache.get(d)?.get(day);
      if (hit) return hit;
      const first = day.changes.findIndex((c) => c.reason === 'campBurst'),
        split = first < 0 ? day.changes.length : first;
      const burstChanges = day.changes.slice(split);
      ensure(
        burstChanges.every((c) => c.reason === 'campBurst'),
        'キャンプ爆発の履歴順が不正です',
      );
      const { camp, ...base } = day;
      const wire: Wire = {
        historySchema: 'camp-day-v1',
        rookie: rookie.encode({ ...base, changes: day.changes.slice(0, split) }),
        camp,
        burstChanges,
      };
      if (Object.isFrozen(day) && Object.isFrozen(d)) {
        const map = cache.get(d) ?? new WeakMap<CampDevelopmentDay, Wire>();
        map.set(day, freezeGrowthData(wire));
        cache.set(d, map);
      }
      return wire;
    },
    decode(value: unknown): CampDevelopmentDay {
      ensure(value && typeof value === 'object' && !Array.isArray(value), 'キャンプ履歴が不正です');
      const w = value as Wire,
        keys = ['historySchema', 'rookie', 'camp', 'burstChanges'];
      ensure(
        Object.keys(w).length === keys.length &&
          keys.every((k) => Object.hasOwn(w, k)) &&
          w.historySchema === 'camp-day-v1',
        '未対応のキャンプ履歴形式です',
      );
      ensure(
        Array.isArray(w.burstChanges) &&
          w.burstChanges.length <= maxChanges &&
          w.burstChanges.every((c) => c && c.reason === 'campBurst'),
        'キャンプ爆発変更が不正です',
      );
      const base = rookie.decode(w.rookie);
      return { ...base, camp: w.camp, changes: [...base.changes, ...w.burstChanges] };
    },
  };
}
