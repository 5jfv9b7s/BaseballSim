import { createReliefDefinitions } from './relief.ts';
import { bullpenConfig } from '../../../config/bullpen.ts';
import { bullpenInputs as hoshihara } from '../bullpen/hoshihara.ts';
import { bullpenInputs as aonagi } from '../bullpen/aonagi.ts';
import { bullpenInputs as kohaku } from '../bullpen/kohaku.ts';
import { bullpenInputs as asagiri } from '../bullpen/asagiri.ts';
import type { WorldDefinitions } from '../../world/types.ts';

export function createBullpenDefinitions(calendar: 'short' | 'annual' = 'short'): WorldDefinitions {
  const prior = createReliefDefinitions(calendar);
  return structuredClone({
    ...prior,
    version: 'world-definitions-v13',
    bullpenConfig,
    bullpenInputs: [...hoshihara, ...aonagi, ...kohaku, ...asagiri],
    // 準備開始時に負荷を記録するv2。消耗・回復の式と既定係数はv1から変更しない。
    physicalConfig: { ...prior.physicalConfig!, version: 'physical-load-v2' },
  });
}
