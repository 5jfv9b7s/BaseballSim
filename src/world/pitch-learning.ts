import { ensure, integer } from '../engine/validation.ts';
import { applyCampDevelopmentDay, initialCampDevelopment } from './camp.ts';
import { trainingBudget, freezeGrowthData } from './growth.ts';
import { playerDevelopment } from './player-development.ts';
import type { WorldDefinitions, WorldRecord } from './types.ts';
import type { PitchLearningGrowthState, PitchLearningDay } from './pitch-learning-types.ts';

type LearningWorld = Extract<WorldRecord, { version: 'world-prototype-v21' }>;
export function validatePitchLearningDefinitions(d: WorldDefinitions) {
  if (d.version !== 'world-definitions-v26') {
    ensure(d.pitchLearningConfig === undefined, '旧定義へ新球種習得を後付けできません');
    return;
  }
  const c = d.pitchLearningConfig;
  ensure(
    c &&
      Object.keys(c).sort().join('|') === 'enabled|progressPerBudgetPermille|version' &&
      c.version === 'pitch-learning-v1' &&
      typeof c.enabled === 'boolean',
    '球種習得モデルが不正です',
  );
  integer(c.progressPerBudgetPermille, 1, 100000, '習得進度への換算倍率');
  for (const squad of d.squads)
    for (const p of squad.pitches)
      ensure(
        p.acquisitionProgressMilli === 100000 || squad.team.pitcherIds.includes(p.playerId),
        '球種習得の対象は既存の登板対象投手です',
      );
}
export function initialPitchLearning(d: WorldDefinitions, seed: number): PitchLearningGrowthState {
  const base = initialCampDevelopment(d, seed);
  return {
    ...base,
    version: 'daily-development-v6',
    schemaId: 'daily-development-state-v6',
    state: {
      ...base.state,
      days: {},
      acquisition: Object.fromEntries(
        d.squads.flatMap((s) =>
          s.pitches
            .filter((p) => p.acquisitionProgressMilli < 100000)
            .map((p) => [
              p.pitchId,
              {
                progressMilli: p.acquisitionProgressMilli,
                acquiredOn: null,
              },
            ]),
        ),
      ),
    },
  };
}
/** 全試合終了後の一回。通常練習・キャンプの指定対象予算を習得進度へ振り替える。 */
export function applyPitchLearningDay(world: LearningWorld) {
  const base = applyCampDevelopmentDay(world);
  const source = base.growth.state.days[world.currentDate]!;
  const day: PitchLearningDay = { ...source, pitchLearning: [] };
  const acquisition = { ...world.growth.state.acquisition };
  const config = world.definitions.pitchLearningConfig!;
  for (const o of day.outcomes) {
    if (o.settings.target.kind !== 'pitchAcquisition') continue;
    const pitchId = o.settings.target.pitchId;
    const previous = acquisition[pitchId]!;
    // 指定外への基礎練習分を引く。キャンプ倍率適用後の予算も同じ配分を使う。
    const raw = o.opportunityOccurred
      ? trainingBudget(
          world.definitions.growthConfig!,
          playerDevelopment(world.definitions, o.playerId)!.growthProfile.talentMilli,
          o.effectiveIntensity,
        )
      : 0;
    const outside = Math.floor(
      (raw * world.definitions.growthConfig!.budget.backgroundPermille) / 1000,
    );
    const focus = o.budgetMilli - outside;
    const amount =
      config.enabled && previous.progressMilli < 100000
        ? Math.floor((focus * config.progressPerBudgetPermille) / 1000)
        : 0;
    const afterMilli = Math.min(100000, previous.progressMilli + amount);
    const acquiredOn = previous.acquiredOn ?? (afterMilli === 100000 ? world.currentDate : null);
    acquisition[pitchId] = { progressMilli: afterMilli, acquiredOn };
    day.pitchLearning.push({
      playerId: o.playerId,
      pitchId,
      beforeMilli: previous.progressMilli,
      afterMilli,
      acquiredOn,
    });
  }
  const growth: PitchLearningGrowthState = {
    ...base.growth,
    version: 'daily-development-v6',
    schemaId: 'daily-development-state-v6',
    state: {
      ...base.growth.state,
      acquisition,
      days: { ...world.growth.state.days, [world.currentDate]: freezeGrowthData(day) },
    },
  };
  return { growth, physical: base.physical };
}
