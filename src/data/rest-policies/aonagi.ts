import { restConfig } from '../../../config/rest.ts';
import type { RestPolicyInput } from '../../world/rest-types.ts';

/** 一軍・二軍それぞれの初期方針。所属投手は球団で共通、個別既定は継承です。 */
export const restPolicies: RestPolicyInput[] = [
  {
    squadId: 'aonagi-first',
    teamRestPolicy: { ...restConfig.defaultRules },
    individualRest: [
      {
        playerId: 'player-h-10',
        mode: 'inherit',
      },
      {
        playerId: 'player-h-11',
        mode: 'inherit',
      },
      {
        playerId: 'player-h-12',
        mode: 'inherit',
      },
      {
        playerId: 'player-h-25',
        mode: 'inherit',
      },
      {
        playerId: 'player-h-26',
        mode: 'inherit',
      },
      {
        playerId: 'player-h-27',
        mode: 'inherit',
      },
    ],
  },
  {
    squadId: 'aonagi-farm',
    teamRestPolicy: { ...restConfig.defaultRules },
    individualRest: [
      {
        playerId: 'player-h-10',
        mode: 'inherit',
      },
      {
        playerId: 'player-h-11',
        mode: 'inherit',
      },
      {
        playerId: 'player-h-12',
        mode: 'inherit',
      },
      {
        playerId: 'player-h-25',
        mode: 'inherit',
      },
      {
        playerId: 'player-h-26',
        mode: 'inherit',
      },
      {
        playerId: 'player-h-27',
        mode: 'inherit',
      },
    ],
  },
];
