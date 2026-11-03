import { useState } from 'react';
import { AwardsPanel } from './AwardsPanel.tsx';
import { HitlessStreakPanel } from './HitlessStreakPanel.tsx';
import type { SeasonHonors } from '../world/awards-types.ts';
import type { HitlessRecords } from '../world/hitless-streaks.ts';
import type { HomeRunRecord, HomeRunRecordEntry } from '../world/memorial.ts';
import type { HitStreakGame, HitStreakRecords } from '../world/hit-streaks.ts';
import { HitStreakPanel } from './HitStreakPanel.tsx';
import { HomeRunRecordTable } from './HomeRunRecordTable.tsx';

/** 読み取り専用の表示。対象の切替でも進行・保存の指示は送らない。 */
export function MemorialPanel({
  record,
  seasonYear,
  ownRecord,
  ownSquadId,
  onSelectGame,
  hitStreaks,
  hitlessStreaks,
  referenceHonors,
  onSelectPlayer,
  ownClubId,
}: {
  record: HomeRunRecord;
  seasonYear: string;
  ownRecord: HomeRunRecord | null;
  ownSquadId?: string;
  onSelectGame: (entry: Pick<HomeRunRecordEntry, 'gameId' | 'achievedOn'> | HitStreakGame) => void;
  hitStreaks: HitStreakRecords;
  hitlessStreaks: HitlessRecords;
  referenceHonors: SeasonHonors | null;
  onSelectPlayer: (id: string) => void;
  ownClubId?: string;
}) {
  const [target, setTarget] = useState('all');
  const [kind, setKind] = useState('homeRuns');
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
      <label className="memorial-filter">
        記録の種類
        <select value={kind} onChange={(event) => setKind(event.target.value)}>
          <option value="homeRuns">1試合最多本塁打</option>
          <option value="hitStreaks">連続試合安打（試作）</option>
          <option value="hitlessStreaks">連続打数無安打（試作）</option>
          <option value="awards">表彰の参考選考</option>
        </select>
      </label>
      {kind === 'awards' ? (
        <AwardsPanel
          report={referenceHonors}
          ownClubId={ownClubId}
          onlyOwn={own}
          onSelectPlayer={onSelectPlayer}
        />
      ) : kind === 'hitlessStreaks' ? (
        <HitlessStreakPanel
          record={own && ownClubId ? hitlessStreaks.byClub[ownClubId]! : hitlessStreaks.overall}
          seasonYear={seasonYear}
          ownSquadId={ownSquadId}
          onSelectGame={onSelectGame}
        />
      ) : kind === 'hitStreaks' ? (
        <HitStreakPanel
          record={own && ownClubId ? hitStreaks.byClub[ownClubId]! : hitStreaks.overall}
          seasonYear={seasonYear}
          ownSquadId={ownSquadId}
          onSelectGame={onSelectGame}
        />
      ) : (
        <>
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
        </>
      )}
      <details className="memorial-notes">
        <summary>集計範囲・未対応の記録</summary>
        <p>
          当季の確定試合が対象です。一軍と二軍は別集計です。
          自球団は達成当時の所属で集計し、球界全体の最多とは別に求めます。
          同じ選手が別の試合で並んだ記録もすべて表示します。
        </p>
        <p>
          連続試合安打の細則は未決定のため試作です。同日複数試合は日付・試合ID順で扱い、
          球団別は各期間の最後の安打時の所属で集計します。一二軍や年度をまたいで接続しません。
          無安打記録も期間の最後の打数時の所属で集計する試作です。投手の連勝敗・確定受賞履歴の保存は工事中です。
        </p>
      </details>
    </section>
  );
}
