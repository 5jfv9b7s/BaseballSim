import { ensure, integer } from '../engine/validation.ts';
import { COMMON_ABILITIES } from '../players/abilities.ts';
import { playerAge, isDateOnly } from './player-profiles.ts';
import { playerDevelopment } from './player-development.ts';
import { growthBasis } from './growth-basis.ts';
import { freezeGrowthData } from './growth.ts';
import { initialDevelopment, calculateDevelopmentDay } from './experience.ts';
import { AGE_GROUPS } from './age-types.ts';
import type {
  AgeConfig,
  AgeCurve,
  AgeDevelopmentGrowthState,
  AgeDevelopmentDay,
} from './age-types.ts';
import type { TrainingAbilityRef } from './training-types.ts';
import type { WorldDefinitions, WorldRecord } from './types.ts';

type AgeWorld = Extract<WorldRecord, { version: 'world-prototype-v18' | 'world-prototype-v19' }>;
/** 平均グレゴリオ年365.2425日。日次への変換は整数端数を繰り越す。 */
export const AGE_YEAR_DENOMINATOR = 3652425;
function fields(value: unknown, keys: string[], label: string): void {
  ensure(value && typeof value === 'object' && !Array.isArray(value), label + 'が不正です');
  ensure(
    Object.keys(value).length === keys.length && keys.every((k) => Object.hasOwn(value, k)),
    label + 'の項目が不正です',
  );
}
export function validateAgeDefinitions(d: WorldDefinitions): void {
  if (!['world-definitions-v23', 'world-definitions-v24'].includes(d.version)) {
    ensure(
      d.ageConfig === undefined && d.ageCurves === undefined,
      '旧定義へ年齢変化を追加できません',
    );
    return;
  }
  const c = d.ageConfig;
  fields(
    c,
    [
      'version',
      'enabled',
      'groups',
      'growthAmount',
      'abilityGroups',
      'positionGroup',
      'pitchGroups',
    ],
    '年齢変化モデル',
  );
  ensure(
    c!.version === 'age-development-v1' && typeof c!.enabled === 'boolean',
    '未対応の年齢変化モデルです',
  );
  fields(c!.groups, [...AGE_GROUPS], '年齢変化の能力群');
  for (const group of AGE_GROUPS) {
    const g = c!.groups[group];
    fields(
      g,
      ['growthMilliPerYear', 'declineMilliPerYear', 'declineRampAgeMilli'],
      '年齢変化の係数',
    );
    integer(g.growthMilliPerYear, 0, 12000, '年齢成長の年間量');
    integer(g.declineMilliPerYear, 0, 12000, '衰退の年間量');
    integer(g.declineRampAgeMilli, 1, 30000, '衰退速度の移行年数');
  }
  fields(c!.growthAmount, ['basePermille', 'talentPermille'], '年齢成長の才能係数');
  integer(c!.growthAmount.basePermille, 1, 2000, '年齢成長の基礎倍率');
  integer(c!.growthAmount.talentPermille, 0, 2000, '年齢成長の才能倍率');
  fields(c!.abilityGroups, Object.keys(COMMON_ABILITIES), '能力と年齢群の対応');
  fields(c!.pitchGroups, ['control', 'repeatability'], '持ち球と年齢群の対応');
  for (const group of [
    ...Object.values(c!.abilityGroups),
    ...Object.values(c!.pitchGroups),
    c!.positionGroup,
  ])
    ensure(AGE_GROUPS.includes(group), '未知の年齢能力群です');
  const catalog = d.ageCurves;
  fields(catalog, ['version', 'source', 'players'], '年齢曲線辞書');
  ensure(
    catalog!.version === 'age-curves-v1' && catalog!.source === 'fictional-age-curves-v1',
    '未対応の年齢曲線です',
  );
  const ids = d.squads.flatMap((s) => s.players.map((p) => p.playerId));
  ensure(
    Array.isArray(catalog!.players) && catalog!.players.length === ids.length,
    '年齢曲線の人数が一致しません',
  );
  const seen = new Set<string>();
  for (const p of catalog!.players) {
    fields(p, ['playerId', 'ageCurves'], '選手の年齢曲線');
    ensure(ids.includes(p.playerId) && !seen.has(p.playerId), '年齢曲線の選手が不正です');
    seen.add(p.playerId);
    fields(p.ageCurves, [...AGE_GROUPS], '個別の年齢能力群');
    const profile = d.playerProfiles?.players.find((v) => v.playerId === p.playerId);
    ensure(
      profile && playerAge(profile.birthDate, d.startDate) !== null,
      '年齢計算に必要な生年月日がありません',
    );
    for (const g of AGE_GROUPS) {
      const v = p.ageCurves[g];
      fields(
        v,
        [
          'growthStartAgeMilli',
          'growthPeakAgeMilli',
          'growthEndAgeMilli',
          'declineStartAgeMilli',
          'growthPermille',
          'declinePermille',
        ],
        '個別年齢曲線',
      );
      integer(v.growthStartAgeMilli, 0, 78000, '成長期の開始');
      integer(v.growthPeakAgeMilli, v.growthStartAgeMilli + 1, 79000, '成長期の頂点');
      integer(v.growthEndAgeMilli, v.growthPeakAgeMilli + 1, 80000, '成長期の終了');
      integer(v.declineStartAgeMilli, v.growthEndAgeMilli, 100000, '衰退の開始');
      integer(v.growthPermille, 0, 2000, '個人の成長速度');
      integer(v.declinePermille, 0, 2000, '個人の衰退速度');
    }
  }
}
/** 表示年齢と同じ誕生日境界。2/29生まれは非閏年の3/1に加齢する。 */
export function ageAtMilli(birthDate: string, date: string): number {
  const years = playerAge(birthDate, date);
  ensure(years !== null, '年齢を導出できません');
  const anniversary = (year: number) => {
    const value = year + birthDate.slice(4);
    return isDateOnly(value) ? value : year + '-03-01';
  };
  const year = Number(date.slice(0, 4)) - Number(date.slice(5) < birthDate.slice(5));
  const start = Date.parse(anniversary(year) + 'T00:00:00Z');
  const end = Date.parse(anniversary(year + 1) + 'T00:00:00Z');
  return (
    years * 1000 + Math.floor(((Date.parse(date + 'T00:00:00Z') - start) * 1000) / (end - start))
  );
}
export function ageAbilityGroup(c: AgeConfig, ref: TrainingAbilityRef) {
  if (ref.scope === 'position') return c.positionGroup;
  if (ref.scope === 'pitch') return c.pitchGroups[ref.code];
  return c.abilityGroups[`${ref.scope}.${ref.code}` as keyof AgeConfig['abilityGroups']];
}
/** 年齢による自然変化。練習・経験の量と抽選は変更しない。 */
export function ageAnnualRate(
  c: AgeConfig,
  curve: AgeCurve,
  group: (typeof AGE_GROUPS)[number],
  age: number,
  talent: number,
): number {
  if (!c.enabled) return 0;
  const g = c.groups[group];
  if (age > curve.growthStartAgeMilli && age < curve.growthEndAgeMilli) {
    const fraction =
      age <= curve.growthPeakAgeMilli
        ? (age - curve.growthStartAgeMilli) / (curve.growthPeakAgeMilli - curve.growthStartAgeMilli)
        : (curve.growthEndAgeMilli - age) / (curve.growthEndAgeMilli - curve.growthPeakAgeMilli);
    const talentFactor =
      c.growthAmount.basePermille + (c.growthAmount.talentPermille * talent) / 120000;
    return Math.floor(
      (g.growthMilliPerYear * fraction * curve.growthPermille * talentFactor) / 1000000,
    );
  }
  const fraction = Math.max(
    0,
    Math.min(1, (age - curve.declineStartAgeMilli) / g.declineRampAgeMilli),
  );
  const decline = Math.floor((g.declineMilliPerYear * fraction * curve.declinePermille) / 1000);
  return decline === 0 ? 0 : -decline;
}
/** 1内部値未満の端数を保持し、上限/下限へ達した方向の余りは持ち越さない。 */
export function ageDailyChange(before: number, ceiling: number, rate: number, remainder: number) {
  const numerator = rate * 10000 + (rate === 0 ? 0 : remainder);
  const delta = Math.trunc(numerator / AGE_YEAR_DENOMINATOR);
  const after = Math.max(0, Math.min(ceiling, before + delta));
  return {
    after,
    remainder:
      (rate > 0 && after === ceiling) || (rate < 0 && after === 0)
        ? 0
        : numerator - delta * AGE_YEAR_DENOMINATOR,
  };
}
export function initialAgeDevelopment(
  d: WorldDefinitions,
  seed: number,
): AgeDevelopmentGrowthState {
  validateAgeDefinitions(d);
  ensure(
    ['world-definitions-v23', 'world-definitions-v24'].includes(d.version),
    '年齢曲線に対応する定義が必要です',
  );
  const base = initialDevelopment(d, seed);
  return {
    modelId: 'daily-development',
    version: 'daily-development-v3',
    schemaId: 'daily-development-state-v3',
    state: {
      ...base.state,
      days: {},
      agingRemainders: Object.fromEntries(
        Object.entries(base.state.players).map(([id, p]) => [
          id,
          Object.fromEntries(Object.keys(p.values).map((k) => [k, 0])),
        ]),
      ),
    },
  };
}
export function calculateAgeDevelopmentDay(world: AgeWorld) {
  const { players, day: previousDay, physical, experienceRng } = calculateDevelopmentDay(world);
  const day: AgeDevelopmentDay = { ...previousDay, aging: [] };
  const c = world.definitions.ageConfig!;
  const agingRemainders = { ...world.growth.state.agingRemainders };
  for (const playerId of Object.keys(players).sort()) {
    const values = players[playerId]!.values;
    const remainders = { ...agingRemainders[playerId]! };
    const profile = world.definitions.playerProfiles!.players.find((p) => p.playerId === playerId)!;
    const curves = world.definitions.ageCurves!.players.find(
      (p) => p.playerId === playerId,
    )!.ageCurves;
    const age = ageAtMilli(profile.birthDate, world.currentDate);
    const talent = playerDevelopment(world.definitions, playerId)!.growthProfile.talentMilli;
    const groups = AGE_GROUPS.map((group) => ({ group, increaseMilli: 0, decreaseMilli: 0 }));
    for (const a of growthBasis(world.definitions, playerId)) {
      const group = ageAbilityGroup(c, a.abilityRef);
      const rate = ageAnnualRate(c, curves[group], group, age, talent);
      if (!c.enabled) continue;
      const before = values[a.key]!;
      const result = ageDailyChange(before, a.ceilingMilli, rate, remainders[a.key]!);
      const after = result.after;
      remainders[a.key] = result.remainder;
      if (before === after) continue;
      values[a.key] = after;
      const totals = groups.find((g) => g.group === group)!;
      totals.increaseMilli += Math.max(0, after - before);
      totals.decreaseMilli += Math.min(0, after - before);
      const order = day.changes.length + 1;
      day.changes.push({
        changeId: `aging-${world.currentDate}-${playerId}-${order}`,
        playerId,
        effectiveOn: world.currentDate,
        eventOrder: order,
        abilityRef: structuredClone(a.abilityRef),
        unitCode: 'ratingMilli',
        changeKind: 'value',
        beforeValue: before,
        afterValue: after,
        reason: 'aging',
        sourceEventId: 'aging-day-' + world.currentDate,
        abilityCatalogVersion: 'common-abilities-v1',
      });
    }
    agingRemainders[playerId] = remainders;
    day.aging.push({ playerId, ageMilli: age, groups });
    day.displayDeltas[playerId] = growthBasis(world.definitions, playerId).reduce(
      (sum, a) =>
        sum +
        Math.floor(values[a.key]! / 1000) -
        Math.floor(world.growth.state.players[playerId]!.values[a.key]! / 1000),
      0,
    );
  }
  return { players, day, physical, experienceRng, agingRemainders };
}
/** 旧v18の計算・状態・保存を維持する。 */
export function applyAgeDevelopmentDay(
  world: Extract<WorldRecord, { version: 'world-prototype-v18' }>,
) {
  const { players, day, physical, experienceRng, agingRemainders } =
    calculateAgeDevelopmentDay(world);
  const growth: AgeDevelopmentGrowthState = {
    ...world.growth,
    state: {
      players,
      experienceRng,
      agingRemainders,
      lastCompletedOn: world.currentDate,
      days: { ...world.growth.state.days, [world.currentDate]: freezeGrowthData(day) },
    },
  };
  return { growth, physical };
}
