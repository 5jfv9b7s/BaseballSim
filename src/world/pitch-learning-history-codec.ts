import { ensure } from '../engine/validation.ts';
import { createCampHistoryCodec } from './camp-history-codec.ts';
import { freezeGrowthData } from './growth.ts';
import type { WorldDefinitions } from './types.ts';
import type { PitchLearningDay } from './pitch-learning-types.ts';

type Wire = {
  historySchema: 'pitch-learning-day-v1';
  camp: unknown;
  pitchLearning: PitchLearningDay['pitchLearning'];
};
const cache = new WeakMap<WorldDefinitions, WeakMap<PitchLearningDay, Wire>>();
export function createPitchLearningHistoryCodec(d: WorldDefinitions) {
  const camp = createCampHistoryCodec(d);
  const count = d.squads.reduce((n, s) => n + s.players.length, 0);
  return {
    encode(day: PitchLearningDay): Wire {
      const hit = cache.get(d)?.get(day);
      if (hit) return hit;
      const { pitchLearning, ...base } = day;
      const wire: Wire = {
        historySchema: 'pitch-learning-day-v1',
        camp: camp.encode(base),
        pitchLearning,
      };
      if (Object.isFrozen(day) && Object.isFrozen(d)) {
        const days = cache.get(d) ?? new WeakMap<PitchLearningDay, Wire>();
        days.set(day, freezeGrowthData(wire));
        cache.set(d, days);
      }
      return wire;
    },
    decode(value: unknown): PitchLearningDay {
      ensure(value && typeof value === 'object' && !Array.isArray(value), '球種習得履歴が不正です');
      const w = value as Wire;
      ensure(
        Object.keys(w).sort().join('|') === 'camp|historySchema|pitchLearning' &&
          w.historySchema === 'pitch-learning-day-v1' &&
          Array.isArray(w.pitchLearning) &&
          w.pitchLearning.length <= count,
        '球種習得履歴の形式が不正です',
      );
      return { ...camp.decode(w.camp), pitchLearning: w.pitchLearning };
    },
  };
}
