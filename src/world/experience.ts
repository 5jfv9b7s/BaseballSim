import { ensure, integer } from '../engine/validation.ts';
import { nextRandom } from '../engine/rng.ts';
import { fnv1a32 } from './identity.ts';
import { commonTrainingRef } from './training.ts';
import { activeGrowthBasis, growthAbilityKey } from './growth-basis.ts';
import { calculateTrainingDay, freezeGrowthData, initialGrowth } from './growth.ts';
import { playerDevelopment } from './player-development.ts';
import type { WorldDefinitions, WorldRecord } from './types.ts';
import type { TrainingAbilityRef } from './training-types.ts';
import type {
  ExperienceActivity,
  ExperienceConfig,
  ExperienceDomain,
  ExperienceOutcome,
  DevelopmentDay,
  DevelopmentGrowthState,
} from './growth-types.ts';

type DevelopmentWorld = Extract<
  WorldRecord,
  {
    version:
      | 'world-prototype-v17'
      | 'world-prototype-v18'
      | 'world-prototype-v19'
      | 'world-prototype-v20'
      | 'world-prototype-v21';
  }
>;
export const EXPERIENCE_DOMAINS = ['batting', 'pitching', 'fielding'] as const;

function fields(value: unknown, keys: string[], label: string) {
  ensure(value && typeof value === 'object' && !Array.isArray(value), label + 'が不正です');
  ensure(
    Object.keys(value).length === keys.length && keys.every((k) => Object.hasOwn(value, k)),
    label + 'の項目が不正です',
  );
}
export function validateExperienceDefinitions(definitions: WorldDefinitions) {
  if (
    ![
      'world-definitions-v22',
      'world-definitions-v23',
      'world-definitions-v24',
      'world-definitions-v25',
      'world-definitions-v26',
    ].includes(definitions.version)
  ) {
    ensure(definitions.experienceConfig === undefined, '旧定義へ実戦経験モデルを追加できません');
    return;
  }
  const c = definitions.experienceConfig;
  fields(c, ['version', 'enabled', 'opportunity', 'opponent', 'domains'], '実戦経験モデル');
  ensure(
    c!.version === 'game-experience-v1' && typeof c!.enabled === 'boolean',
    '未対応の実戦経験モデルです',
  );
  fields(c!.opportunity, ['baseMilli', 'ambitionMilli'], '実戦経験の成長機会');
  integer(c!.opportunity.baseMilli, 1, 100000, '実戦経験の基礎機会');
  integer(c!.opportunity.ambitionMilli, 0, 100000, '実戦経験の向上心係数');
  fields(c!.opponent, ['centerMilli', 'spanPermille'], '相手能力の補正');
  integer(c!.opponent.centerMilli, 1, 120000, '相手能力の中心');
  integer(c!.opponent.spanPermille, 0, 200, '相手能力による最大補正');
  fields(c!.domains, [...EXPERIENCE_DOMAINS], '実戦経験の分野');
  for (const domain of EXPERIENCE_DOMAINS) {
    const d = c!.domains[domain];
    fields(d, ['saturationUnits', 'basePerUnitMilli', 'talentPerUnitMilli'], '分野別係数');
    integer(d.saturationUnits, 1, 1000, '出場量の飽和単位');
    integer(d.basePerUnitMilli, 1, 1000, '実戦経験の基礎量');
    integer(d.talentPerUnitMilli, 0, 1000, '実戦経験の才能係数');
  }
}

export function initialDevelopment(
  definitions: WorldDefinitions,
  seed: number,
): DevelopmentGrowthState {
  validateExperienceDefinitions(definitions);
  ensure(
    [
      'world-definitions-v22',
      'world-definitions-v23',
      'world-definitions-v24',
      'world-definitions-v25',
      'world-definitions-v26',
    ].includes(definitions.version),
    '実戦経験に対応する定義が必要です',
  );
  const training = initialGrowth(definitions, seed);
  return {
    modelId: 'daily-development',
    version: 'daily-development-v2',
    schemaId: 'daily-development-state-v2',
    state: {
      ...training.state,
      days: {},
      experienceRng: Object.fromEntries(
        Object.keys(training.state.players)
          .sort()
          .map((id) => [
            id,
            {
              streamId: 'experience-' + id,
              algorithmVersion: 'xorshift32-v1',
              fullState: { word: fnv1a32('game-experience-v1:' + seed + ':' + id) || 1 },
              drawCount: 0,
            },
          ]),
      ),
    },
  };
}

