import { createRookieDevelopmentDefinitions } from './rookie-development.ts';
import { createCampInputs } from '../camps/index.ts';
import { CAMP_CONFIG } from '../../../config/camp.ts';
import type { WorldDefinitions } from '../../world/types.ts';

export function createCampDevelopmentDefinitions(
  calendar: 'short' | 'annual' = 'short',
): WorldDefinitions {
  const d = createRookieDevelopmentDefinitions(calendar);
  return {
    ...d,
    version: 'world-definitions-v25',
    campConfig: structuredClone(CAMP_CONFIG),
    campInputs: createCampInputs(calendar, d),
  };
}
