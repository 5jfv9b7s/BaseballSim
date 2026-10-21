import { createPlayerDevelopmentDefinitions } from './player-development.ts';
import { createTrainingPlanInputs } from '../training/index.ts';
import { validateTrainingDefinitions } from '../../world/training.ts';
import type { WorldDefinitions } from '../../world/types.ts';

/** 通常練習の指定を保持する新規定義。成長計算モデルはまだ有効にしない。 */
export function createTrainingPlanDefinitions(
  calendar: 'short' | 'annual' = 'short',
): WorldDefinitions {
  const definitions = createPlayerDevelopmentDefinitions(calendar);
  const next: WorldDefinitions = {
    ...definitions,
    version: 'world-definitions-v20',
    trainingPlans: createTrainingPlanInputs(definitions),
  };
  validateTrainingDefinitions(next);
  return next;
}
