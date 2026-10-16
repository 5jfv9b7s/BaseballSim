import type { WorldView } from '../world/controller.ts';
import type { MainPage } from './MainScreen.tsx';
import {
  playerLeaderboard,
  statValue,
  formatStatValue,
  STAT_METRICS,
} from '../world/leaderboard.ts';
import { ClubMark, MatchScore, UniformGraphic } from './visuals/BaseballVisuals.tsx';
import { GAME_STATUS_LABELS, homeStarter } from './home-view.ts';
import './home-dashboard.css';

const REPORTS = [
  { title: '直近の予定・結果', short: '日程' },
  { title: 'リーグ順位', short: '順位' },
  { title: '球団収支', short: '収支' },
  { title: '安打ランキング', short: '打撃' },
  { title: '奪三振ランキング', short: '投手' },
];

export function HomeDashboard({
  view,
  card,
  setCard,
  onNavigate,
  onToday,
  onSelectPlayer,
}: {
  view: WorldView | null;
  card: number;
  setCard: (index: number) => void;
  onNavigate: (page: MainPage) => void;
  onToday: () => void;
  onSelectPlayer: (id: string) => void;
}) {
  const squad =
    view?.definitions.squads.find((item) => item.squadId === view.management?.controlledSquadId) ??
    view?.definitions.squads[0];
  const squadById = (id: string) => view?.definitions.squads.find((item) => item.squadId === id);
  const clubName = (id: string) => squadById(id)?.team.name ?? id;
  const playerById = (id: string) =>
    view?.definitions.squads
      .flatMap((item) => item.players)
      .find((player) => player.playerId === id);
  const playerName = (id: string) => {
    const player = playerById(id);
    return player ? `${player.familyName} ${player.givenName}` : id;
  };
  const ownGames =
    view?.games.filter(
      (game) =>
        game.statScope === 'firstRegular' &&
        [game.awaySquadId, game.homeSquadId].includes(squad?.squadId ?? ''),
    ) ?? [];
  const today = ownGames.find((game) => game.date === view?.currentDate);
  const seasonComplete = view?.phase === 'scheduleComplete';
  const nearby = [...ownGames].sort((a, b) => a.date.localeCompare(b.date));
  const nextIndex = nearby.findIndex((game) => game.date >= (view?.currentDate ?? ''));
  const nearbyStart = nextIndex < 0 ? Math.max(0, nearby.length - 3) : Math.max(0, nextIndex - 1);
  const category = card === 4 ? 'pitching' : 'batting';
  const metric = card === 4 ? 'strikeouts' : 'hits';
  const leaderMetric = STAT_METRICS[category].find((item) => item.key === metric)!;
  const leaders =
    view && card >= 3
      ? playerLeaderboard(view.stats, {
          seasonId: view.definitions.seasonId,
          competitionId: view.definitions.competitionId,
          statScope: 'firstRegular',
          category,
          metric,
          direction: 'descending',
        }).slice(0, 3)
      : [];
  const nextGame = nearby.find(
    (game) => game.date > (view?.currentDate ?? '') && game.status === 'scheduled',
  );

  return (
    <div className="home-dashboard">
      <div className="home-overview">
        <section className="match-day" aria-label="今日の対戦">
          <header className="match-day-heading">
            <h3>{seasonComplete ? 'シーズン終了' : '今日の対戦'}</h3>
            <span>{today ? '一軍公式戦' : 'OFF DAY'}</span>
          </header>
          {today ? (
            <>
              <div className="match-day-meta">
                <time dateTime={today.date}>{today.date.slice(5).replace('-', '/')}</time>
                <span>
                  開始時刻 <b>未設定</b>
                </span>
                <span>
                  球場 <b>未設定</b>
                </span>
              </div>
              <div className="match-teams">
                {(['away', 'home'] as const).map((side) => {
                  const team = squadById(side === 'away' ? today.awaySquadId : today.homeSquadId);
                  return (
                    <div className={`match-team match-team-${side}`} key={side}>
                      <div className="match-side">
                        {side === 'away' ? 'VISITOR' : 'HOME'}
                        {team?.squadId === squad?.squadId && <span>自球団</span>}
                      </div>
                      <ClubMark clubId={team?.team.clubId} />
                      <h4>{team?.team.name ?? '球団未設定'}</h4>
                    </div>
                  );
                })}
                <div className="match-board">
                  <span className="game-state" data-state={today.status}>
                    {GAME_STATUS_LABELS[today.status]}
                  </span>
                  <MatchScore
                    away={today.score?.away ?? null}
                    home={today.score?.home ?? null}
                    awayName={clubName(today.awaySquadId)}
                    homeName={clubName(today.homeSquadId)}
                  />
                </div>
              </div>
              <div className="match-starters">
                {(['away', 'home'] as const).map((side) => {
                  const team = squadById(side === 'away' ? today.awaySquadId : today.homeSquadId);
                  const starter = homeStarter(
                    today,
                    side,
                    squad?.squadId,
                    view?.registrationPreview ?? null,
                  );
                  return (
                    <div className="match-starter" key={side} data-side={side}>
                      <UniformGraphic clubId={team?.team.clubId} />
                      <div>
                        <span className="starter-label">{starter.label}</span>
                        {starter.playerId && playerById(starter.playerId) ? (
                          <button
                            className="starter-name"
                            onClick={() => onSelectPlayer(starter.playerId!)}
                            aria-label={`${playerName(starter.playerId)}の選手詳細`}
                          >
                            {playerName(starter.playerId)} <span aria-hidden="true">›</span>
                          </button>
                        ) : (
                          <strong className="starter-unset">—</strong>
                        )}
                        <span className="jersey-note">背番号 未登録</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="match-rest">
              <ClubMark clubId={squad?.team.clubId} />
              <h4>
                {!view
                  ? '日程を読み込んでいます'
                  : seasonComplete
                    ? '今季の日程が終了しました'
                    : '今日は一軍の試合がありません'}
              </h4>
              {nextGame && (
                <p>
                  次戦 <time>{nextGame.date.slice(5).replace('-', '/')}</time> ／{' '}
                  {clubName(
                    nextGame.homeSquadId === squad?.squadId
                      ? nextGame.awaySquadId
                      : nextGame.homeSquadId,
                  )}
                </p>
              )}
            </div>
          )}
          <div className="match-action-area">
            <button
              className="match-primary-action"
              disabled={!view}
              onClick={seasonComplete ? () => onNavigate('summary') : onToday}
            >
              {seasonComplete
                ? 'シーズン総括へ'
                : today
                  ? today.status === 'completed'
                    ? '今日の結果・進行へ'
                    : '今日の試合へ'
                  : '翌日への進行を確認'}
              <span aria-hidden="true">→</span>
            </button>
            <p>{seasonComplete ? '確定したシーズンの記録' : '進行画面で開始・一時停止'}</p>
          </div>
        </section>

        <section
          className="club-report"
          aria-label="球団情報カード"
          aria-roledescription="カルーセル"
        >
          <header className="club-report-heading">
            <span>球団レポート</span>
            <span>{String(card + 1).padStart(2, '0')} / 05</span>
          </header>
          <div className="report-selectors" role="group" aria-label="表示する球団情報">
            {REPORTS.map((report, index) => (
              <button
                key={report.title}
                aria-label={`${report.title}のカード`}
                aria-pressed={card === index}
                onClick={() => setCard(index)}
              >
                {report.short}
              </button>
            ))}
          </div>
          <div className="club-report-body" aria-live="polite">
            <h3>{REPORTS[card]!.title}</h3>
            {card === 0 && (
              <>
                <table className="home-table" aria-label="直近の予定・結果">
                  <thead>
                    <tr>
                      <th scope="col">日付</th>
                      <th scope="col">対戦相手</th>
                      <th scope="col">結果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nearby.slice(nearbyStart, nearbyStart + 3).map((game) => {
                      const ownHome = game.homeSquadId === squad?.squadId;
                      const opponent = squadById(ownHome ? game.awaySquadId : game.homeSquadId);
                      return (
                        <tr key={game.gameId} data-today={game.date === view?.currentDate}>
                          <th scope="row">
                            <time dateTime={game.date}>{game.date.slice(5).replace('-', '/')}</time>
                            {game.date === view?.currentDate && <small>今日</small>}
                          </th>
                          <td>
                            <div className="report-club">
                              <ClubMark clubId={opponent?.team.clubId} small />
                              <span>
                                {opponent?.team.name}
                                <small>
                                  {ownHome ? 'HOME' : 'VISITOR'} / {GAME_STATUS_LABELS[game.status]}
                                </small>
                              </span>
                            </div>
                          </td>
                          <td className="report-number">
                            {game.score ? `${game.score.away}−${game.score.home}` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {nearby.length === 0 && <p className="report-empty">日程はまだありません。</p>}
                <p className="report-caption">スコア：ビジター − ホーム</p>
                <button className="report-link" onClick={() => onNavigate('schedule')}>
                  日程・結果を見る →
                </button>
              </>
            )}
            {card === 1 && (
              <>
                <table className="home-table" aria-label="リーグ順位">
                  <thead>
                    <tr>
                      <th scope="col">順位</th>
                      <th scope="col">球団</th>
                      <th scope="col">勝</th>
                      <th scope="col">敗</th>
                      <th scope="col">分</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view?.standings.map((row) => (
                      <tr key={row.squadId} data-own={row.squadId === squad?.squadId}>
                        <th scope="row" className="report-number">
                          {row.rank ?? '—'}
                        </th>
                        <td>
                          <div className="report-club">
                            <ClubMark clubId={squadById(row.squadId)?.team.clubId} small />
                            <span>
                              {clubName(row.squadId)}
                              {row.squadId === squad?.squadId && <small>自球団</small>}
                            </span>
                          </div>
                        </td>
                        <td className="report-number">{row.wins}</td>
                        <td className="report-number">{row.losses}</td>
                        <td className="report-number">{row.draws}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="report-caption">一軍・確定試合</p>
                <button className="report-link" onClick={() => onNavigate('standings')}>
                  順位表を見る →
                </button>
              </>
            )}
            {card === 2 && (
              <div className="report-unavailable">
                <button disabled>
                  収支サマリー <span>工事中</span>
                </button>
                <p>財務モデルの実装後に表示します。</p>
              </div>
            )}
            {card >= 3 && (
              <>
                <table className="home-table" aria-label={REPORTS[card]!.title}>
                  <thead>
                    <tr>
                      <th scope="col">順位</th>
                      <th scope="col">選手</th>
                      <th scope="col">{card === 4 ? '奪三振' : '安打'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaders.map((row) => (
                      <tr key={row.playerId}>
                        <th scope="row" className="report-number">
                          {row.rank ?? '—'}
                        </th>
                        <td>
                          <button
                            className="report-player"
                            onClick={() => onSelectPlayer(row.playerId)}
                          >
                            {playerName(row.playerId)} <span aria-hidden="true">›</span>
                          </button>
                        </td>
                        <td className="report-number">
                          {formatStatValue(statValue(row, leaderMetric), leaderMetric)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {leaders.length === 0 && (
                  <p className="report-empty">確定した試合の成績がまだありません。</p>
                )}
                <p className="report-caption">一軍・確定試合／同順位を含む先頭3名</p>
                <button className="report-link" onClick={() => onNavigate('stats')}>
                  個人成績を見る →
                </button>
              </>
            )}
          </div>
          <div className="report-pagination">
            <button aria-label="前の情報カード" onClick={() => setCard((card + 4) % 5)}>
              ← 前へ
            </button>
            <span>
              {card + 1} / {REPORTS.length}
            </span>
            <button aria-label="次の情報カード" onClick={() => setCard((card + 1) % 5)}>
              次へ →
            </button>
          </div>
        </section>
      </div>
      <details className="home-display-notes">
        <summary>日程・表示について</summary>
        <p>
          {view?.definitions.name ?? '日程を読み込み中'}
          。球団の文字マーク・配色・ユニフォームは識別用の簡略図です。
        </p>
        <p>
          先発候補は現在の起用設定による予測です。試合開始時に確定します。球場・開始時刻・背番号はデータ未登録です。育成・補強などの未実装機能は「工事中」と表示しています。
        </p>
      </details>
    </div>
  );
}
