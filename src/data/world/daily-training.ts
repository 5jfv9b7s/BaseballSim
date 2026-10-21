import { createTrainingPlanDefinitions } from './training-plans.ts';
import { GROWTH_CONFIG } from '../../../config/growth.ts';
import { validateGrowthDefinitions } from '../../world/growth.ts';
import type { WorldDefinitions } from '../../world/types.ts';

/** v20の保存専用練習を維持し、新規だけ通常練習の計算を有効にする。 */
export function createDailyTrainingDefinitions(
  calendar: 'short' | 'annual' = 'short',
): WorldDefinitions {
  const next: WorldDefinitions = {
    ...createTrainingPlanDefinitions(calendar),
    version: 'world-definitions-v21',
    growthConfig: structuredClone(GROWTH_CONFIG),
  };
  validateGrowthDefinitions(next);
  return next;
}
