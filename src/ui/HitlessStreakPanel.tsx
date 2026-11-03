import type { HitlessPeriod, HitlessRecord } from '../world/hitless-streaks.ts';
import type { HitStreakGame } from '../world/hit-streaks.ts';
import './memorial.css';
const stateLabel = (entry: HitlessPeriod) =>
  entry.status === 'ongoing' ? '継続中' : entry.status === 'ended' ? '終了済み' : '今季終了時点';
function Period({
  entry,
  onSelectGame,
}: {
  entry: HitlessPeriod;
  onSelectGame: (game: HitStreakGame) => void;
}) {
  return (
    <li>
      <strong>
        {entry.length}打数・{stateLabel(entry)}
      </strong>
      <span>
        {entry.start.achievedOn}〜{entry.lastAtBat.achievedOn}
      </span>
      <span>
        最後の無安打時：{entry.lastAtBat.display.teamName} ／ 対{' '}
        {entry.lastAtBat.display.opponentName}
      </span>
      <div className="streak-game-links">
        <button type="button" className="secondary" onClick={() => onSelectGame(entry.lastAtBat)}>
          最後の無安打試合
        </button>
        {entry.endedBy && (
          <>
            <span>終了：{entry.endedBy.achievedOn}</span>
            <button
              type="button"
              className="secondary"
              onClick={() => onSelectGame(entry.endedBy!)}
            >
              安打で終了した試合
            </button>
          </>
        )}
      </div>
    </li>
  );
}
export function HitlessStreakPanel({
  record,
  seasonYear,
  ownSquadId,
  onSelectGame,
}: {
  record: HitlessRecord;
  seasonYear: string;
  ownSquadId?: string;
  onSelectGame: (game: HitStreakGame) => void;
}) {
  return (
    <section aria-label="連続打数無安打（試作）">
      <h3>
        連続打数無安打 <small>試作</small>
      </h3>
      <p>
        {seasonYear}年度 ／ {record.statScope === 'farmRegular' ? '二軍' : '一軍'}・
        {record.status === 'final' ? '今季確定' : '今季ここまで'}（確定試合 {record.completedGames}{' '}
        / {record.scheduledGames}）
      </p>
      <p>
        無安打の打数を数え、安打で終了。四死球・犠飛・欠場は維持します。連続試合数ではありません。
      </p>
      {record.maximum === null ? (
        <p>確定試合での無安打の打数はまだありません。</p>
      ) : (
        <>
          <p className="memorial-result">
            <span>今季最長</span>
            <strong>
              {record.maximum}
              <small>打数</small>
            </strong>
            <span>
              同数の全{record.players.filter((p) => p.maximum === record.maximum).length}選手
            </span>
          </p>
          <div
            className="world-table memorial-table streak-table"
            tabIndex={0}
            role="region"
            aria-label="連続打数無安打の表（横スクロール）"
          >
            <table aria-label="連続打数無安打の現在と自己最長">
              <thead>
                <tr>
                  <th scope="col">選手</th>
                  <th scope="col">現在</th>
                  <th scope="col">自己最長</th>
                  <th scope="col">順位</th>
                  <th scope="col">当時の所属</th>
                  <th scope="col">期間・試合</th>
                </tr>
              </thead>
              <tbody>
                {record.players.map((player) => {
                  const best = player.longest.at(-1)!;
                  const currentOnly =
                    player.current &&
                    !player.longest.some((e) => e.recordId === player.current!.recordId);
                  return (
                    <tr key={player.playerId} data-own-club={best.lastAtBat.squadId === ownSquadId}>
                      <th scope="row">{best.lastAtBat.display.playerName}</th>
                      <td>
                        <strong>{player.current?.length ?? 0}</strong>打数
                        <span className="streak-state">
                          {player.current ? stateLabel(player.current) : '終了済み'}
                        </span>
                      </td>
                      <td>
                        <strong className="memorial-number">{player.maximum}</strong>打数
                      </td>
                      <td>{record.players.findIndex((p) => p.maximum === player.maximum) + 1}</td>
                      <td>
                        {best.lastAtBat.squadId === ownSquadId && (
                          <span className="memorial-own" aria-label="自球団">
                            自
                          </span>
                        )}
                        {best.lastAtBat.display.teamName}
                      </td>
                      <td>
                        <details className="streak-periods">
                          <summary>
                            記録の内訳（{player.longest.length + (currentOnly ? 1 : 0)}期間）
                          </summary>
                          <p>自己最長（同数の全{player.longest.length}期間）</p>
                          <ol>
                            {player.longest.map((entry) => (
                              <Period
                                key={entry.recordId}
                                entry={entry}
                                onSelectGame={onSelectGame}
                              />
                            ))}
                          </ol>
                          {currentOnly && (
                            <>
                              <p>現在の期間</p>
                              <ol>
                                <Period entry={player.current!} onSelectGame={onSelectGame} />
                              </ol>
                            </>
                          )}
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="streak-caption">
            当季に無安打の打数がある選手を掲載。同じ試合内で並んだ期間も残します。氏名・所属は直近の自己最長達成時点です。
          </p>
        </>
      )}
    </section>
  );
}
