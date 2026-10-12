import type { HomeRunRecord, HomeRunRecordEntry } from '../world/memorial.ts';

/** 本画面へ移す前の確認用表示。選択しても進行・保存の指示は送らない。 */
export function MemorialPanel({
  record,
  onSelectGame,
}: {
  record: HomeRunRecord;
  onSelectGame: (entry: HomeRunRecordEntry) => void;
}) {
  return (
    <section className="panel" aria-label="メモリアル">
      <h2>メモリアル</h2>
      <h3>1試合最多本塁打</h3>
      <p>
        {record.statScope === 'firstRegular' ? '一軍' : '二軍'}・
        {record.status === 'final' ? '今季確定' : '今季ここまで'}
        （確定試合 {record.completedGames} / {record.scheduledGames}）
      </p>
      {record.maximum === null ? (
        <p>確定試合での本塁打記録はまだありません。</p>
      ) : (
        <>
          <p>
            最多 <strong>{record.maximum}本</strong>・同数の全{record.entries.length}件
          </p>
          <div className="world-table">
            <table aria-label="1試合最多本塁打の達成記録">
              <thead>
                <tr>
                  <th>日付</th>
                  <th>選手</th>
                  <th>当時の所属</th>
                  <th>対戦相手</th>
                  <th>本塁打</th>
                  <th>試合</th>
                </tr>
              </thead>
              <tbody>
                {record.entries.map((entry) => (
                  <tr key={entry.recordId}>
                    <td>{entry.achievedOn}</td>
                    <th>{entry.display.playerName}</th>
                    <td>{entry.display.teamName}</td>
                    <td>{entry.display.opponentName}</td>
                    <td>{entry.homeRuns}</td>
                    <td>
                      <button
                        className="secondary"
                        onClick={() => onSelectGame(entry)}
                        aria-label={
                          entry.achievedOn + ' ' + entry.display.playerName + 'の記録達成試合を表示'
                        }
                      >
                        試合結果
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="hint">
        当季の確定試合が対象です。一軍と二軍は別集計です。同じ選手が別の試合で並んだ記録も表示します。
      </p>
    </section>
  );
}
