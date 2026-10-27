import type { CommonAbilityCode, FieldPosition } from '../players/abilities.ts';

/** データ設計5.10の参照。球種固有のIDと守備位置を共通能力から分ける。 */
export type CommonAbilityRef = {
  [K in CommonAbilityCode]: K extends `${infer S}.${infer C}` ? { scope: S; code: C } : never;
}[CommonAbilityCode];
export type TrainingAbilityRef =
  | CommonAbilityRef
  | { scope: 'pitch'; pitchId: string; code: 'control' | 'repeatability' }
  | { scope: 'position'; positionCode: FieldPosition; code: 'familiarity' };
export type TrainingTarget =
  | { kind: 'pitchAcquisition'; pitchId: string }
  | { kind: 'ability'; abilityRef: TrainingAbilityRef }
  | { kind: 'group'; groupId: string };
export interface TrainingSettings {
  target: TrainingTarget;
  intensity: 'light' | 'normal' | 'hard' | 'rest';
  autoAdjustForFatigue: boolean;
}
export interface TrainingTargetCatalog {
  version: 'training-targets-v1';
  groups: { groupId: string; label: string; members: CommonAbilityCode[] }[];
}
export interface TrainingPlanInputs {
  version: 'training-plans-input-v1';
  catalog: TrainingTargetCatalog;
  players: { playerId: string; settings: TrainingSettings }[];
}
export interface TrainingPlan extends TrainingSettings {
  playerId: string;
  planKind: 'normal';
  effectiveFrom: string;
  effectiveUntil: null;
}
/** 通常練習の指定だけ。未実装の成長・キャンプ状態を空のモデルで補わない。 */
export interface TrainingPlanControl {
  version: 'training-plans-v1';
  revision: number;
  plans: Record<string, TrainingPlan>;
}
export interface TrainingPlansAction {
  kind: 'setTrainingPlans';
  squadId: string;
  updates: { playerId: string; settings: TrainingSettings }[];
}
export type TrainingDraft = Record<string, TrainingSettings>;
