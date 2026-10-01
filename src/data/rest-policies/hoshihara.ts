import { restConfig } from '../../../config/rest.ts';
import type { RestPolicyInput } from '../../world/rest-types.ts';

/** 一軍・二軍それぞれの初期方針。所属投手は球団で共通、個別既定は継承です。 */
export const restPolicies: RestPolicyInput[] = [
  {
    squadId: 'hoshihara-first',
    teamRestPolicy: { ...restConfig.defaultRules },
    individualRest: [
      {
        playerId: 'player-a-10',
        mode: 'inherit',
      },
      {
        playerId: 'player-a-11',
        mode: 'inherit',
      },
      {
        playerId: 'player-a-12',
        mode: 'inherit',
      },
      {
        playerId: 'player-a-25',
        mode: 'inherit',
      },
      {
        playerId: 'player-a-26',
        mode: 'inherit',
      },
      {
        playerId: 'player-a-27',
        mode: 'inherit',
      },
    ],
  },
  {
    squadId: 'hoshihara-farm',
    teamRestPolicy: { ...restConfig.defaultRules },
    individualRest: [
      {
        playerId: 'player-a-10',
        mode: 'inherit',
      },
      {
        playerId: 'player-a-11',
        mode: 'inherit',
      },
      {
        playerId: 'player-a-12',
        mode: 'inherit',
      },
      {
        playerId: 'player-a-25',
        mode: 'inherit',
      },
      {
        playerId: 'player-a-26',
        mode: 'inherit',
      },
      {
        playerId: 'player-a-27',
        mode: 'inherit',
      },
    ],
  },
];
