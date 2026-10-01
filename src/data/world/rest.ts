import { createPhysicalDefinitions } from './physical.ts';
import { restConfig } from '../../../config/rest.ts';
import { restPolicies as hoshihara } from '../rest-policies/hoshihara.ts';
import { restPolicies as aonagi } from '../rest-policies/aonagi.ts';
import { restPolicies as kohaku } from '../rest-policies/kohaku.ts';
import { restPolicies as asagiri } from '../rest-policies/asagiri.ts';
import type { WorldDefinitions } from '../../world/types.ts';

export function createRestDefinitions(calendar: 'short' | 'annual' = 'short'): WorldDefinitions {
  return structuredClone({
    ...createPhysicalDefinitions(calendar),
    version: 'world-definitions-v8',
    restModelVersion: restConfig.version,
    restPolicyInputs: [...hoshihara, ...aonagi, ...kohaku, ...asagiri],
  });
}
