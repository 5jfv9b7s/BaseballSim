import { ensure } from '../engine/validation.ts';
import { playerLeaderboard, type LeaderboardQuery } from './leaderboard.ts';
import type { SeasonStats, StatKey, WorldDefinitions } from './types.ts';

export interface LeaderboardLeague {
  /** 参加情報のない旧保存はnull。現行dataで補完しない。 */
  leagueId: string | null;
  displayName: string;
  squadIds: string[];
}

/** 保存内の年度・大会参加情報から、成績を集計するチームを取得する。 */
export function leaderboardLeagues(
  definitions: WorldDefinitions,
  scope: StatKey['statScope'],
): LeaderboardLeague[] {
  const competition = scope === 'farmRegular' ? definitions.farm : definitions;
  if (!competition) return [];
  const structure = definitions.leagueStructure;
  if (!structure)
    return [
      {
        leagueId: null,
        displayName: 'リーグ情報の記録なし',
        squadIds: competition.squads.map((squad) => squad.squadId),
      },
    ];

  const level = scope === 'farmRegular' ? 'farm' : 'first';
  const participants = structure.participations.filter(
    (entry) => entry.competitionId === competition.competitionId,
  );
  return structure.leagues
    .filter((league) => league.level === level)
    .map((league) => ({
      leagueId: league.leagueId,
      displayName: league.displayName,
      squadIds: participants
        .filter((entry) => entry.leagueId === league.leagueId)
        .map((entry) => entry.squadId),
    }))
    .filter((league) => league.squadIds.length > 0);
}

/**
 * 年度・大会→リーグ参加チーム→選手合算→順位→球団表示の順で抽出する。
 * 交流戦は同じ公式戦カウンタへ既に一度だけ記録されているため、再加算しない。
 * leagueId省略は全リーグ合算。所属未記録の旧保存で特定リーグを要求したら拒否する。
 */
export function leaguePlayerLeaderboard(
  definitions: WorldDefinitions,
  stats: SeasonStats,
  query: Omit<LeaderboardQuery, 'includedSquadIds'> & { leagueId?: string },
) {
  const competition = query.statScope === 'farmRegular' ? definitions.farm : definitions;
  ensure(
    competition &&
      query.competitionId === competition.competitionId &&
      query.seasonId === definitions.seasonId,
    '成績の年度・大会が保存内の定義と一致しません',
  );
  const leagues = leaderboardLeagues(definitions, query.statScope);
  const league = leagues.find((entry) => entry.leagueId === query.leagueId);
  ensure(query.leagueId === undefined || league, 'この大会に参加していないリーグです');
  return playerLeaderboard(stats, {
    ...query,
    includedSquadIds: (league ? [league] : leagues).flatMap((entry) => entry.squadIds),
  });
}
