import { growthBasis, growthAbilityKey } from './growth-basis.ts';
import type { WorldRecord, WorldDefinitions } from './types.ts';
import type { GrowthState, GrowthView } from './growth-types.ts';

const cache = new WeakMap<GrowthState, GrowthView>();
/** 乱数・未公開の将来状態を含めない。日次境界の同じgrowthを閲覧中は再集計しない。 */
export function growthView(world: WorldRecord): GrowthView | null {
  if (!('growth' in world)) return null;
  const cached = cache.get(world.growth);
  if (cached) return cached;
  const state = world.growth.state;
  const dates = Object.keys(state.days).sort();
  const ids = Object.keys(state.players).sort();
  const current = Object.fromEntries(ids.map((id) => [id, { ...state.players[id]!.values }]));
  const initial = Object.fromEntries(
    ids.map((id) => [
      id,
      Object.fromEntries(growthBasis(world.definitions, id).map((a) => [a.key, a.valueMilli])),
    ]),
  );
  const periods = {} as GrowthView['periods'];
  for (const [key, length] of [
    ['season', dates.length],
    ['last30', 30],
    ['last7', 7],
    ['lastDay', 1],
  ] as const) {
    const startIndex = Math.max(0, dates.length - length);
    const start = key === 'season' ? structuredClone(initial) : structuredClone(current);
    if (key !== 'season')
      for (const date of dates.slice(startIndex).reverse())
        for (const change of [...state.days[date]!.changes].reverse())
          start[change.playerId]![growthAbilityKey(change.abilityRef)] = change.beforeValue;
    periods[key] = {
      from: dates[startIndex] ?? world.definitions.startDate,
      through: dates.at(-1) ?? null,
      start,
    };
  }
  const last = dates.at(-1);
  const view: GrowthView = {
    version: world.growth.version,
    current,
    periods,
    dates,
    dailyDeltas: Object.fromEntries(
      ids.map((id) => [id, dates.map((date) => state.days[date]!.displayDeltas[id]!)]),
    ),
    latest: last
      ? {
          date: last,
          outcomes: structuredClone(state.days[last]!.outcomes),
          ...(world.growth.version === 'daily-development-v2'
            ? { experience: structuredClone(world.growth.state.days[last]!.experience) }
            : {}),
        }
      : null,
  };
  cache.set(world.growth, view);
  return view;
}
/** 期間合計は端点の表示整数の差。固定特性や上限・球速を足さない。 */
export function growthComparison(
  definitions: WorldDefinitions,
  playerId: string,
  before: Record<string, number>,
  after: Record<string, number>,
) {
  const rows = growthBasis(definitions, playerId).map((ability) => ({
    ...ability,
    beforeValue: before[ability.key]!,
    afterValue: after[ability.key]!,
    delta: Math.floor(after[ability.key]! / 1000) - Math.floor(before[ability.key]! / 1000),
  }));
  return {
    rows,
    increase: rows.reduce((sum, row) => sum + Math.max(0, row.delta), 0),
    decrease: rows.reduce((sum, row) => sum + Math.min(0, row.delta), 0),
    net: rows.reduce((sum, row) => sum + row.delta, 0),
  };
}
