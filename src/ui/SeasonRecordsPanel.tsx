import type { WorldView } from '../world/controller.ts';
import type { HomeRunRecordEntry } from '../world/memorial.ts';
import type { SeasonSummary } from '../world/types.ts';
import { HomeRunRecordTable } from './HomeRunRecordTable.tsx';

/** 確定した当季の試合を参照する。要約を開いて記録や受賞を再判定しない。 */
export function SeasonRecordsPanel({
  summary,
  view,
  ownSquadId,
  onSelectGame,
}: {
  summary: SeasonSummary;
  view: WorldView;
  ownSquadId?: string;
  onSelectGame: (entry: HomeRunRecordEntry) => void;
}) {
  const competition =
    summary.statScope === 'farmRegular' ? view.definitions.farm! : view.definitions;
  const clubId = competition.squads.find((squad) => squad.squadId === ownSquadId)?.team.clubId;
  const record = clubId ? view.clubMemorial[summary.statScope]?.[clubId] : null;
  const overall = view.memorial[summary.statScope];
  const matchesSummary =
    record &&
    record.status === 'final' &&
    record.seasonId === summary.seasonId &&
    record.competitionId === summary.competitionId;
  return (
    <section className="season-records" aria-label="シーズンの達成記録">
      <div className="memorial-heading">
        <h3>自球団の達成記録</h3>
        <span>
          {summary.completedOn.slice(0, 4)}年度 ／{' '}
          {summary.statScope === 'farmRegular' ? '二軍公式戦' : '一軍公式戦'}
          {' ／ '}
          <time dateTime={summary.completedOn}>{summary.completedOn}確定</time>
        </span>
      </div>
      <h4>1試合最多本塁打</h4>
      {!clubId ? (
        <p>自球団が設定されていません。メモリアルで球界全体の記録を確認できます。</p>
      ) : !matchesSummary ? (
        <p>この年度要約に対応する確定記録は表示できません。</p>
      ) : record.maximum === null ? (
        <p>自球団の確定試合での本塁打記録はありません。</p>
      ) : (
        <>
          <p className="memorial-result">
            <span>自球団の最多</span>
            <strong>
              {record.maximum}
              <small>本</small>
            </strong>
            <span>同数の全{record.entries.length}件</span>
          </p>
          {overall && overall.maximum !== null && (
            <p>
              球界全体の最多 {overall.maximum}本
              {record.maximum === overall.maximum ? '（自球団も達成）' : ''}
            </p>
          )}
          <HomeRunRecordTable record={record} ownSquadId={ownSquadId} onSelectGame={onSelectGame} />
        </>
      )}
    </section>
  );
}
