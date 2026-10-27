import type { WorldView } from '../world/controller.ts';
import { SeasonPerformersPanel } from './SeasonPerformersPanel.tsx';
import { SeasonGrowthPanel } from './SeasonGrowthPanel.tsx';
import type { SeasonSummary } from '../world/types.ts';
import { StandingsTable } from './LeagueStandingsPanel.tsx';

/** 保存済みの要約を表示する。画面を開くたびに優勝を再判定しない。 */
export function SeasonSummaryPanel({
  summary,
  squadName,
  ownSquadId,
  view,
  onSelectPlayer,
  onOpenStats,
  onOpenMemorial,
  onHome,
}: {
  summary: SeasonSummary;
  squadName: (id: string) => string;
  ownSquadId?: string;
  view: WorldView;
  onSelectPlayer: (id: string) => void;
  onOpenStats: () => void;
  onOpenMemorial: () => void;
  onHome: () => void;
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
      <SeasonPerformersPanel
        key={JSON.stringify(['performers', view.worldId, summary.statScope])}
        summary={summary}
        view={view}
        ownSquadId={ownSquadId}
        onSelectPlayer={onSelectPlayer}
      />
      <SeasonGrowthPanel
        key={JSON.stringify([view.worldId, summary.statScope])}
        view={view}
        report={view.growth ? view.seasonGrowth[summary.statScope] : null}
        ownSquadId={ownSquadId}
        onSelectPlayer={onSelectPlayer}
      />
      <div className="season-summary-links" role="group" aria-label="総括から移動">
        <button type="button" onClick={onOpenStats}>
          詳細成績へ
        </button>
        <button type="button" onClick={onOpenMemorial}>
          メモリアルへ
        </button>
        <button type="button" onClick={onHome}>
          ホームへ
        </button>
      </div>
      <p>
        成績メニューから今季の確定記録を確認できます。ポストシーズン・表彰・翌年度更新は未対応です。
      </p>
    </section>
  );
}
