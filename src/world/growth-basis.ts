import { COMMON_ABILITIES, FIELD_POSITIONS, type CommonAbilityCode } from '../players/abilities.ts';
import { playerBaseAbilities, playerDevelopment } from './player-development.ts';
import { commonTrainingRef } from './training.ts';
import { canonicalJson } from '../storage/codec.ts';
import { PITCH_TYPES } from '../data/pitch-types/index.ts';
import type { WorldDefinitions, WorldRecord } from './types.ts';
import type { TrainingAbilityRef } from './training-types.ts';
import type { GrowthAbility } from './growth-types.ts';

export const growthAbilityKey = (ref: TrainingAbilityRef) => canonicalJson(ref);
const frozenBasis = new WeakMap<WorldDefinitions, Map<string, readonly GrowthAbility[]>>();

/** 初期値・上限・意味の辞書。現在値はgrowth側だけを更新し、定義は不変。 */
export function growthBasis(
  definitions: WorldDefinitions,
  playerId: string,
): readonly GrowthAbility[] {
  const cached = frozenBasis.get(definitions)?.get(playerId);
  if (cached) return cached;
  const common = playerBaseAbilities(definitions, playerId);
  const development = playerDevelopment(definitions, playerId);
  if (!common || !development) throw new Error('成長対象の基本能力がありません');
  const rows: GrowthAbility[] = [];
  const add = (
    abilityRef: TrainingAbilityRef,
    label: string,
    valueMilli: number,
    ceilingMilli: number,
  ) =>
    rows.push({ key: growthAbilityKey(abilityRef), abilityRef, label, valueMilli, ceilingMilli });
  // 保存のJSON項目順ではなく、版付き能力辞書の順に抽選母集団を固定する。
  for (const code of Object.keys(COMMON_ABILITIES) as CommonAbilityCode[]) {
    const ability = common[code];
    add(commonTrainingRef(code), COMMON_ABILITIES[code], ability.valueMilli, ability.ceilingMilli);
  }
  for (const positionCode of FIELD_POSITIONS) {
    const ability = development.positionSkills[positionCode].familiarity;
    add(
      { scope: 'position', positionCode, code: 'familiarity' },
      positionCode + 'の守備習熟',
      ability.valueMilli,
      ability.ceilingMilli,
    );
  }
  for (const pitch of definitions.squads
    .flatMap((s) => s.pitches)
    .filter((p) => p.playerId === playerId))
    for (const code of ['control', 'repeatability'] as const)
      add(
        { scope: 'pitch', pitchId: pitch.pitchId, code },
        `${definitions.pitchProfiles?.profiles.find((p) => p.code === pitch.pitchTypeCode)?.name ?? PITCH_TYPES[pitch.pitchTypeCode]?.name ?? pitch.pitchTypeCode}・${code === 'control' ? '制球' : '再現性'}`,
        pitch[code].valueMilli,
        pitch[code].ceilingMilli,
      );
  for (const row of rows) {
    Object.freeze(row.abilityRef);
    Object.freeze(row);
  }
  Object.freeze(rows);
  // 編集可能な入力や改変候補をキャッシュしない。新規v16の定義は深く凍結する。
  if (Object.isFrozen(definitions)) {
    const byPlayer = frozenBasis.get(definitions) ?? new Map();
    byPlayer.set(playerId, rows);
    frozenBasis.set(definitions, byPlayer);
  }
  return rows;
}

export function currentCommonAbilities(
  world: Pick<WorldRecord, 'definitions'> & { growth?: import('./growth-types.ts').GrowthState },
  playerId: string,
) {
  const abilities = playerBaseAbilities(world.definitions, playerId);
  if (!abilities || !world.growth) return abilities;
  const values = world.growth.state.players[playerId]!.values;
  for (const [code, ability] of Object.entries(abilities))
    ability.valueMilli = values[growthAbilityKey(commonTrainingRef(code as CommonAbilityCode))]!;
  return abilities;
}

/** 新球種が使用可能になる翌日から、既存の能力成長へ含める。 */
export function activeGrowthBasis(world: WorldRecord, playerId: string) {
  const basis = growthBasis(world.definitions, playerId);
  if (world.version !== 'world-prototype-v21') return basis;
  return basis.filter(
    (a) =>
      a.abilityRef.scope !== 'pitch' ||
      (world.growth.state.acquisition[a.abilityRef.pitchId]?.progressMilli ?? 100000) === 100000,
  );
}
