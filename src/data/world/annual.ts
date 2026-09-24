import { seasonConfig } from '../../../config/season.ts';
import { ensure, integer } from '../../engine/validation.ts';
import type { WorldDefinitions, ScheduledGame } from '../../world/types.ts';
import { createWorldDefinitions } from './index.ts';

/** 円環法。入力順と設定だけから日程を生成し、乱数は消費しない。 */
export function createAnnualDefinitions(config = seasonConfig): WorldDefinitions {
  ensure(config.version === 'fictional-season-v1', '未対応の年間日程設定です');
  integer(config.year, 1900, 9998, '年度');
  integer(config.homeAwayCycles, 1, 20, '総当たり回数');
  integer(config.daysBetweenRounds, 1, 14, '節の間隔');
  const base = createWorldDefinitions();
  const ring = base.squads.map((squad) => squad.squadId);
  ensure(ring.length % 2 === 0, '年間日程は偶数球団を指定してください');
  const start = Date.parse(config.openingDate + 'T00:00:00Z');
  const end = Date.parse(config.closingDate + 'T00:00:00Z');
  ensure(
    Number.isFinite(start) &&
      Number.isFinite(end) &&
      new Date(start).toISOString().slice(0, 10) === config.openingDate &&
      new Date(end).toISOString().slice(0, 10) === config.closingDate &&
      config.openingDate.startsWith(config.year + '-') &&
      config.closingDate.startsWith(config.year + '-'),
    '年間日程の日付が不正です',
  );
  const pairings: [string, string][][] = [];
  for (let round = 0; round < ring.length - 1; round++) {
    pairings.push(
      Array.from(
        { length: ring.length / 2 },
        (_, index) => [ring[index]!, ring[ring.length - 1 - index]!] as [string, string],
      ),
    );
    ring.splice(1, 0, ring.pop()!);
  }
  const schedule: ScheduledGame[] = [];
  let roundNo = 0;
  for (let cycle = 0; cycle < config.homeAwayCycles; cycle++) {
    for (const reverse of [false, true]) {
      for (const pairs of pairings) {
        const date = new Date(start + roundNo * config.daysBetweenRounds * 86_400_000)
          .toISOString()
          .slice(0, 10);
        ensure(date <= config.closingDate, '年間日程が終了日を超えます');
        for (const [first, second] of pairs) {
          schedule.push({
            gameId: 'G' + config.year + '-annual-' + String(schedule.length + 1).padStart(4, '0'),
            date,
            awaySquadId: reverse ? second : first,
            homeSquadId: reverse ? first : second,
          });
        }
        roundNo++;
      }
    }
  }
  ensure(schedule.length <= 256, '年間試作の試合上限256を超えます');
  return {
    ...base,
    version: 'world-definitions-v2',
    seasonId: 'S' + config.year + '-annual',
    competitionId: 'C' + config.year + '-fictional-annual',
    name: '架空4球団・年間リーグ',
    startDate: config.openingDate,
    endDate: config.closingDate,
    schedule,
  };
}
