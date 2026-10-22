import { createDailyTrainingDefinitions } from './daily-training.ts';
import { EXPERIENCE_CONFIG } from '../../../config/experience.ts';
import { validateExperienceDefinitions } from '../../world/experience.ts';
import type { WorldDefinitions } from '../../world/types.ts';

/** 旧v21の通常練習係数は維持し、新規プレイだけ実戦経験を追加する。 */
export function createDevelopmentDefinitions(
  calendar: 'short' | 'annual' = 'short',
): WorldDefinitions {
  const next: WorldDefinitions = {
    ...createDailyTrainingDefinitions(calendar),
    version: 'world-definitions-v22',
    experienceConfig: structuredClone(EXPERIENCE_CONFIG),
  };
  validateExperienceDefinitions(next);
  return next;
}
