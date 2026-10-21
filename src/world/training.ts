import { ensure, id, integer } from '../engine/validation.ts';
import { COMMON_ABILITIES, FIELD_POSITIONS, type CommonAbilityCode } from '../players/abilities.ts';
import { playerBaseAbilities, playerDevelopment } from './player-development.ts';
import { canonicalJson } from '../storage/codec.ts';
import { PITCH_TYPES } from '../data/pitch-types/index.ts';
import type { WorldDefinitions, WorldRecord } from './types.ts';
import type {
  CommonAbilityRef,
  TrainingAbilityRef,
  TrainingSettings,
  TrainingTarget,
  TrainingPlanControl,
  TrainingPlansAction,
  TrainingDraft,
} from './training-types.ts';

function fields(value: unknown, keys: readonly string[], name: string): void {
  ensure(value !== null && typeof value === 'object' && !Array.isArray(value), name + 'が不正です');
  const actual = Object.keys(value);
  ensure(
    actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key)),
    name + 'の項目が不足または余分です',
  );
}
export function commonTrainingRef(code: CommonAbilityCode): CommonAbilityRef {
  const [scope, name] = code.split('.');
  return { scope, code: name } as CommonAbilityRef;
}
function validateRef(
  definitions: WorldDefinitions,
  playerId: string,
  value: TrainingAbilityRef,
): void {
  ensure(value !== null && typeof value === 'object', '練習対象の参照が不正です');
  if (value.scope === 'pitch') {
    fields(value, ['scope', 'pitchId', 'code'], '持ち球の練習対象');
    ensure(['control', 'repeatability'].includes(value.code), '未対応の持ち球能力です');
    ensure(
      definitions.squads.some((s) =>
        s.pitches.some((p) => p.pitchId === value.pitchId && p.playerId === playerId),
      ),
      '本人の持ち球を指定してください',
    );
  } else if (value.scope === 'position') {
    fields(value, ['scope', 'positionCode', 'code'], '守備習熟の練習対象');
    ensure(
      value.code === 'familiarity' &&
        (FIELD_POSITIONS as readonly string[]).includes(value.positionCode),
      '練習対象の守備位置が不正です',
    );
  } else {
    fields(value, ['scope', 'code'], '共通能力の練習対象');
    ensure(Object.hasOwn(COMMON_ABILITIES, value.scope + '.' + value.code), '未対応の共通能力です');
  }
}
export function validateTrainingSettings(
  definitions: WorldDefinitions,
  playerId: string,
  value: unknown,
): asserts value is TrainingSettings {
  fields(value, ['target', 'intensity', 'autoAdjustForFatigue'], '練習設定');
  const settings = value as TrainingSettings;
  ensure(['light', 'normal', 'hard', 'rest'].includes(settings.intensity), '練習強度が不正です');
  ensure(typeof settings.autoAdjustForFatigue === 'boolean', '疲労による自動調整の設定が不正です');
  const target = settings.target;
  ensure(target !== null && typeof target === 'object', '練習対象が不正です');
  if (target.kind === 'group') {
    fields(target, ['kind', 'groupId'], '能力群の指定');
    ensure(
      definitions.trainingPlans?.catalog.groups.some((g) => g.groupId === target.groupId),
      '保存内の練習対象群を指定してください',
    );
  } else {
    fields(target, ['kind', 'abilityRef'], '個別練習の指定');
    ensure(target.kind === 'ability', '未対応の練習対象です');
    validateRef(definitions, playerId, target.abilityRef);
  }
}
export function validateTrainingDefinitions(definitions: WorldDefinitions): void {
  if (definitions.version !== 'world-definitions-v20') {
    ensure(definitions.trainingPlans === undefined, '旧定義へ練習設定を後付けできません');
    return;
  }
  const input = definitions.trainingPlans;
  fields(input, ['version', 'catalog', 'players'], '練習初期設定');
  ensure(input!.version === 'training-plans-input-v1', '未対応の練習初期設定です');
  fields(input!.catalog, ['version', 'groups'], '練習対象辞書');
  ensure(input!.catalog.version === 'training-targets-v1', '未対応の練習対象辞書です');
  const groups = input!.catalog.groups;
  ensure(Array.isArray(groups), '練習対象群が不正です');
  integer(groups.length, 1, 64, '練習対象群数');
  const groupIds = new Set<string>();
  for (const group of groups) {
    fields(group, ['groupId', 'label', 'members'], '練習対象群');
    id(group.groupId);
    ensure(
      !Object.hasOwn(Object.prototype, group.groupId) && !groupIds.has(group.groupId),
      '練習対象群のIDが重複または不正です',
    );
    groupIds.add(group.groupId);
    ensure(
      typeof group.label === 'string' && group.label.trim().length > 0 && group.label.length <= 120,
      '練習対象群の名称が不正です',
    );
    ensure(
      Array.isArray(group.members) &&
        group.members.length > 0 &&
        group.members.length <= 22 &&
        new Set(group.members).size === group.members.length &&
        group.members.every((code) => Object.hasOwn(COMMON_ABILITIES, code)),
      '練習対象群の能力に不足・重複・未対応があります',
    );
  }
  const ids = definitions.squads.flatMap((s) => s.players.map((p) => p.playerId));
  ensure(
    Array.isArray(input!.players) && input!.players.length === ids.length,
    '全選手の初期練習設定が必要です',
  );
  const seen = new Set<string>();
  for (const row of input!.players) {
    fields(row, ['playerId', 'settings'], '選手の初期練習設定');
    ensure(
      ids.includes(row.playerId) && !seen.has(row.playerId),
      '初期練習設定の選手IDが不正または重複しています',
    );
    seen.add(row.playerId);
    validateTrainingSettings(definitions, row.playerId, row.settings);
  }
}
export function initialTrainingPlans(definitions: WorldDefinitions): TrainingPlanControl {
  validateTrainingDefinitions(definitions);
  ensure(definitions.trainingPlans, '通常練習の初期設定がありません');
  return {
    version: 'training-plans-v1',
    revision: 0,
    plans: Object.fromEntries(
      definitions.trainingPlans.players.map((row) => [
        row.playerId,
        {
          ...structuredClone(row.settings),
          playerId: row.playerId,
          planKind: 'normal',
          effectiveFrom: definitions.startDate,
          effectiveUntil: null,
        },
      ]),
    ),
  };
}

