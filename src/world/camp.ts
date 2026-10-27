import { ensure, id, integer } from '../engine/validation.ts';
import { nextRandom } from '../engine/rng.ts';
import { fnv1a32 } from './identity.ts';
import { initialRookieDevelopment, calculateRookieDevelopmentDay } from './awakening.ts';
import { freezeGrowthData } from './growth.ts';
import { activeGrowthBasis, growthAbilityKey } from './growth-basis.ts';
import { playerDevelopment } from './player-development.ts';
import { validateTrainingSettings, trainingSettings, trainingTargetAbilities } from './training.ts';
import type { WorldDefinitions, WorldRecord } from './types.ts';
import type {
  CampConfig,
  CampPlanControl,
  CampPlansAction,
  CampDevelopmentGrowthState,
  CampDevelopmentDay,
  CampTrainingOverride,
} from './camp-types.ts';

type CampWorld = Extract<WorldRecord, { version: 'world-prototype-v20' | 'world-prototype-v21' }>;
// IDにハイフンが含まれても、期間と選手の境界を一意にする。
const campPlayerKey = (campId: string, playerId: string) =>
  `${campId.length}-${campId}-${playerId}`;
function fields(value: unknown, keys: string[], label: string) {
  ensure(value && typeof value === 'object' && !Array.isArray(value), label + 'が不正です');
  ensure(
    Object.keys(value).length === keys.length && keys.every((k) => Object.hasOwn(value, k)),
    label + 'の項目が不正です',
  );
}
export function validateCampDefinitions(d: WorldDefinitions) {
  if (!['world-definitions-v25', 'world-definitions-v26'].includes(d.version)) {
    ensure(
      d.campConfig === undefined && d.campInputs === undefined,
      '旧定義へキャンプを後付けできません',
    );
    return;
  }
  const c = d.campConfig!;
  fields(c, ['version', 'enabled', 'focusAmountPermille', 'burst'], 'キャンプ設定');
  ensure(
    c.version === 'camp-training-v1' && typeof c.enabled === 'boolean',
    '未対応のキャンプモデルです',
  );
  integer(c.focusAmountPermille, 1000, 3000, 'キャンプ指定対象の量倍率');
  fields(c.burst, ['basePpm', 'ambitionPpm', 'baseMilli', 'talentMilli'], 'キャンプ爆発');
  integer(c.burst.basePpm, 0, 1000000, 'キャンプ爆発の基礎機会');
  integer(c.burst.ambitionPpm, 0, 1000000, 'キャンプ爆発の向上心係数');
  integer(c.burst.baseMilli, 1, 24000, 'キャンプ爆発の基礎量');
  integer(c.burst.talentMilli, 0, 24000, 'キャンプ爆発の才能係数');
  fields(d.campInputs, ['version', 'periods'], 'キャンプ入力');
  ensure(d.campInputs!.version === 'camp-inputs-v1', '未対応のキャンプ入力です');
  const periods = d.campInputs!.periods;
  ensure(Array.isArray(periods), 'キャンプ期間が不正です');
  integer(periods.length, 1, 8, 'キャンプ回数');
  const seen = new Set<string>();
  const ids = d.squads.flatMap((s) => s.players.map((p) => p.playerId));
  for (const p of periods) {
    fields(p, ['campId', 'label', 'from', 'through', 'players'], 'キャンプ期間');
    id(p.campId);
    ensure(
      !seen.has(p.campId) && !Object.hasOwn(Object.prototype, p.campId),
      'キャンプIDが不正または重複しています',
    );
    seen.add(p.campId);
    ensure(
      typeof p.label === 'string' && p.label.trim().length > 0 && p.label.length <= 120,
      'キャンプ名が不正です',
    );
    for (const date of [p.from, p.through]) {
      ensure(
        typeof date === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(date) &&
          Number.isFinite(Date.parse(date + 'T00:00:00Z')) &&
          new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date,
        'キャンプ日付が不正です',
      );
      ensure(
        date >= d.startDate && date <= d.endDate,
        'キャンプは保存内の日程範囲で指定してください',
      );
    }
    ensure(p.from <= p.through, 'キャンプ期間が逆順です');
    const players = new Set<string>();
    ensure(
      Array.isArray(p.players) && p.players.length === ids.length,
      '全選手のキャンプ設定が必要です',
    );
    for (const row of p.players) {
      fields(row, ['playerId', 'settings'], 'キャンプの初期指定');
      ensure(
        ids.includes(row.playerId) && !players.has(row.playerId),
        'キャンプ選手IDが不正または重複しています',
      );
      players.add(row.playerId);
      validateTrainingSettings(d, row.playerId, row.settings);
    }
  }
  const sorted = [...periods].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  for (let n = 1; n < sorted.length; n++)
    ensure(sorted[n - 1]!.through < sorted[n]!.from, 'キャンプ期間を重ねることはできません');
}
export function initialCampPlans(d: WorldDefinitions): CampPlanControl {
  validateCampDefinitions(d);
  ensure(
    ['world-definitions-v25', 'world-definitions-v26'].includes(d.version),
    'キャンプに対応する定義が必要です',
  );
  return {
    version: 'camp-plans-v1',
    revision: 0,
    plans: Object.fromEntries(
      d.campInputs!.periods.map((p) => [
        p.campId,
        Object.fromEntries(
          p.players.map((row) => [
            row.playerId,
            {
              ...structuredClone(row.settings),
              playerId: row.playerId,
              planKind: 'camp' as const,
              effectiveFrom: p.from,
              effectiveUntil: p.through,
            },
          ]),
        ),
      ]),
    ),
  };
}
export function initialCampDevelopment(
  d: WorldDefinitions,
  seed: number,
): CampDevelopmentGrowthState {
  const base = initialRookieDevelopment(d, seed);
  return {
    modelId: 'daily-development',
    version: 'daily-development-v5',
    schemaId: 'daily-development-state-v5',
    state: {
      ...base.state,
      days: {},
      campBursts: Object.fromEntries(
        d.campInputs!.periods.map((p) => [
          p.campId,
          Object.fromEntries(
            d.squads
              .flatMap((s) => s.players)
              .map((player) => [
                player.playerId,
                {
                  rng: {
                    streamId: 'camp-' + campPlayerKey(p.campId, player.playerId),
                    algorithmVersion: 'xorshift32-v1' as const,
                    fullState: {
                      word:
                        fnv1a32(
                          'camp-training-v1:' + seed + ':' + p.campId + ':' + player.playerId,
                        ) || 1,
                    },
                    drawCount: 0,
                  },
                  checkedOn: null,
                  appliedEventId: null,
                },
              ]),
          ),
        ]),
      ),
    },
  };
}
export function activeCamp(world: CampWorld) {
  return world.definitions.campConfig!.enabled
    ? (world.definitions.campInputs!.periods.find(
        (p) => p.from <= world.currentDate && world.currentDate <= p.through,
      ) ?? null)
    : null;
}
export function applyCampPlans(world: WorldRecord, action: CampPlansAction): CampWorld {
  ensure(
    world.version === 'world-prototype-v20' || world.version === 'world-prototype-v21',
    'キャンプ設定は対応する新規プレイで利用できます',
  );
  fields(action, ['kind', 'campId', 'squadId', 'updates'], 'キャンプ変更');
  const period = world.definitions.campInputs!.periods.find((p) => p.campId === action.campId);
  ensure(
    period && world.currentDate <= period.through,
    '終了したキャンプや不明な期間は変更できません',
  );
  const squad = world.definitions.squads.find((s) => s.squadId === action.squadId);
  ensure(
    squad && action.squadId === world.management.controlledSquadId,
    '担当球団だけ変更できます',
  );
  ensure(Array.isArray(action.updates), 'キャンプ一括指定が不正です');
  integer(action.updates.length, 1, squad.players.length, 'キャンプ変更人数');
  const seen = new Set<string>();
  for (const row of action.updates) {
    fields(row, ['playerId', 'settings'], 'キャンプ選手指定');
    ensure(
      squad.players.some((p) => p.playerId === row.playerId) && !seen.has(row.playerId),
      'キャンプ変更の選手が他球団または重複しています',
    );
    seen.add(row.playerId);
    validateTrainingSettings(world.definitions, row.playerId, row.settings);
    if (
      world.version === 'world-prototype-v21' &&
      row.settings.target.kind === 'ability' &&
      row.settings.target.abilityRef.scope === 'pitch'
    )
      ensure(
        (world.growth.state.acquisition[row.settings.target.abilityRef.pitchId]?.progressMilli ??
          100000) === 100000,
        '未習得球は球種習得の練習を指定してください',
      );
  }
  const camp = structuredClone(world.camp);
  for (const row of action.updates)
    camp.plans[action.campId]![row.playerId] = {
      ...camp.plans[action.campId]![row.playerId]!,
      ...trainingSettings(row.settings),
    };
  camp.revision++;
  return { ...world, camp };
}
export function campBurstChance(c: CampConfig, ambition: number) {
  return Math.min(1000000, Math.floor(c.burst.basePpm + (c.burst.ambitionPpm * ambition) / 120000));
}
export function campBurstBudget(c: CampConfig, talent: number) {
  return Math.round(c.burst.baseMilli + (c.burst.talentMilli * talent) / 120000);
}
/** 通常設定は保持。期間中だけ専用設定に置換し、指定分野へ補正する。 */
export function applyCampDevelopmentDay(world: CampWorld) {
  const period = activeCamp(world),
    c = world.definitions.campConfig!;
  const override: CampTrainingOverride | undefined = period
    ? {
        campId: period.campId,
        focusAmountPermille: c.focusAmountPermille,
        plans: world.camp.plans[period.campId]!,
      }
    : undefined;
  const base = calculateRookieDevelopmentDay(world, override);
  const day: CampDevelopmentDay = {
    ...base.day,
    camp: period ? { campId: period.campId, outcomes: [] } : null,
  };
  const campBursts = { ...world.growth.state.campBursts };
  if (period) {
    const states = { ...campBursts[period.campId]! };
    campBursts[period.campId] = states;
    for (const playerId of Object.keys(states).sort()) {
      const state = states[playerId]!,
        outcome = day.outcomes.find((o) => o.playerId === playerId)!;
      const record = {
        playerId,
        status: 'alreadyChecked' as 'alreadyChecked' | 'rest' | 'noRoom' | 'missed' | 'occurred',
        eventId: null as string | null,
        budgetMilli: 0,
        appliedMilli: 0,
      };
      day.camp!.outcomes.push(record);
      if (state.checkedOn !== null) continue;
      if (outcome.effectiveIntensity === 'rest') {
        record.status = 'rest';
        continue;
      }
      const values = base.players[playerId]!.values;
      const targets = trainingTargetAbilities(world.definitions, playerId, outcome.settings.target)
        .map((a) => ({ ...a, key: growthAbilityKey(a.abilityRef) }))
        .filter(
          (a) =>
            activeGrowthBasis(world, playerId).some((b) => b.key === a.key) &&
            values[a.key]! < a.ceilingMilli,
        );
      if (!targets.length) {
        record.status = 'noRoom';
        continue;
      }
      // 有効な練習と伸び代がある最初の日だけ、1人・1キャンプに1回。
      const draw = nextRandom(state.rng);
      states[playerId] = { ...state, rng: draw.state, checkedOn: world.currentDate };
      const traits = playerDevelopment(world.definitions, playerId)!.growthProfile;
      if (draw.value * 1000000 >= campBurstChance(c, traits.ambitionMilli)) {
        record.status = 'missed';
        continue;
      }
      record.status = 'occurred';
      record.eventId = 'camp-burst-' + campPlayerKey(period.campId, playerId);
      record.budgetMilli = campBurstBudget(c, traits.talentMilli);
      states[playerId]!.appliedEventId = record.eventId;
      const share = Math.floor(record.budgetMilli / targets.length),
        remainder = record.budgetMilli % targets.length;
      const start = world.completedDates.length % targets.length;
      targets.forEach((a, index) => {
        const before = values[a.key]!,
          after = Math.min(
            a.ceilingMilli,
            before +
              share +
              ((index - start + targets.length) % targets.length < remainder ? 1 : 0),
          );
        if (before === after) return;
        values[a.key] = after;
        record.appliedMilli += after - before;
        const order = day.changes.length + 1;
        day.changes.push({
          changeId: record.eventId + '-' + order,
          playerId,
          effectiveOn: world.currentDate,
          eventOrder: order,
          abilityRef: structuredClone(a.abilityRef),
          unitCode: 'ratingMilli',
          changeKind: 'value',
          beforeValue: before,
          afterValue: after,
          reason: 'campBurst',
          sourceEventId: record.eventId!,
          abilityCatalogVersion: 'common-abilities-v1',
        });
      });
    }
  }
  for (const playerId of Object.keys(base.players))
    day.displayDeltas[playerId] = activeGrowthBasis(world, playerId).reduce(
      (sum, a) =>
        sum +
        Math.floor(base.players[playerId]!.values[a.key]! / 1000) -
        Math.floor(world.growth.state.players[playerId]!.values[a.key]! / 1000),
      0,
    );
  const growth: CampDevelopmentGrowthState = {
    modelId: 'daily-development',
    version: 'daily-development-v5',
    schemaId: 'daily-development-state-v5',
    state: {
      players: base.players,
      experienceRng: base.experienceRng,
      agingRemainders: base.agingRemainders,
      awakeningState: base.awakeningState,
      campBursts,
      lastCompletedOn: world.currentDate,
      days: { ...world.growth.state.days, [world.currentDate]: freezeGrowthData(day) },
    },
  };
  return { growth, physical: base.physical };
}
export function campView(world: WorldRecord) {
  if (world.version !== 'world-prototype-v20' && world.version !== 'world-prototype-v21')
    return null;
  const squadId = world.management.controlledSquadId;
  const ids = world.definitions.squads
    .find((s) => s.squadId === squadId)!
    .players.map((p) => p.playerId);
  return structuredClone({
    squadId,
    revision: world.camp.revision,
    enabled: world.definitions.campConfig!.enabled,
    periods: world.definitions.campInputs!.periods.map((p) => ({
      campId: p.campId,
      label: p.label,
      from: p.from,
      through: p.through,
      plans: Object.fromEntries(ids.map((id) => [id, world.camp.plans[p.campId]![id]!])),
    })),
  });
}
