import type { ScheduledGame } from '../../world/types.ts';

/** 一軍休養日の9/26にも二軍を進める、独立した確認用日程。 */
export const farmCalendar = { startDate: '2026-09-24', endDate: '2026-09-26' };
export const farmSchedule: ScheduledGame[] = [
  {
    gameId: 'G2026-farm-0924-01',
    date: '2026-09-24',
    awaySquadId: 'hoshihara-farm',
    homeSquadId: 'aonagi-farm',
  },
  {
    gameId: 'G2026-farm-0924-02',
    date: '2026-09-24',
    awaySquadId: 'kohaku-farm',
    homeSquadId: 'asagiri-farm',
  },
  {
    gameId: 'G2026-farm-0926-01',
    date: '2026-09-26',
    awaySquadId: 'hoshihara-farm',
    homeSquadId: 'kohaku-farm',
  },
  {
    gameId: 'G2026-farm-0926-02',
    date: '2026-09-26',
    awaySquadId: 'aonagi-farm',
    homeSquadId: 'asagiri-farm',
  },
];
