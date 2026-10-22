import { ensure, id, integer } from '../engine/validation.ts';
import {
  ADDITIONAL_ABILITY_CODES,
  COMMON_ABILITIES,
  FIELD_POSITIONS,
} from '../players/abilities.ts';
import type { Ability } from '../engine/types.ts';
import type { WorldDefinitions } from './types.ts';
import type {
  PlayerBaseAbilities,
  PlayerDevelopmentCatalog,
  PlayerDevelopmentInput,
} from './player-development-types.ts';

function fields(value: unknown, keys: readonly string[], name: string): void {
  ensure(value !== null && typeof value === 'object' && !Array.isArray(value), name + 'が不正です');
  const actual = Object.keys(value);
  ensure(
    actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key)),
    name + 'の項目が不足または余分です',
  );
}
function ability(value: Ability): void {
  fields(value, ['valueMilli', 'ceilingMilli'], '能力');
  integer(value.ceilingMilli, 0, 120000, '成長上限');
  integer(value.valueMilli, 0, value.ceilingMilli, '基本能力');
}

export function validatePlayerDevelopmentCatalog(
  value: unknown,
): asserts value is PlayerDevelopmentCatalog {
  fields(value, ['version', 'abilityCatalogVersion', 'source', 'players'], '選手能力カタログ');
  const catalog = value as PlayerDevelopmentCatalog;
  ensure(
    catalog.version === 'player-development-v1' &&
      catalog.abilityCatalogVersion === 'common-abilities-v1' &&
      catalog.source === 'fictional-development-v1',
    '未対応の選手能力カタログです',
  );
  ensure(
    Array.isArray(catalog.players) && catalog.players.length > 0 && catalog.players.length <= 560,
    '選手能力の件数が不正です',
  );
  const seen = new Set<string>();
  for (const input of catalog.players) {
    fields(
      input,
      ['playerId', 'additionalAbilities', 'positionSkills', 'pitchingAptitudes', 'growthProfile'],
      '選手能力',
    );
    id(input.playerId);
    ensure(
      !Object.hasOwn(Object.prototype, input.playerId) && !seen.has(input.playerId),
      '選手能力のIDが不正または重複しています',
    );
    seen.add(input.playerId);
    fields(input.additionalAbilities, ADDITIONAL_ABILITY_CODES, '追加11能力');
    for (const code of ADDITIONAL_ABILITY_CODES) ability(input.additionalAbilities[code]);
    fields(input.positionSkills, FIELD_POSITIONS, '9位置の適性・習熟');
    for (const position of FIELD_POSITIONS) {
      const skill = input.positionSkills[position];
      fields(skill, ['aptitudeMilli', 'familiarity'], '位置の適性・習熟');
      integer(skill.aptitudeMilli, 0, 120000, '守備適性');
      ability(skill.familiarity);
    }
    fields(input.pitchingAptitudes, ['starterMilli', 'relieverMilli'], '投手適性');
    integer(input.pitchingAptitudes.starterMilli, 0, 120000, '先発適性');
    integer(input.pitchingAptitudes.relieverMilli, 0, 120000, '救援適性');
    fields(input.growthProfile, ['talentMilli', 'ambitionMilli'], '成長特性');
    integer(input.growthProfile.talentMilli, 0, 120000, '才能');
    integer(input.growthProfile.ambitionMilli, 0, 120000, '向上心');
  }
}

export function playerDevelopment(
  definitions: WorldDefinitions,
  playerId: string,
): PlayerDevelopmentInput | undefined {
  const input = definitions.playerDevelopment?.players.find((entry) => entry.playerId === playerId);
  return input ? structuredClone(input) : undefined;
}

/** 既存版で記録している能力だけを読む。未記録の身体・捕球を補わない。 */
export function existingPlayerAbilities(definitions: WorldDefinitions, playerId: string) {
  const squad = definitions.squads.find((squad) =>
    squad.players.some((p) => p.playerId === playerId),
  );
  const player = squad?.players.find((p) => p.playerId === playerId);
  if (!player) return undefined;
  const physical = squad?.physicalInputs?.find((p) => p.playerId === playerId)?.physical;
  return structuredClone({
    'batting.contactVsRight': player.batting.contactVsRight,
    'batting.contactVsLeft': player.batting.contactVsLeft,
    'batting.powerVsRight': player.powerVsRight,
    'batting.powerVsLeft': player.powerVsLeft,
    'batting.plateDiscipline': player.batting.plateDiscipline,
    'running.speed': player.runningSpeed,
    'fielding.range': player.fieldingRange,
    'fielding.catching': player.fielding?.catching,
    'fielding.armStrength': player.armStrength,
    'physical.stamina': physical?.stamina,
    'physical.recovery': physical?.recovery,
  });
}

/** 調子や疲労の倍率を掛けず、保存内の22基本能力だけを返す。旧保存へは補完しない。 */
export function playerBaseAbilities(
  definitions: WorldDefinitions,
  playerId: string,
): PlayerBaseAbilities | undefined {
  const input = playerDevelopment(definitions, playerId);
  if (!input) return undefined;
  const existing = existingPlayerAbilities(definitions, playerId);
  ensure(existing, '既存の基本能力が不足しています');
  const abilities = { ...input.additionalAbilities, ...existing };
  fields(abilities, Object.keys(COMMON_ABILITIES), '共通22能力');
  for (const value of Object.values(abilities)) ability(value!);
  return abilities as PlayerBaseAbilities;
}

export function validatePlayerDevelopment(definitions: WorldDefinitions): void {
  if (
    ![
      'world-definitions-v19',
      'world-definitions-v20',
      'world-definitions-v21',
      'world-definitions-v22',
    ].includes(definitions.version)
  ) {
    ensure(definitions.playerDevelopment === undefined, '旧定義へ追加能力・適性を後付けできません');
    return;
  }
  validatePlayerDevelopmentCatalog(definitions.playerDevelopment);
  const ids = definitions.squads.flatMap((squad) => squad.players.map((p) => p.playerId));
  ensure(
    definitions.playerDevelopment.players.length === ids.length &&
      definitions.playerDevelopment.players.every((p) => ids.includes(p.playerId)),
    '全選手の追加能力・適性が必要です',
  );
  for (const playerId of ids) {
    const abilities = playerBaseAbilities(definitions, playerId)!;
    fields(abilities, Object.keys(COMMON_ABILITIES), '共通22能力');
    for (const value of Object.values(abilities)) ability(value);
  }
}
