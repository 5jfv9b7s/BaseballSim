import { createDevelopmentDefinitions } from './development.ts';
import { createAgeCurveCatalog } from '../age-curves/index.ts';
import { AGE_CONFIG } from '../../../config/aging.ts';
import { validateAgeDefinitions } from '../../world/aging.ts';
import type { WorldDefinitions } from '../../world/types.ts';

/** 新規だけへ年齢変化を追加。旧v22へ曲線・衰退を補完しない。 */
export function createAgeDevelopmentDefinitions(
  calendar: 'short' | 'annual' = 'short',
): WorldDefinitions {
  const definitions: WorldDefinitions = {
    ...createDevelopmentDefinitions(calendar),
    version: 'world-definitions-v23',
    ageConfig: structuredClone(AGE_CONFIG),
    ageCurves: createAgeCurveCatalog(),
  };
  validateAgeDefinitions(definitions);
  return definitions;
}
