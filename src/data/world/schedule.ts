import type { ScheduledGame } from '../../world/types.ts';

/** 架空の短期日程。9/26は試合のない日の処理を確認するための休み。 */
export const calendar = {
  startDate: '2026-09-24',
  endDate: '2026-09-27',
};

export const schedule: ScheduledGame[] = [
  {
    gameId: 'G2026-0924-01',
    date: '2026-09-24',
    awaySquadId: 'hoshihara-first',
    homeSquadId: 'aonagi-first',
  },
  {
    gameId: 'G2026-0924-02',
    date: '2026-09-24',
    awaySquadId: 'kohaku-first',
    homeSquadId: 'asagiri-first',
  },
  {
    gameId: 'G2026-0925-01',
    date: '2026-09-25',
    awaySquadId: 'aonagi-first',
    homeSquadId: 'kohaku-first',
  },
  {
    gameId: 'G2026-0925-02',
    date: '2026-09-25',
    awaySquadId: 'asagiri-first',
    homeSquadId: 'hoshihara-first',
  },
  {
    gameId: 'G2026-0927-01',
    date: '2026-09-27',
    awaySquadId: 'hoshihara-first',
    homeSquadId: 'kohaku-first',
  },
  {
    gameId: 'G2026-0927-02',
    date: '2026-09-27',
    awaySquadId: 'aonagi-first',
    homeSquadId: 'asagiri-first',
  },
];
