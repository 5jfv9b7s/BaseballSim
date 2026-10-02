import { reliefConfig } from '../../../config/relief.ts';
import type { ReliefPolicyInput } from '../../world/relief-types.ts';

/** 同順位の通常救援を既定とし、従来の候補順を保つ。各選手・一二軍を独立編集可能。 */
export const reliefPolicies: ReliefPolicyInput[] = [
  {
    squadId: 'hoshihara-first',
    reliefRoles: [
      {
        playerId: 'player-a-10',
        role: 'relief',
        priority: 1,
        conditions: structuredClone(reliefConfig.templates.relief),
      },
      {
        playerId: 'player-a-11',
        role: 'relief',
        priority: 1,
        conditions: structuredClone(reliefConfig.templates.relief),
      },
      {
        playerId: 'player-a-12',
        role: 'relief',
        priority: 1,
        conditions: structuredClone(reliefConfig.templates.relief),
      },
      {
        playerId: 'player-a-25',
        role: 'relief',
        priority: 1,
        conditions: structuredClone(reliefConfig.templates.relief),
      },
      {
        playerId: 'player-a-26',
        role: 'relief',
        priority: 1,
        conditions: structuredClone(reliefConfig.templates.relief),
      },
      {
        playerId: 'player-a-27',
        role: 'relief',
        priority: 1,
        conditions: structuredClone(reliefConfig.templates.relief),
      },
    ],
  },
  {
    squadId: 'hoshihara-farm',
    reliefRoles: [
      {
        playerId: 'player-a-10',
        role: 'relief',
        priority: 1,
        conditions: structuredClone(reliefConfig.templates.relief),
      },
      {
        playerId: 'player-a-11',
        role: 'relief',
        priority: 1,
        conditions: structuredClone(reliefConfig.templates.relief),
      },
      {
        playerId: 'player-a-12',
        role: 'relief',
        priority: 1,
        conditions: structuredClone(reliefConfig.templates.relief),
      },
      {
        playerId: 'player-a-25',
        role: 'relief',
        priority: 1,
        conditions: structuredClone(reliefConfig.templates.relief),
      },
      {
        playerId: 'player-a-26',
        role: 'relief',
        priority: 1,
        conditions: structuredClone(reliefConfig.templates.relief),
      },
      {
        playerId: 'player-a-27',
        role: 'relief',
        priority: 1,
        conditions: structuredClone(reliefConfig.templates.relief),
      },
    ],
  },
];
