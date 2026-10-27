import { ensure, integer } from '../engine/validation.ts';
import { nextRandom } from '../engine/rng.ts';
import { fnv1a32 } from './identity.ts';
import { activityKey } from './physical.ts';
import { activeGrowthBasis, growthBasis, growthAbilityKey } from './growth-basis.ts';
import { playerDevelopment } from './player-development.ts';
import { trainingSettings, trainingTargetAbilities } from './training.ts';
import type { WorldDefinitions, WorldRecord } from './types.ts';
import type { GrowthConfig, TrainingGrowthState, TrainingDay } from './growth-types.ts';
import type { TrainingSettings } from './training-types.ts';

function fields(value: unknown, keys: string[], name: string): void {
  ensure(value !== null && typeof value === 'object' && !Array.isArray(value), name + 'が不正です');
  ensure(
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)),
    name + 'の項目が不足または余分です',
  );
}

export function validateGrowthDefinitions(definitions: WorldDefinitions): void {
  if (
    ![
      'world-definitions-v21',
      'world-definitions-v22',
      'world-definitions-v23',
      'world-definitions-v24',
      'world-definitions-v25',
      'world-definitions-v26',
    ].includes(definitions.version)
  ) {
    ensure(definitions.growthConfig === undefined, '旧定義へ成長モデルを追加できません');
    return;
  }
  const config = definitions.growthConfig;
  fields(
    config,
    ['version', 'enabled', 'opportunity', 'budget', 'intensities', 'fatigueAdjustment'],
    '通常練習モデル',
  );
  ensure(
    config!.version === 'daily-training-v1' && typeof config!.enabled === 'boolean',
    '未対応の通常練習モデルです',
  );
  fields(config!.opportunity, ['baseMilli', 'ambitionMilli'], '成長機会の係数');
  integer(config!.opportunity.baseMilli, 1, 100000, '基礎成長機会');
  integer(config!.opportunity.ambitionMilli, 0, 100000, '向上心の成長機会');
  fields(config!.budget, ['baseMilli', 'talentMilli', 'backgroundPermille'], '成長量の係数');
  integer(config!.budget.baseMilli, 1, 12000, '基礎成長量');
  integer(config!.budget.talentMilli, 0, 12000, '才能の成長量');
  integer(config!.budget.backgroundPermille, 0, 1000, '指定外の練習配分');
  fields(config!.intensities, ['light', 'normal', 'hard', 'rest'], '練習強度の係数');
  for (const [kind, input] of Object.entries(config!.intensities)) {
    fields(
      input,
      ['opportunityPermille', 'amountPermille', 'energyCostMilli', 'fatigueCostMilli'],
      '強度別係数',
    );
    integer(input.opportunityPermille, 0, 2000, '強度別の機会倍率');
    integer(input.amountPermille, 0, 2000, '強度別の成長量倍率');
    integer(input.energyCostMilli, 0, 100000, '練習の体力消費');
    integer(input.fatigueCostMilli, 0, 100000, '練習の疲労');
    if (kind === 'rest')
      ensure(
        Object.values(input).every((value) => value === 0),
        '休養に練習効果や負荷を設定できません',
      );
  }
  const adjustment = config!.fatigueAdjustment;
  fields(
    adjustment,
    [
      'lightEnergyAtOrBelowMilli',
      'restEnergyAtOrBelowMilli',
      'lightFatigueAtOrAboveMilli',
      'restFatigueAtOrAboveMilli',
      'lightWorkloadAtOrAbove',
      'restWorkloadAtOrAbove',
    ],
    '練習の自動調整',
  );
  integer(adjustment.restEnergyAtOrBelowMilli, 0, 100000, '休養への体力境界');
  integer(
    adjustment.lightEnergyAtOrBelowMilli,
    adjustment.restEnergyAtOrBelowMilli,
    100000,
    '軽めへの体力境界',
  );
  integer(adjustment.lightFatigueAtOrAboveMilli, 0, 100000, '軽めへの疲労境界');
  integer(
    adjustment.restFatigueAtOrAboveMilli,
    adjustment.lightFatigueAtOrAboveMilli,
    100000,
    '休養への疲労境界',
  );
  integer(adjustment.lightWorkloadAtOrAbove, 0, 100000000, '軽めへの負荷境界');
  integer(
    adjustment.restWorkloadAtOrAbove,
    adjustment.lightWorkloadAtOrAbove,
    100000000,
    '休養への負荷境界',
  );
}
const deeplyFrozen = new WeakSet<object>();
export function freezeGrowthData<T>(value: T): T {
  if (value && typeof value === 'object') {
    if (deeplyFrozen.has(value)) return value;
    for (const child of Object.values(value)) freezeGrowthData(child);
    Object.freeze(value);
    deeplyFrozen.add(value);
  }
  return value;
}

