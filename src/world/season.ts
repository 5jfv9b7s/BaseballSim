import { gameScope } from './squads.ts';
import { ensure } from '../engine/validation.ts';
import { standings, statsForScope } from './stats.ts';
import type { SeasonSummary, WorldRecord } from './types.ts';

/** 表彰・決勝・翌年度更新とは分離した、試作日程の終了確定。 */
export function summarizeSeason(
  world: WorldRecord,
  scope: SeasonSummary['statScope'] = 'firstRegular',
): SeasonSummary {
  const competition = scope === 'farmRegular' ? world.definitions.farm! : world.definitions;
  const games = world.definitions.schedule.filter(
    (game) => gameScope(world.definitions, game) === scope,
  );
  const stats = statsForScope(world.stats, scope);
  ensure(world.currentDate > competition.endDate, '日程が終了していません');
  ensure(world.completedDates.includes(competition.endDate), '最終日の確定が必要です');
  ensure(
    games.every(
      (game) => world.games[game.gameId]?.result && world.statApplicationMarkers[game.gameId],
    ),
    '未完了の試合・成績があります',
  );
  const finalStandings = standings(stats, scope);
  const leaders = finalStandings.filter((row) => row.rank === 1);
  return structuredClone({
    version: 'season-summary-v1',
    seasonId: world.definitions.seasonId,
    competitionId: competition.competitionId,
    statScope: scope,
    completedOn: competition.endDate,
    games: games.length,
    standingsRule: world.definitions.standingsRule,
    clubs: finalStandings,
    stats,
    // 同率首位の決着規則は未定。球団ID順で優勝を決めない。
    title:
      leaders.length === 1
        ? { status: 'decided' as const, squadId: leaders[0]!.squadId }
        : { status: 'unresolved' as const, squadIds: leaders.map((row) => row.squadId) },
  });
}
