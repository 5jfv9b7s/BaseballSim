import { createFarmDefinitions } from './farm.ts';
import { physicalConfig } from '../../../config/physical.ts';
import { physicalInputs as hoshihara } from '../physical/hoshihara.ts';
import { physicalInputs as aonagi } from '../physical/aonagi.ts';
import { physicalInputs as kohaku } from '../physical/kohaku.ts';
import { physicalInputs as asagiri } from '../physical/asagiri.ts';
import type { WorldDefinitions } from '../../world/types.ts';

const inputs = {
  'hoshihara-first': hoshihara,
  'aonagi-first': aonagi,
  'kohaku-first': kohaku,
  'asagiri-first': asagiri,
};

/** 身体入力を開始時に固定する。旧名簿・旧保存には後付けしない。 */
export function createPhysicalDefinitions(
  calendar: 'short' | 'annual' = 'short',
): WorldDefinitions {
  const base = createFarmDefinitions(calendar);
  return structuredClone({
    ...base,
    version: 'world-definitions-v7',
    physicalConfig,
    squads: base.squads.map((squad) => ({
      ...squad,
      physicalInputs: inputs[squad.squadId as keyof typeof inputs],
    })),
  });
}