/** 結果の成功/失敗によらない実出場。球種・位置の追加で分野全体の予算は増やさない。 */
export function experienceActivities(world: DevelopmentWorld): ExperienceActivity[] {
  type Aggregate = {
    playerId: string;
    domain: ExperienceDomain;
    units: number;
    qualitySum: number;
    sources: Map<string, number>;
    targets: Map<string, { abilityRef: TrainingAbilityRef; units: number }>;
  };
  const rows = new Map<string, Aggregate>();
  function add(
    playerId: string,
    domain: ExperienceDomain,
    gameId: string,
    refs: TrainingAbilityRef[],
    quality: number,
  ) {
    const key = playerId + ':' + domain;
    let row = rows.get(key);
    if (!row) {
      row = { playerId, domain, units: 0, qualitySum: 0, sources: new Map(), targets: new Map() };
      rows.set(key, row);
    }
    row.units++;
    row.qualitySum += quality;
    row.sources.set(gameId, (row.sources.get(gameId) ?? 0) + 1);
    for (const abilityRef of refs) {
      const refKey = growthAbilityKey(abilityRef);
      const target = row.targets.get(refKey) ?? { abilityRef, units: 0 };
      target.units++;
      row.targets.set(refKey, target);
    }
  }
  for (const gameId of [...world.dayPlan.gameIds].sort()) {
    const game = world.games[gameId]!;
    ensure(game?.result, '実戦経験は完了した当日試合から集計します');
    const pitches = new Map(game.fixture.pitches.map((p) => [p.pitchId, p]));
    const players = new Map(game.fixture.players.map((p) => [p.playerId, p]));
    for (const event of game.events) {
      const pitch = event.pitch;
      if (!pitch) continue;
      const repertoire = pitches.get(pitch.pitchId)!;
      const batter = players.get(pitch.batterId)!;
      const pitcherQuality = Math.round(
        (repertoire.control.valueMilli + repertoire.repeatability.valueMilli) / 2,
      );
      const batterQuality = (
        pitch.throwingSide === 'R' ? batter.batting.contactVsRight : batter.batting.contactVsLeft
      ).valueMilli;
      // 完了打席だけを1単位とし、投球途中・途中交代の打席は重複して数えない。
      if (event.outcome !== null) {
        const side = pitch.throwingSide === 'R' ? 'Right' : 'Left';
        add(
          pitch.batterId,
          'batting',
          gameId,
          [
            commonTrainingRef(
              side === 'Right' ? 'batting.contactVsRight' : 'batting.contactVsLeft',
            ),
            commonTrainingRef(side === 'Right' ? 'batting.powerVsRight' : 'batting.powerVsLeft'),
            commonTrainingRef('batting.plateDiscipline'),
          ],
          pitcherQuality,
        );
      }
      add(
        pitch.pitcherId,
        'pitching',
        gameId,
        [
          { scope: 'pitch', pitchId: pitch.pitchId, code: 'control' },
          { scope: 'pitch', pitchId: pitch.pitchId, code: 'repeatability' },
        ],
        batterQuality,
      );
      ensure(event.defensiveAlignment?.length === 9, '実際の守備配置がありません');
      for (const defender of event.defensiveAlignment)
        add(
          defender.playerId,
          'fielding',
          gameId,
          [{ scope: 'position', positionCode: defender.position, code: 'familiarity' }],
          batterQuality,
        );
    }
  }
  return [...rows.values()]
    .sort(
      (a, b) =>
        (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0) ||
        EXPERIENCE_DOMAINS.indexOf(a.domain) - EXPERIENCE_DOMAINS.indexOf(b.domain),
    )
    .map((row) => ({
      playerId: row.playerId,
      domain: row.domain,
      units: row.units,
      opponentQualityMilli: Math.round(row.qualitySum / row.units),
      sources: [...row.sources].map(([gameId, units]) => ({ gameId, units })),
      // JSONオブジェクトの項目順に依存させない。能力参照の正規形で固定する。
      targets: [...row.targets]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([, target]) => target),
    }));
}

export function experienceOpportunity(c: ExperienceConfig, ambition: number) {
  return Math.min(
    100000,
    Math.round(c.opportunity.baseMilli + (c.opportunity.ambitionMilli * ambition) / 120000),
  );
}
export function effectiveExperienceUnitsMilli(
  c: ExperienceConfig,
  domain: ExperienceDomain,
  units: number,
) {
  const cap = c.domains[domain].saturationUnits;
  return Math.floor((1000 * cap * units) / (cap + units));
}
export function experienceOpponentFactor(c: ExperienceConfig, quality: number) {
  const { centerMilli, spanPermille } = c.opponent;
  return (
    1000 +
    Math.max(
      -spanPermille,
      Math.min(spanPermille, Math.round(((quality - centerMilli) * spanPermille) / centerMilli)),
    )
  );
}
export function experienceBudget(
  c: ExperienceConfig,
  domain: ExperienceDomain,
  talent: number,
  units: number,
  factor: number,
) {
  const d = c.domains[domain];
  return Math.round(
    ((((d.basePerUnitMilli + (d.talentPerUnitMilli * talent) / 120000) *
      effectiveExperienceUnitsMilli(c, domain, units)) /
      1000) *
      factor) /
      1000,
  );
}

