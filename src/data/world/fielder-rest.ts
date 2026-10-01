import { createPerformanceDefinitions } from './performance.ts';
import { fielderRestConfig } from '../../../config/fielder-rest.ts';
import { fielderRestPolicies as hoshihara } from '../fielder-rest/hoshihara.ts';
import { fielderRestPolicies as aonagi } from '../fielder-rest/aonagi.ts';
import { fielderRestPolicies as kohaku } from '../fielder-rest/kohaku.ts';
import { fielderRestPolicies as asagiri } from '../fielder-rest/asagiri.ts';
import type { WorldDefinitions } from '../../world/types.ts';

export function createFielderRestDefinitions(
  calendar: 'short' | 'annual' = 'short',
): WorldDefinitions {
  return structuredClone({
    ...createPerformanceDefinitions(calendar),
    version: 'world-definitions-v11',
    fielderRestModelVersion: fielderRestConfig.version,
    fielderRestInputs: [...hoshihara, ...aonagi, ...kohaku, ...asagiri],
  });
}
