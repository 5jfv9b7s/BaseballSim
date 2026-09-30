import type { RosterPolicyInput } from '../../world/roster-policy-types.ts';

/** 架空初期値。実登録と固定希望は別々に編集する。 */
export const rosterPolicy: RosterPolicyInput = {
  changeMode: 'manual',
  preferences: [
    { playerId: 'player-a-01', preference: 'auto' },
    { playerId: 'player-a-02', preference: 'auto' },
    { playerId: 'player-a-03', preference: 'auto' },
    { playerId: 'player-a-04', preference: 'auto' },
    { playerId: 'player-a-05', preference: 'auto' },
    { playerId: 'player-a-06', preference: 'auto' },
    { playerId: 'player-a-07', preference: 'auto' },
    { playerId: 'player-a-08', preference: 'auto' },
    { playerId: 'player-a-09', preference: 'auto' },
    { playerId: 'player-a-10', preference: 'auto' },
    { playerId: 'player-a-11', preference: 'auto' },
    { playerId: 'player-a-12', preference: 'auto' },
    { playerId: 'player-a-13', preference: 'auto' },
    { playerId: 'player-a-14', preference: 'auto' },
    { playerId: 'player-a-15', preference: 'auto' },
  ],
};
