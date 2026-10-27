import { ensure, integer } from '../engine/validation.ts';
import { nextRandom } from '../engine/rng.ts';
import { fnv1a32 } from './identity.ts';
import { initialAgeDevelopment, calculateAgeDevelopmentDay } from './aging.ts';
import { freezeGrowthData } from './growth.ts';
import { activeGrowthBasis } from './growth-basis.ts';
import { playerDevelopment } from './player-development.ts';
import type { WorldDefinitions, WorldRecord } from './types.ts';
import type {
  RookieAwakeningConfig,
  RookieDevelopmentGrowthState,
  RookieAwakeningDay,
} from './awakening-types.ts';

type RookieWorld = Extract<
  WorldRecord,
  { version: 'world-prototype-v19' | 'world-prototype-v20' | 'world-prototype-v21' }
>;
function fields(value: unknown, keys: string[], name: string) {
  ensure(value && typeof value === 'object' && !Array.isArray(value), name + 'が不正です');
  ensure(
    Object.keys(value).length === keys.length && keys.every((k) => Object.hasOwn(value, k)),
    name + 'の項目が不正です',
  );
}
export function validateAwakeningDefinitions(d: WorldDefinitions): void {
  if (
    !['world-definitions-v24', 'world-definitions-v25', 'world-definitions-v26'].includes(d.version)
  ) {
    ensure(d.awakeningConfig === undefined, '旧定義へ覚醒モデルを追加できません');
    return;
  }
  const c = d.awakeningConfig;
  fields(c, ['version', 'enabled', 'opportunity', 'amount'], 'ルーキー覚醒');
  ensure(
    c!.version === 'rookie-awakening-v1' && typeof c!.enabled === 'boolean',
    '未対応の覚醒モデルです',
  );
  fields(c!.opportunity, ['basePpm', 'ambitionPpm'], '覚醒機会');
  integer(c!.opportunity.basePpm, 0, 1000000, '覚醒の基礎確率');
  integer(c!.opportunity.ambitionPpm, 0, 1000000, '覚醒の向上心係数');
  ensure(
    d.startDate.slice(0, 4) === d.endDate.slice(0, 4),
    '覚醒モデルv1は単年の日程だけに対応します',
  );
  fields(c!.amount, ['baseMilli', 'talentMilli'], '覚醒量');
  integer(c!.amount.baseMilli, 1, 12000, '覚醒の基礎量');
  integer(c!.amount.talentMilli, 0, 12000, '覚醒の才能係数');
}
export function rookieAwakeningChance(c: RookieAwakeningConfig, ambition: number): number {
  return Math.min(
    1000000,
    Math.floor(c.opportunity.basePpm + (c.opportunity.ambitionPpm * ambition) / 120000),
  );
}
export function rookieAwakeningBudget(c: RookieAwakeningConfig, talent: number): number {
  return Math.round(c.amount.baseMilli + (c.amount.talentMilli * talent) / 120000);
}
/** 日本球界初年度・年齢・登録区分からプロ1年目を推測しない。 */
export function isProfessionalRookie(firstProYear: number | null, date: string): boolean {
  return firstProYear !== null && firstProYear === Number(date.slice(0, 4));
}
export function initialRookieDevelopment(
  d: WorldDefinitions,
  seed: number,
): RookieDevelopmentGrowthState {
  validateAwakeningDefinitions(d);
  ensure(
    ['world-definitions-v24', 'world-definitions-v25', 'world-definitions-v26'].includes(d.version),
    '覚醒に対応する定義が必要です',
  );
  const base = initialAgeDevelopment(d, seed);
  const players = Object.fromEntries(
    d
      .playerProfiles!.players.filter((p) => isProfessionalRookie(p.firstProYear, d.startDate))
      .sort((a, b) => (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0))
      .map((p) => [
        p.playerId,
        {
          eligibleFrom: d.startDate,
          eligibleThrough:
            d.endDate < d.startDate.slice(0, 4) + '-12-31'
              ? d.endDate
              : d.startDate.slice(0, 4) + '-12-31',
          rng: {
            streamId: 'rookie-awakening-' + p.playerId,
            algorithmVersion: 'xorshift32-v1' as const,
            fullState: { word: fnv1a32('rookie-awakening-v1:' + seed + ':' + p.playerId) || 1 },
            drawCount: 0,
          },
          appliedEventId: null,
          appliedOn: null,
        },
      ]),
  );
  return {
    modelId: 'daily-development',
    version: 'daily-development-v4',
    schemaId: 'daily-development-state-v4',
    state: {
      ...base.state,
      days: {},
      awakeningState: {
        modelId: 'rookie-awakening',
        version: 'rookie-awakening-v1',
        schemaId: 'rookie-awakening-state-v1',
        players,
      },
    },
  };
}
/** 全試合後、練習→経験→年齢変化→覚醒。保存成功前の候補だけを更新する。 */
export function calculateRookieDevelopmentDay(
  world: RookieWorld,
  override?: import('./camp-types.ts').CampTrainingOverride,
) {
  const aged = calculateAgeDevelopmentDay(world, override);
  const { players, experienceRng, agingRemainders, physical } = aged;
  const day: RookieAwakeningDay = { ...aged.day, awakening: [] };
  const c = world.definitions.awakeningConfig!;
  const previous = world.growth.state.awakeningState;
  const states = { ...previous.players };
  for (const id of Object.keys(states).sort()) {
    const state = states[id]!;
    if (
      !c.enabled ||
      state.appliedEventId !== null ||
      world.currentDate < state.eligibleFrom ||
      world.currentDate > state.eligibleThrough
    )
      continue;
    const values = players[id]!.values;
    const targets = activeGrowthBasis(world, id).filter((a) => values[a.key]! < a.ceilingMilli);
    if (!targets.length) {
      day.awakening.push({ playerId: id, status: 'noRoom' });
      continue;
    }
    // 成否にかかわらず機会・対象の2回。通常練習/経験/試合の乱数とは独立。
    const chance = nextRandom(state.rng);
    const target = nextRandom(chance.state);
    states[id] = { ...state, rng: target.state };
    const traits = playerDevelopment(world.definitions, id)!.growthProfile;
    const chancePpm = rookieAwakeningChance(c, traits.ambitionMilli);
    if (chance.value * 1000000 >= chancePpm) {
      day.awakening.push({ playerId: id, status: 'missed' });
      continue;
    }
    const ability = targets[Math.floor(target.value * targets.length)]!;
    const talent = traits.talentMilli;
    const budget = rookieAwakeningBudget(c, talent);
    const before = values[ability.key]!;
    const after = Math.min(ability.ceilingMilli, before + budget);
    const eventId = `rookie-awakening-${world.currentDate}-${id}`;
    const order = day.changes.length + 1;
    values[ability.key] = after;
    states[id] = { ...states[id]!, appliedEventId: eventId, appliedOn: world.currentDate };
    day.awakening.push({
      playerId: id,
      status: 'occurred',
      eventId,
      date: world.currentDate,
      abilityRef: structuredClone(ability.abilityRef),
      beforeValue: before,
      afterValue: after,
      budgetMilli: budget,
    });
    day.changes.push({
      changeId: eventId + '-' + order,
      playerId: id,
      effectiveOn: world.currentDate,
      eventOrder: order,
      abilityRef: structuredClone(ability.abilityRef),
      unitCode: 'ratingMilli',
      changeKind: 'value',
      beforeValue: before,
      afterValue: after,
      reason: 'rookieAwakening',
      sourceEventId: eventId,
      abilityCatalogVersion: 'common-abilities-v1',
    });
  }
  for (const id of Object.keys(players)) {
    day.displayDeltas[id] = activeGrowthBasis(world, id).reduce(
      (sum, a) =>
        sum +
        Math.floor(players[id]!.values[a.key]! / 1000) -
        Math.floor(world.growth.state.players[id]!.values[a.key]! / 1000),
      0,
    );
  }
  return {
    players,
    experienceRng,
    agingRemainders,
    physical,
    day,
    awakeningState: { ...previous, players: states },
  };
}
/** 旧v19の計算・状態・保存構造を維持する。 */
export function applyRookieDevelopmentDay(
  world: Extract<WorldRecord, { version: 'world-prototype-v19' }>,
) {
  const { players, experienceRng, agingRemainders, physical, day, awakeningState } =
    calculateRookieDevelopmentDay(world);
  const growth: RookieDevelopmentGrowthState = {
    ...world.growth,
    state: {
      players,
      experienceRng,
      agingRemainders,
      awakeningState,
      lastCompletedOn: world.currentDate,
      days: { ...world.growth.state.days, [world.currentDate]: freezeGrowthData(day) },
    },
  };
  return { growth, physical };
}