export function initialGrowth(definitions: WorldDefinitions, seed: number): TrainingGrowthState {
  validateGrowthDefinitions(definitions);
  ensure(
    [
      'world-definitions-v21',
      'world-definitions-v22',
      'world-definitions-v23',
      'world-definitions-v24',
      'world-definitions-v25',
      'world-definitions-v26',
    ].includes(definitions.version),
    '通常練習に対応する初期定義が必要です',
  );
  return {
    modelId: 'daily-training',
    version: 'daily-training-v1',
    schemaId: 'daily-training-state-v1',
    state: {
      lastCompletedOn: null,
      days: {},
      players: Object.fromEntries(
        definitions.squads
          .flatMap((s) => s.players)
          .map((player) => [
            player.playerId,
            {
              values: Object.fromEntries(
                growthBasis(definitions, player.playerId).map((ability) => [
                  ability.key,
                  ability.valueMilli,
                ]),
              ),
              rng: {
                streamId: 'training-' + player.playerId,
                algorithmVersion: 'xorshift32-v1',
                fullState: {
                  word: fnv1a32('daily-training-v1:' + seed + ':' + player.playerId) || 1,
                },
                drawCount: 0,
              },
            },
          ]),
      ),
    },
  };
}

export function chooseTrainingIntensity(
  settings: TrainingSettings,
  energy: number,
  fatigue: number,
  workload: number,
  config: GrowthConfig,
) {
  if (!config.enabled) return { intensity: 'rest' as const, reasons: ['モデル無効'] };
  if (settings.intensity === 'rest' || !settings.autoAdjustForFatigue)
    return { intensity: settings.intensity, reasons: [] as string[] };
  const a = config.fatigueAdjustment;
  const rest = [
    energy <= a.restEnergyAtOrBelowMilli ? '体力低下' : null,
    fatigue >= a.restFatigueAtOrAboveMilli ? '疲労蓄積' : null,
    workload >= a.restWorkloadAtOrAbove ? '出場負荷' : null,
  ].filter((v): v is string => v !== null);
  if (rest.length) return { intensity: 'rest' as const, reasons: rest };
  const light = [
    energy <= a.lightEnergyAtOrBelowMilli ? '体力低下' : null,
    fatigue >= a.lightFatigueAtOrAboveMilli ? '疲労蓄積' : null,
    workload >= a.lightWorkloadAtOrAbove ? '出場負荷' : null,
  ].filter((v): v is string => v !== null);
  if (light.length && settings.intensity !== 'light')
    return { intensity: 'light' as const, reasons: light };
  return { intensity: settings.intensity, reasons: [] as string[] };
}

export function trainingOpportunity(
  config: GrowthConfig,
  ambition: number,
  intensity: TrainingSettings['intensity'],
) {
  return Math.min(
    100000,
    Math.round(
      ((config.opportunity.baseMilli + (config.opportunity.ambitionMilli * ambition) / 120000) *
        config.intensities[intensity].opportunityPermille) /
        1000,
    ),
  );
}

export function trainingBudget(
  config: GrowthConfig,
  talent: number,
  intensity: TrainingSettings['intensity'],
) {
  return Math.round(
    ((config.budget.baseMilli + (config.budget.talentMilli * talent) / 120000) *
      config.intensities[intensity].amountPermille) /
      1000,
  );
}

