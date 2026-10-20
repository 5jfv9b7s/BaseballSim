import type { Ability } from '../engine/types.ts';
import type {
  AdditionalAbilityCode,
  CommonAbilityCode,
  FieldPosition,
} from '../players/abilities.ts';

/** 既存11能力を複製しない追加入力。成長の実行履歴とは別。 */
export interface PlayerDevelopmentInput {
  playerId: string;
  additionalAbilities: Record<AdditionalAbilityCode, Ability>;
  positionSkills: Record<FieldPosition, { aptitudeMilli: number; familiarity: Ability }>;
  pitchingAptitudes: { starterMilli: number; relieverMilli: number };
  growthProfile: { talentMilli: number; ambitionMilli: number };
}

export interface PlayerDevelopmentCatalog {
  version: 'player-development-v1';
  abilityCatalogVersion: 'common-abilities-v1';
  source: 'fictional-development-v1';
  players: PlayerDevelopmentInput[];
}

/** 読み取り時に既存11項目と追加11項目を結合する。保存上の重複正本を作らない。 */
export type PlayerBaseAbilities = Record<CommonAbilityCode, Ability>;
