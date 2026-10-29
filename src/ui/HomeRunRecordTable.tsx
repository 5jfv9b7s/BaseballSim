import type { HomeRunRecord, HomeRunRecordEntry } from '../world/memorial.ts';
import './memorial.css';

/** メモリアルと総括で同じ記録を表示する。氏名・所属は索引内の達成時情報を使う。 */
export function HomeRunRecordTable({
  record,
  ownSquadId,
  onSelectGame,
}: {
  record: HomeRunRecord;
  ownSquadId?: string;
  onSelectGame: (entry: HomeRunRecordEntry) => void;
}) {
  return (
    <div
      className="world-table memorial-table"
      tabIndex={0}
      role="region"
      aria-label="達成記録の表（横スクロール）"
    >
      <table aria-label="1試合最多本塁打の達成記録">
        <thead>
          <tr>
            <th scope="col">選手</th>
            <th scope="col">達成日</th>
            <th scope="col">当時の所属</th>
            <th scope="col">対戦相手</th>
            <th scope="col">本塁打</th>
            <th scope="col">試合</th>
          </tr>
        </thead>
        <tbody>
          {record.entries.map((entry) => (
            <tr key={entry.recordId} data-own-club={entry.squadId === ownSquadId}>
              <th scope="row">{entry.display.playerName}</th>
              <td>
                <time dateTime={entry.achievedOn}>{entry.achievedOn}</time>
              </td>
              <td>
                {entry.squadId === ownSquadId && (
                  <span className="memorial-own" aria-label="自球団">
                    自
                  </span>
                )}
                {entry.display.teamName}
              </td>
              <td>{entry.display.opponentName}</td>
              <td className="memorial-number">{entry.homeRuns}</td>
              <td>
                <button
                  type="button"
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
  );
}
