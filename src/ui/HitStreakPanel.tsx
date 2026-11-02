import type { HitStreakEntry, HitStreakGame, HitStreakRecord } from '../world/hit-streaks.ts';
import './memorial.css';

const stateLabel = (entry: HitStreakEntry) =>
  entry.status === 'ongoing' ? '継続中' : entry.status === 'ended' ? '終了済み' : '今季終了時点';

function Period({
  entry,
  onSelectGame,
}: {
  entry: HitStreakEntry;
  onSelectGame: (game: HitStreakGame) => void;
}) {
  return (
    <li>
      <strong>
        {entry.length}試合・{stateLabel(entry)}
      </strong>
      <span>
        <time dateTime={entry.start.achievedOn}>{entry.start.achievedOn}</time>〜
        <time dateTime={entry.lastHit.achievedOn}>{entry.lastHit.achievedOn}</time>
      </span>
      <span>
        最後の安打時：{entry.lastHit.display.teamName} ／ 対 {entry.lastHit.display.opponentName}
      </span>
      <div className="streak-game-links">
        <button
          type="button"
          className="secondary"
          aria-label={`${entry.lastHit.achievedOn} ${entry.lastHit.display.playerName}の最後の安打試合を表示`}
          onClick={() => onSelectGame(entry.lastHit)}
        >
          最後の安打試合
        </button>
        {entry.endedBy && (
          <>
            <span>
              終了：<time dateTime={entry.endedBy.achievedOn}>{entry.endedBy.achievedOn}</time>
            </span>
            <button
              type="button"
              className="secondary"
              aria-label={`${entry.endedBy.achievedOn} ${entry.endedBy.display.playerName}の記録が途切れた試合を表示`}
              onClick={() => onSelectGame(entry.endedBy!)}
            >
              途切れた試合
            </button>
          </>
        )}
      </div>
    </li>
  );
}

/** 現在・自己最長の全同率期間を分ける。開閉・結果選択でWorkerへ指示しない。 */
export function HitStreakPanel({
  record,
  seasonYear,
  ownSquadId,
  onSelectGame,
}: {
  record: HitStreakRecord;
  seasonYear: string;
  ownSquadId?: string;
  onSelectGame: (game: HitStreakGame) => void;
}) {
  return (
    <section aria-label="連続試合安打（試作）">
      <h3>
        連続試合安打 <small>試作</small>
      </h3>
      <p>
        {seasonYear}年度 ／ {record.statScope === 'firstRegular' ? '一軍' : '二軍'}・
        {record.status === 'final' ? '今季確定' : '今季ここまで'}
        （確定試合 {record.completedGames} / {record.scheduledGames}）
      </p>
      <p>
        試作の算定：欠場・打数0は維持、打数ありで無安打なら終了。1試合1安打以上で1試合増えます。
      </p>
      {record.maximum === null ? (
        <p>確定試合での安打記録はまだありません。</p>
      ) : (
        <>
          <p className="memorial-result">
            <span>今季最長</span>
            <strong>
              {record.maximum}
              <small>試合</small>
            </strong>
            <span>
              同数の全{record.players.filter((p) => p.maximum === record.maximum).length}選手
            </span>
          </p>
          <div
            className="world-table memorial-table streak-table"
            tabIndex={0}
            role="region"
            aria-label="連続試合安打の表（横スクロール）"
          >
            <table aria-label="連続試合安打の現在と自己最長">
              <thead>
                <tr>
                  <th scope="col">選手</th>
                  <th scope="col">現在</th>
                  <th scope="col">自己最長</th>
                  <th scope="col">順位</th>
                  <th scope="col">当時の所属</th>
                  <th scope="col">達成期間・試合</th>
                </tr>
              </thead>
              <tbody>
                {record.players.map((player) => {
                  const best = player.longest.at(-1)!;
                  const currentOnly =
                    player.current &&
                    !player.longest.some((e) => e.recordId === player.current!.recordId);
                  return (
                    <tr key={player.playerId} data-own-club={best.lastHit.squadId === ownSquadId}>
                      <th scope="row">{best.lastHit.display.playerName}</th>
                      <td>
                        <strong>{player.current?.length ?? 0}</strong>試合
                        <span className="streak-state">
                          {player.current ? stateLabel(player.current) : '終了済み'}
                        </span>
                      </td>
                      <td>
                        <strong className="memorial-number">{player.maximum}</strong>試合
                      </td>
                      <td>{record.players.findIndex((p) => p.maximum === player.maximum) + 1}</td>
                      <td>
                        {best.lastHit.squadId === ownSquadId && (
                          <span className="memorial-own" aria-label="自球団">
                            自
                          </span>
                        )}
                        {best.lastHit.display.teamName}
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
            当季に安打のある選手を掲載。氏名・所属は直近の自己最長達成時点です。今季終了時点の記録を、無安打で途切れた記録と分けています。
          </p>
        </>
      )}
    </section>
  );
}