/** 全対象を検査してから複製する。一人でも不正なら一括変更を反映しない。 */
export function applyTrainingPlans(
  world: WorldRecord,
  action: TrainingPlansAction,
): TrainingPlanControl {
  ensure(
    world.version !== 'world-prototype-v1' && world.management.version === 'club-management-v2',
    '練習設定は対応する新規プレイで利用できます',
  );
  fields(action, ['kind', 'squadId', 'updates'], '練習変更');
  const squad = world.definitions.squads.find((s) => s.squadId === action.squadId);
  ensure(
    squad && action.squadId === world.management.controlledSquadId,
    '担当球団の選手だけ変更できます',
  );
  ensure(Array.isArray(action.updates), '一括練習変更が不正です');
  integer(action.updates.length, 1, squad.players.length, '練習変更の選手数');
  const ids = new Set<string>();
  for (const row of action.updates) {
    fields(row, ['playerId', 'settings'], '選手の練習変更');
    ensure(
      squad.players.some((p) => p.playerId === row.playerId) && !ids.has(row.playerId),
      '練習変更の選手が他球団または重複しています',
    );
    ids.add(row.playerId);
    validateTrainingSettings(world.definitions, row.playerId, row.settings);
  }
  const control = structuredClone(world.management.training);
  for (const row of action.updates) {
    const previous = control.plans[row.playerId]!;
    if (canonicalJson(trainingSettings(previous)) === canonicalJson(row.settings)) continue;
    control.plans[row.playerId] = {
      ...structuredClone(row.settings),
      playerId: row.playerId,
      planKind: 'normal',
      effectiveFrom: world.currentDate,
      effectiveUntil: null,
    };
  }
  control.revision++;
  return control;
}
export function trainingSettings(plan: TrainingSettings): TrainingSettings {
  return structuredClone({
    target: plan.target,
    intensity: plan.intensity,
    autoAdjustForFatigue: plan.autoAdjustForFatigue,
  });
}
export function trainingView(world: WorldRecord) {
  if (world.version === 'world-prototype-v1' || world.management.version !== 'club-management-v2')
    return null;
  const training = world.management.training;
  const squadId = world.management.controlledSquadId;
  const ids = world.definitions.squads
    .find((s) => s.squadId === squadId)!
    .players.map((p) => p.playerId);
  return structuredClone({
    squadId,
    revision: training.revision,
    plans: Object.fromEntries(ids.map((id) => [id, training.plans[id]!])),
  });
}
export function createTrainingDraft(plans: Record<string, TrainingSettings>): TrainingDraft {
  return Object.fromEntries(
    Object.entries(plans).map(([id, plan]) => [id, trainingSettings(plan)]),
  );
}
export function trainingChanges(before: TrainingDraft, after: TrainingDraft) {
  ensure(
    Object.keys(before).length === Object.keys(after).length &&
      Object.keys(before).every((id) => Object.hasOwn(after, id)),
    '練習の編集対象が変わりました',
  );
  return Object.keys(before)
    .filter((id) => canonicalJson(before[id]) !== canonicalJson(after[id]))
    .map((playerId) => ({ playerId, settings: structuredClone(after[playerId]!) }));
}