/** 通常練習→実戦経験→既存の日次回復。出場済みの負荷を二重に加えない。 */
export function calculateDevelopmentDay(
  world: DevelopmentWorld,
  override?: import('./camp-types.ts').CampTrainingOverride,
) {
  const { players, day: trainingDay, physical } = calculateTrainingDay(world, override);
  const config = world.definitions.experienceConfig!;
  const experienceRng = { ...world.growth.state.experienceRng };
  const day: DevelopmentDay = { ...trainingDay, experience: [] };
  if (config.enabled)
    for (const activity of experienceActivities(world)) {
      const { playerId, domain } = activity;
      const traits = playerDevelopment(world.definitions, playerId)!.growthProfile;
      const random = nextRandom(experienceRng[playerId]!);
      experienceRng[playerId] = random.state;
      const chance = experienceOpportunity(config, traits.ambitionMilli);
      const occurred = random.value * 100000 < chance;
      const factor = experienceOpponentFactor(config, activity.opponentQualityMilli);
      const budget = occurred
        ? experienceBudget(config, domain, traits.talentMilli, activity.units, factor)
        : 0;
      const values = players[playerId]!.values;
      const basis = new Map(activeGrowthBasis(world, playerId).map((a) => [a.key, a]));
      let applied = 0,
        allocated = 0,
        cumulative = 0;
      const targetUnits = activity.targets.reduce((sum, target) => sum + target.units, 0);
      for (const target of activity.targets) {
        cumulative += target.units;
        const boundary = Math.floor((budget * cumulative) / targetUnits);
        const amount = boundary - allocated;
        allocated = boundary;
        const key = growthAbilityKey(target.abilityRef);
        const ability = basis.get(key);
        ensure(ability, '実出場に対応する成長能力がありません');
        const before = values[key]!;
        const after = Math.min(ability.ceilingMilli, before + amount);
        if (after === before) continue;
        values[key] = after;
        applied += after - before;
        const order = day.changes.length + 1;
        day.changes.push({
          changeId: `experience-${world.currentDate}-${playerId}-${domain}-${order}`,
          playerId,
          effectiveOn: world.currentDate,
          eventOrder: order,
          abilityRef: structuredClone(target.abilityRef),
          unitCode: 'ratingMilli',
          changeKind: 'value',
          beforeValue: before,
          afterValue: after,
          reason: 'experience',
          sourceEventId: `experience-day-${world.currentDate}-${playerId}-${domain}`,
          abilityCatalogVersion: 'common-abilities-v1',
        });
      }
      const outcome: ExperienceOutcome = {
        ...activity,
        effectiveUnitsMilli: effectiveExperienceUnitsMilli(config, domain, activity.units),
        opponentFactorPermille: factor,
        opportunityMilli: chance,
        opportunityOccurred: occurred,
        budgetMilli: budget,
        appliedMilli: applied,
      };
      day.experience.push(outcome);
    }
  // 通常練習と経験を合算後、各能力の表示端点から日別整数差を一度だけ作る。
  for (const playerId of Object.keys(players))
    day.displayDeltas[playerId] = activeGrowthBasis(world, playerId).reduce(
      (sum, a) =>
        sum +
        Math.floor(players[playerId]!.values[a.key]! / 1000) -
        Math.floor(world.growth.state.players[playerId]!.values[a.key]! / 1000),
      0,
    );
  return { players, day, physical, experienceRng };
}
/** 旧v17の保存形と計算を維持し、年齢変化を後付けしない。 */
export function applyDevelopmentDay(
  world: Extract<WorldRecord, { version: 'world-prototype-v17' }>,
) {
  const { players, day, physical, experienceRng } = calculateDevelopmentDay(world);
  const growth: DevelopmentGrowthState = {
    ...world.growth,
    state: {
      players,
      experienceRng,
      lastCompletedOn: world.currentDate,
      days: { ...world.growth.state.days, [world.currentDate]: freezeGrowthData(day) },
    },
  };
  return { growth, physical };
}
