import { createRestDefinitions } from './rest.ts';
import { conditionConfig } from '../../../config/condition.ts';
import { conditionInputs as hoshihara } from '../condition/hoshihara.ts';
import { conditionInputs as aonagi } from '../condition/aonagi.ts';
import { conditionInputs as kohaku } from '../condition/kohaku.ts';
import { conditionInputs as asagiri } from '../condition/asagiri.ts';
import type { WorldDefinitions } from '../../world/types.ts';

export function createConditionDefinitions(
  calendar: 'short' | 'annual' = 'short',
): WorldDefinitions {
  const definitions = createRestDefinitions(calendar);
  const inputs = {
    'hoshihara-first': hoshihara,
    'aonagi-first': aonagi,
    'kohaku-first': kohaku,
    'asagiri-first': asagiri,
  };
  return structuredClone({
    ...definitions,
    version: 'world-definitions-v9',
    conditionConfig,
    squads: definitions.squads.map((squad) => ({
      ...squad,
      conditionInputs: inputs[squad.squadId as keyof typeof inputs],
    })),
  });
}
