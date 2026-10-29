import { useState } from 'react';
import type { HomeRunRecord, HomeRunRecordEntry } from '../world/memorial.ts';
import { HomeRunRecordTable } from './HomeRunRecordTable.tsx';

/** 読み取り専用の表示。対象の切替でも進行・保存の指示は送らない。 */
export function MemorialPanel({
  record,
  seasonYear,
  ownRecord,
  ownSquadId,
  onSelectGame,
}: {
  record: HomeRunRecord;
  seasonYear: string;
  ownRecord: HomeRunRecord | null;
  ownSquadId?: string;
  onSelectGame: (entry: HomeRunRecordEntry) => void;
}) {
  const [target, setTarget] = useState('all');
  const own = target === 'own' && ownRecord !== null;
  const display = own ? ownRecord : record;
  return (
    <section className="panel" aria-label="メモリアル">
      <h2>メモリアル</h2>
      <label className="memorial-filter">
        記録の対象
        <select value={own ? 'own' : 'all'} onChange={(event) => setTarget(event.target.value)}>
          <option value="all">球界全体</option>
          <option value="own" disabled={!ownRecord}>
            {ownRecord ? '自球団' : '自球団（未設定）'}
          </option>
        </select>
      </label>
      <h3>1試合最多本塁打</h3>
      <p>
        {seasonYear}年度 ／ {display.statScope === 'firstRegular' ? '一軍' : '二軍'}・
        {display.status === 'final' ? '今季確定' : '今季ここまで'}
        （確定試合 {display.completedGames} / {display.scheduledGames}）
      </p>
      {display.maximum === null ? (
        <p>
          {own
            ? '自球団の確定試合での本塁打記録はまだありません。'
            : '確定試合での本塁打記録はまだありません。'}
        </p>
      ) : (
        <>
          <p className="memorial-result">
            <span>{own ? '自球団の最多' : '球界全体の最多'}</span>
            <strong>
              {display.maximum}
              <small>本</small>
            </strong>
            <span>同数の全{display.entries.length}件</span>
          </p>
          <HomeRunRecordTable
            record={display}
            ownSquadId={ownSquadId}
            onSelectGame={onSelectGame}
          />
        </>
      )}
      <details className="memorial-notes">
        <summary>集計範囲・未対応の記録</summary>
        <p>
          当季の確定試合が対象です。一軍と二軍は別集計です。
          自球団は達成当時の所属で集計し、球界全体の最多とは別に求めます。
          同じ選手が別の試合で並んだ記録もすべて表示します。
        </p>
        <p>継続記録・投手の連勝敗・タイトル・B9・GGは工事中です。</p>
      </details>
    </section>
  );
}
