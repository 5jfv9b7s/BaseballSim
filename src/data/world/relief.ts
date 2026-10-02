import { createFielderRestDefinitions } from './fielder-rest.ts';
import { reliefConfig } from '../../../config/relief.ts';
import { reliefPolicies as hoshihara } from '../relief-policies/hoshihara.ts';
import { reliefPolicies as aonagi } from '../relief-policies/aonagi.ts';
import { reliefPolicies as kohaku } from '../relief-policies/kohaku.ts';
import { reliefPolicies as asagiri } from '../relief-policies/asagiri.ts';
import type { WorldDefinitions } from '../../world/types.ts';
export function createReliefDefinitions(calendar: 'short' | 'annual' = 'short'): WorldDefinitions {
  return structuredClone({
    ...createFielderRestDefinitions(calendar),
    version: 'world-definitions-v12',
    reliefConfig,
    reliefPolicyInputs: [...hoshihara, ...aonagi, ...kohaku, ...asagiri],
  });
}
