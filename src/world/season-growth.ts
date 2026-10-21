import { growthAbilityKey, growthBasis } from './growth-basis.ts';
import { growthComparison } from './growth-view.ts';
import { playerProfile } from './player-profiles.ts';
import type { WorldRecord, SeasonSummary } from './types.ts';
import type { TrainingAbilityRef } from './training-types.ts';

export interface SeasonGrowthChange {
  abilityRef: TrainingAbilityRef;
  label: string;
  beforeValue: number;
  afterValue: number;
  delta: number;
}

export interface SeasonGrowthRow {
  playerId: string;
  clubId: string;
  name: string;
  position: string | null;
  role: 'pitcher' | 'fielder';
  increase: number;
  decrease: number;
  net: number;
  changes: SeasonGrowthChange[];
}

/** 保存モデルではなく、保存済みの基準値と日別履歴から導出する表示用の要約。 */
export interface SeasonGrowthReport {
  from: string;
  through: string;
  completedTrainingDays: number;
  rows: SeasonGrowthRow[];
}

export function seasonGrowthReport(
  world: WorldRecord,
  scope: SeasonSummary['statScope'],
): SeasonGrowthReport | null {
  if (!('growth' in world)) return null;
  const summary = scope === 'farmRegular' ? world.farmSummary : world.seasonSummary;
  if (!summary) return null;
  const state = world.growth.state;
  const through = summary.completedOn;
  const dates = Object.keys(state.days).sort();
  // 二軍の終了後も一軍で育成が続く場合、その後の変化を巻き戻して比較する。
  const endValues = Object.fromEntries(
    Object.entries(state.players).map(([id, player]) => [id, { ...player.values }]),
  );
  for (const date of dates.filter((date) => date > through).reverse())
    for (const change of [...state.days[date]!.changes].reverse())
      endValues[change.playerId]![growthAbilityKey(change.abilityRef)] = change.beforeValue;
  return {
    from: world.definitions.startDate,
    through,
    completedTrainingDays: dates.filter((date) => date <= through).length,
    // 一軍・二軍で共有する所属名簿を一度だけ列挙する。控え・未出場も除外しない。
    rows: world.definitions.squads.flatMap((squad) =>
      squad.players.map((player) => {
        const playerId = player.playerId;
        const initial = Object.fromEntries(
          growthBasis(world.definitions, playerId).map((row) => [row.key, row.valueMilli]),
        );
        const comparison = growthComparison(
          world.definitions,
          playerId,
          initial,
          endValues[playerId]!,
        );
        const profile = playerProfile(world.definitions, playerId);
        return {
          playerId,
          clubId: squad.team.clubId,
          name: profile?.displayName ?? `${player.familyName} ${player.givenName}`,
          position: profile?.primaryPosition ?? null,
          role: squad.pitches.some((pitch) => pitch.playerId === playerId)
            ? ('pitcher' as const)
            : ('fielder' as const),
          increase: comparison.increase,
          decrease: comparison.decrease,
          net: comparison.net,
          changes: comparison.rows
            .filter((row) => row.beforeValue !== row.afterValue)
            .map(({ abilityRef, label, beforeValue, afterValue, delta }) => ({
              abilityRef: structuredClone(abilityRef),
              label,
              beforeValue,
              afterValue,
              delta,
            })),
        };
      }),
    ),
  };
}
