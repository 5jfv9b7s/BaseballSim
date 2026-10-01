import { restConfig } from '../../../config/rest.ts';
import type { RestPolicyInput } from '../../world/rest-types.ts';

/** 一軍・二軍それぞれの初期方針。所属投手は球団で共通、個別既定は継承です。 */
export const restPolicies: RestPolicyInput[] = [
  {
    squadId: 'kohaku-first',
    teamRestPolicy: { ...restConfig.defaultRules },
    individualRest: [
      {
        playerId: 'kohaku-player-a-10',
        mode: 'inherit',
      },
      {
        playerId: 'kohaku-player-a-11',
        mode: 'inherit',
      },
      {
        playerId: 'kohaku-player-a-12',
        mode: 'inherit',
      },
      {
        playerId: 'kohaku-player-a-25',
        mode: 'inherit',
      },
      {
        playerId: 'kohaku-player-a-26',
        mode: 'inherit',
      },
      {
        playerId: 'kohaku-player-a-27',
        mode: 'inherit',
      },
    ],
  },
  {
    squadId: 'kohaku-farm',
    teamRestPolicy: { ...restConfig.defaultRules },
    individualRest: [
      {
        playerId: 'kohaku-player-a-10',
        mode: 'inherit',
      },
      {
        playerId: 'kohaku-player-a-11',
        mode: 'inherit',
      },
      {
        playerId: 'kohaku-player-a-12',
        mode: 'inherit',
      },
      {
        playerId: 'kohaku-player-a-25',
        mode: 'inherit',
      },
      {
        playerId: 'kohaku-player-a-26',
        mode: 'inherit',
      },
      {
        playerId: 'kohaku-player-a-27',
        mode: 'inherit',
      },
    ],
  },
];