/** 全試合後の一回だけ。成長用乱数は各選手で独立し、試合の乱数を消費しない。 */
export function calculateTrainingDay(
  world: Extract<
    WorldRecord,
    {
      version:
        | 'world-prototype-v16'
        | 'world-prototype-v17'
        | 'world-prototype-v18'
        | 'world-prototype-v19'
        | 'world-prototype-v20'
        | 'world-prototype-v21';
    }
  >,
  override?: import('./camp-types.ts').CampTrainingOverride,
) {
  const date = world.currentDate;
  ensure(
    !world.growth.state.days[date] &&
      world.growth.state.lastCompletedOn === world.lastCompletedDate,
    'この日の練習は反映済み、または連続していません',
  );
  ensure(
    world.dayPlan.cursor === world.dayPlan.gameIds.length &&
      world.dayPlan.gameIds.every((id) => world.games[id]?.result),
    '練習は当日の全試合終了後に処理します',
  );
  ensure(world.management.version === 'club-management-v2', '通常練習の指定がありません');
  const config = world.definitions.growthConfig!;
  const players = { ...world.growth.state.players };
  const physical = { ...world.physical, players: { ...world.physical.players } };
  const day: TrainingDay = { date, outcomes: [], changes: [], displayDeltas: {} };
  const playerIds = Object.keys(players).sort();
  for (const playerId of playerIds) {
    const previous = world.growth.state.players[playerId]!;
    const values = { ...previous.values };
    const settings = trainingSettings(
      override?.plans[playerId] ?? world.management.training.plans[playerId]!,
    );
    const body = world.physical.players[playerId]!;
    const workload =
      world.physical.activityLoads[activityKey(playerId, date)]?.sourceLoads.reduce(
        (sum, row) => sum + row.workloadUnits,
        0,
      ) ?? 0;
    const decision = chooseTrainingIntensity(
      settings,
      body.energyMilli,
      body.fatigueMilli,
      workload,
      config,
    );
    const intensity = config.intensities[decision.intensity];
    const traits = playerDevelopment(world.definitions, playerId)!.growthProfile;
    const chance = config.enabled
      ? trainingOpportunity(config, traits.ambitionMilli, decision.intensity)
      : 0;
    const opportunity = config.enabled ? nextRandom(previous.rng) : null;
    const background = opportunity ? nextRandom(opportunity.state) : null;
    const occurred = opportunity !== null && opportunity.value * 100000 < chance;
    const budget = occurred ? trainingBudget(config, traits.talentMilli, decision.intensity) : 0;
    const basis = activeGrowthBasis(world, playerId);
    const byKey = new Map(basis.map((row) => [row.key, row]));
    const targets = trainingTargetAbilities(world.definitions, playerId, settings.target)
      .map((row) => growthAbilityKey(row.abilityRef))
      .filter((key) => byKey.has(key));
    const others = basis.filter((row) => !targets.includes(row.key));
    function grow(key: string, amount: number) {
      const ability = byKey.get(key)!;
      const before = values[key]!;
      const after = Math.min(ability.ceilingMilli, before + amount);
      if (after === before) return;
      values[key] = after;
      const order = day.changes.length + 1;
      day.changes.push({
        changeId: `${override ? 'camp-training' : 'training'}-${date}-${playerId}-${order}`,
        playerId,
        effectiveOn: date,
        eventOrder: order,
        abilityRef: structuredClone(ability.abilityRef),
        unitCode: 'ratingMilli',
        changeKind: 'value',
        beforeValue: before,
        afterValue: after,
        reason: override ? 'campTraining' : 'training',
        sourceEventId: override
          ? 'camp-training-day-' + override.campId + '-' + date
          : 'training-day-' + date,
        abilityCatalogVersion: 'common-abilities-v1',
      });
    }
    let allocatedBudget = budget;
    if (budget > 0) {
      const outside = others.length
        ? Math.floor((budget * config.budget.backgroundPermille) / 1000)
        : 0;
      const focus = Math.round(
        ((budget - outside) * (override?.focusAmountPermille ?? 1000)) / 1000,
      );
      allocatedBudget = focus + outside;
      const share = targets.length ? Math.floor(focus / targets.length) : 0,
        remainder = targets.length ? focus % targets.length : 0;
      const start = targets.length ? world.completedDates.length % targets.length : 0;
      targets.forEach((key, index) =>
        grow(key, share + ((index - start + targets.length) % targets.length < remainder ? 1 : 0)),
      );
      if (outside > 0) grow(others[Math.floor(background!.value * others.length)]!.key, outside);
    }
    players[playerId] = { values, rng: background?.state ?? previous.rng };
    const energySpent = Math.min(body.energyMilli, intensity.energyCostMilli);
    const fatigueAdded = Math.min(100000 - body.fatigueMilli, intensity.fatigueCostMilli);
    physical.players[playerId] = {
      ...body,
      energyMilli: body.energyMilli - energySpent,
      fatigueMilli: body.fatigueMilli + fatigueAdded,
    };
    day.outcomes.push({
      playerId,
      settings,
      effectiveIntensity: decision.intensity,
      adjustmentReasons: decision.reasons,
      opportunityMilli: chance,
      opportunityOccurred: occurred,
      budgetMilli: allocatedBudget,
      ...(override ? { campId: override.campId } : {}),
      energySpentMilli: energySpent,
      fatigueAddedMilli: fatigueAdded,
    });
    day.displayDeltas[playerId] = basis.reduce(
      (sum, ability) =>
        sum +
        Math.floor(values[ability.key]! / 1000) -
        Math.floor(previous.values[ability.key]! / 1000),
      0,
    );
  }
  return { players, day, physical };
}

/** 旧v16の計算・保存構造を維持する。経験成長を後付けしない。 */
export function applyTrainingDay(world: Extract<WorldRecord, { version: 'world-prototype-v16' }>) {
  const { players, day, physical } = calculateTrainingDay(world);
  return {
    growth: {
      ...world.growth,
      state: {
        ...world.growth.state,
        players,
        lastCompletedOn: world.currentDate,
        days: { ...world.growth.state.days, [world.currentDate]: freezeGrowthData(day) },
      },
    },
    physical,
  };
}
