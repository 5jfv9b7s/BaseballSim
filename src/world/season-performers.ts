import { ensure } from '../engine/validation.ts';
import {
  STAT_METRICS,
  playerLeaderboard,
  statValue,
  type LeaderboardRow,
  type StatMetric,
} from './leaderboard.ts';
import type { SeasonSummary, WorldDefinitions } from './types.ts';

export interface SeasonPerformanceMetric {
  category: 'batting' | 'pitching';
  metric: StatMetric;
  leaders: LeaderboardRow[];
  emptyReason: 'noRecord' | 'noPositiveValue' | 'noQualifiedPlayer' | null;
}

/** 総合評価や表彰の選考ではなく、記録済みの部門別成績を振り返る表示項目。 */
const SEASON_PERFORMANCE_METRICS = [
  ['batting', 'hits'],
  ['batting', 'homeRuns'],
  ['batting', 'runsBattedIn'],
  ['batting', 'average'],
  ['pitching', 'strikeouts'],
  ['pitching', 'outsRecorded'],
  ['pitching', 'era'],
] as const;

/**
 * 年度要約の確定カウンタだけを読む。現在の累計・能力・乱数を参照しない。
 * 球団内で比較し、移籍者の他球団分を加算しない。率の資格未決定は既存の扱いを保つ。
 */
export function seasonClubPerformers(
  definitions: WorldDefinitions,
  summary: SeasonSummary,
  squadId: string,
): SeasonPerformanceMetric[] {
  const competition = summary.statScope === 'farmRegular' ? definitions.farm : definitions;
  ensure(
    competition &&
      summary.seasonId === definitions.seasonId &&
      summary.competitionId === competition.competitionId,
    '年度要約と保存内の年度・大会が一致しません',
  );
  ensure(
    competition.squads.some((squad) => squad.squadId === squadId),
    'この大会に参加していないチームです',
  );

  return SEASON_PERFORMANCE_METRICS.map(([category, key]) => {
    const metric = STAT_METRICS[category].find((entry) => entry.key === key)!;
    const observed = playerLeaderboard(summary.stats, {
      seasonId: summary.seasonId,
      competitionId: summary.competitionId,
      statScope: summary.statScope,
      category,
      metric: key,
      includedSquadIds: [squadId],
      qualifiedOnly: false,
    });
    const eligible = metric.qualification
      ? observed.filter((row) => row.qualification?.reached)
      : observed;
    const recorded = eligible.filter((row) => statValue(row, metric) !== null);
    // 数量が全員0の場合に「最多の活躍」として全員を並べない。防御率0は有効な実績。
    const candidates = metric.qualification
      ? recorded
      : recorded.filter((row) => statValue(row, metric)!.numerator > 0n);
    const best = candidates[0];
    return {
      category,
      metric,
      leaders: best ? candidates.filter((row) => row.rank === best.rank) : [],
      emptyReason: best
        ? null
        : observed.length === 0
          ? 'noRecord'
          : metric.qualification && eligible.length === 0
            ? 'noQualifiedPlayer'
            : recorded.length === 0
              ? 'noRecord'
              : 'noPositiveValue',
    };
  });
}
