import { standings } from './stats.ts';
import { squadParticipation } from './league-structure.ts';
import type { ScheduledGame, SeasonStats, StatKey, WorldDefinitions } from './types.ts';

export interface LeagueStandings {
  /** 旧保存の所属未記録はnull。現行データで補完しない。 */
  leagueId: string | null;
  displayName: string;
  clubs: ReturnType<typeof standings>;
}

/** 交流戦の成績を含めてから所属で分け、各リーグ内で順位を計算する。 */
export function leagueStandings(
  definitions: WorldDefinitions,
  stats: SeasonStats,
  scope: StatKey['statScope'] = 'firstRegular',
): LeagueStandings[] {
  const structure = definitions.leagueStructure;
  if (!structure)
    return [
      { leagueId: null, displayName: 'リーグ情報の記録なし', clubs: standings(stats, scope) },
    ];
  const level = scope === 'farmRegular' ? 'farm' : 'first';
  return structure.leagues
    .filter((l) => l.level === level)
    .map((league) => {
      const squadIds = new Set(
        structure.participations
          .filter((p) => p.leagueId === league.leagueId)
          .map((p) => p.squadId),
      );
      return {
        leagueId: league.leagueId,
        displayName: league.displayName,
        clubs: standings(
          { ...stats, teams: stats.teams.filter((t) => squadIds.has(t.squadId)) },
          scope,
        ),
      };
    });
}

/** 日程の保存内参加情報だけから対戦区分を導出する。成績区分は分けない。 */
export function gameLeagueKind(
  definitions: WorldDefinitions,
  game: ScheduledGame,
): 'league' | 'interleague' | undefined {
  const home = squadParticipation(definitions, game.homeSquadId);
  const away = squadParticipation(definitions, game.awaySquadId);
  if (
    !home ||
    !away ||
    home.competitionId !== definitions.competitionId ||
    away.competitionId !== definitions.competitionId
  )
    return undefined;
  return home.leagueId === away.leagueId ? 'league' : 'interleague';
}