/** 表示専用の展開。選択を変えても状態・乱数・能力を更新しない。 */
export function trainingTargetAbilities(
  definitions: WorldDefinitions,
  playerId: string,
  target: TrainingTarget,
) {
  validateTrainingSettings(definitions, playerId, {
    target,
    intensity: 'normal',
    autoAdjustForFatigue: false,
  });
  const refs: TrainingAbilityRef[] =
    target.kind === 'group'
      ? definitions
          .trainingPlans!.catalog.groups.find((g) => g.groupId === target.groupId)!
          .members.map(commonTrainingRef)
      : [target.abilityRef];
  const abilities = playerBaseAbilities(definitions, playerId)!;
  return refs.map((abilityRef) => {
    if (abilityRef.scope === 'pitch') {
      const pitch = definitions.squads
        .flatMap((s) => s.pitches)
        .find((p) => p.pitchId === abilityRef.pitchId)!;
      return {
        abilityRef,
        label: `${PITCH_TYPES[pitch.pitchTypeCode].name}・${abilityRef.code === 'control' ? '制球' : '再現性'}`,
        ...pitch[abilityRef.code],
      };
    }
    if (abilityRef.scope === 'position')
      return {
        abilityRef,
        label: abilityRef.positionCode + 'の守備習熟',
        ...playerDevelopment(definitions, playerId)!.positionSkills[abilityRef.positionCode]
          .familiarity,
      };
    const code = (abilityRef.scope + '.' + abilityRef.code) as CommonAbilityCode;
    return { abilityRef, label: COMMON_ABILITIES[code], ...abilities[code] };
  });
}
export function trainingTargetOptions(definitions: WorldDefinitions, playerId: string) {
  const options: { key: string; label: string; target: TrainingTarget }[] = [];
  const add = (label: string, target: TrainingTarget) =>
    options.push({ key: canonicalJson(target), label, target });
  for (const group of definitions.trainingPlans!.catalog.groups)
    add(group.label, { kind: 'group', groupId: group.groupId });
  for (const [code, label] of Object.entries(COMMON_ABILITIES))
    add(label, { kind: 'ability', abilityRef: commonTrainingRef(code as CommonAbilityCode) });
  for (const positionCode of FIELD_POSITIONS)
    add(positionCode + 'の守備習熟', {
      kind: 'ability',
      abilityRef: { scope: 'position', positionCode, code: 'familiarity' },
    });
  for (const pitch of definitions.squads
    .flatMap((s) => s.pitches)
    .filter((p) => p.playerId === playerId)) {
    for (const code of ['control', 'repeatability'] as const)
      add(
        `${PITCH_TYPES[pitch.pitchTypeCode].name}・${code === 'control' ? '制球' : '再現性'}（${(pitch.velocity.typicalCentiKph / 100).toFixed(1)}km/h）`,
        { kind: 'ability', abilityRef: { scope: 'pitch', pitchId: pitch.pitchId, code } },
      );
  }
  return options;
}
export function trainingTargetLabel(
  definitions: WorldDefinitions,
  playerId: string,
  target: TrainingTarget,
): string {
  return trainingTargetOptions(definitions, playerId).find(
    (option) => option.key === canonicalJson(target),
  )!.label;
}
