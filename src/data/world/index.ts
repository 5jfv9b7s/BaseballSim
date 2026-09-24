import { createMatchConfig } from '../../game/config.ts';
import { createErrorConfig } from '../../game/error-config.ts';
import type { WorldDefinitions } from '../../world/types.ts';
import { calendar, schedule } from './schedule.ts';
import { createWorldSquads } from './teams.ts';

export function createWorldDefinitions(): WorldDefinitions {
  return structuredClone({
    version: 'world-definitions-v1',
    seasonId: 'S2026-trial',
    competitionId: 'C2026-fictional-first',
    statScope: 'firstRegular',
    name: '架空4球団・日次進行',
    ...calendar,
    squads: createWorldSquads(),
    schedule,
    matchConfig: createMatchConfig(),
    errorConfig: createErrorConfig(),
    standingsRule: 'win-percentage-shared-rank-v1',
    seedRule: 'game-id-fnv1a32-v1',
  });
}
