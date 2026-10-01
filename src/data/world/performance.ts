import { createConditionDefinitions } from './condition.ts';
import { performanceConfig } from '../../../config/performance.ts';
import type { WorldDefinitions } from '../../world/types.ts';

export function createPerformanceDefinitions(
  calendar: 'short' | 'annual' = 'short',
): WorldDefinitions {
  return structuredClone({
    ...createConditionDefinitions(calendar),
    version: 'world-definitions-v10',
    performanceConfig,
  });
}
