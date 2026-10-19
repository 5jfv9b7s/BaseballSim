import type { SeasonSummary } from '../world/types.ts';
import { StandingsTable } from './LeagueStandingsPanel.tsx';

/** 保存済みの要約を表示する。画面を開くたびに優勝を再判定しない。 */
export function SeasonSummaryPanel({
  summary,
  squadName,
  ownSquadId,
}: {
  summary: SeasonSummary;
  squadName: (id: string) => string;
  ownSquadId?: string;
}) {
  return (
    <section className="panel" aria-label="シーズン終了要約">
      <h2>{summary.statScope === 'farmRegular' ? '二軍シーズン終了' : 'シーズン終了'}</h2>
      <p>
        {summary.completedOn}までの全{summary.games}試合を確定し、年度要約を保存しました。
      </p>
      {summary.version === 'season-summary-v2' ? (
        summary.leagues.map((league) => (
          <div key={league.leagueId}>
            <h3>{league.displayName}</h3>
            <p>
              {league.title.status === 'decided'
                ? '試作リーグ優勝：' + squadName(league.title.squadId)
                : '優勝未確定（勝敗未観測、または同率首位の決着規則が未定）'}
            </p>
            <StandingsTable group={league} squadName={squadName} ownSquadId={ownSquadId} />
          </div>
        ))
      ) : (
        <p>
          {summary.title.status === 'decided'
            ? '試作リーグ優勝：' + squadName(summary.title.squadId)
            : '勝敗未観測、または同率首位の決着規則が未定のため、優勝は未確定です。'}
        </p>
      )}
      <p>
        成績メニューから今季の確定記録を確認できます。ポストシーズン・表彰・翌年度更新は未対応です。
      </p>
    </section>
  );
}
