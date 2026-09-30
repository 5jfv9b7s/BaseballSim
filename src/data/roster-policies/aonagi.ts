import type { RosterPolicyInput } from '../../world/roster-policy-types.ts';

/** 架空初期値。実登録と固定希望は別々に編集する。 */
export const rosterPolicy: RosterPolicyInput = {
  changeMode: 'manual',
  preferences: [
    { playerId: 'player-h-01', preference: 'auto' },
    { playerId: 'player-h-02', preference: 'auto' },
    { playerId: 'player-h-03', preference: 'auto' },
    { playerId: 'player-h-04', preference: 'auto' },
    { playerId: 'player-h-05', preference: 'auto' },
    { playerId: 'player-h-06', preference: 'auto' },
    { playerId: 'player-h-07', preference: 'auto' },
    { playerId: 'player-h-08', preference: 'auto' },
    { playerId: 'player-h-09', preference: 'auto' },
    { playerId: 'player-h-10', preference: 'auto' },
    { playerId: 'player-h-11', preference: 'auto' },
    { playerId: 'player-h-12', preference: 'auto' },
    { playerId: 'player-h-13', preference: 'auto' },
    { playerId: 'player-h-14', preference: 'auto' },
    { playerId: 'player-h-15', preference: 'auto' },
  ],
};
