import { PlayerDetails } from './PlayerDetails.tsx';
import { PlayerDirectory } from './PlayerDirectory.tsx';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { WorldView } from '../world/controller.ts';
import {
  playerLeaderboard,
  statValue,
  formatStatValue,
  STAT_METRICS,
} from '../world/leaderboard.ts';
import { AppInfo } from './AppInfo.tsx';
import './main-screen.css';

export type MainPage =
  | 'home'
  | 'schedule'
  | 'today'
  | 'formation'
  | 'team'
  | 'standings'
  | 'stats'
  | 'memorial'
  | 'summary'
  | 'results'
  | 'save'
  | 'new'
  | 'help';
type Section = 'home' | 'schedule' | 'formation' | 'team' | 'records' | 'system';
type PanelName =
  | 'progress'
  | 'competition'
  | 'calendar'
  | 'summary'
  | 'management'
  | 'formation'
  | 'standings'
  | 'memorial'
  | 'results'
  | 'stats'
  | 'storage'
  | 'setup';
const NAV: { id: Section; name: string; page: MainPage }[] = [
  { id: 'home', name: 'ホーム', page: 'home' },
  { id: 'schedule', name: '日程', page: 'schedule' },
  { id: 'formation', name: '編成', page: 'formation' },
  { id: 'team', name: 'チーム', page: 'team' },
  { id: 'records', name: '成績', page: 'standings' },
  { id: 'system', name: 'システム', page: 'save' },
];
const TITLES: Record<MainPage, string> = {
  home: 'クラブハウス',
  schedule: '日程・結果',
  today: '今日の試合',
  formation: 'チーム編成',
  team: 'チーム',
  standings: 'チーム成績',
  stats: '個人成績',
  memorial: 'メモリアル',
  summary: 'シーズン総括',
  results: '試合結果',
  save: 'セーブ・再開',
  new: '新規プレイ',
  help: 'ヘルプ',
};

function sectionOf(page: MainPage): Section {
  if (['schedule', 'today', 'results'].includes(page)) return 'schedule';
  if (['standings', 'stats', 'memorial', 'summary'].includes(page)) return 'records';
  if (['save', 'new', 'help'].includes(page)) return 'system';
  return page as Section;
}

function Construction({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="construction">
      <button disabled>
        {title}
        <span>工事中</span>
      </button>
      {children && <p>{children}</p>}
    </div>
  );
}

export function MainScreen({
  view,
  selectedPlayer,
  onSelectPlayer,
  page,
  onNavigate,
  panels,
  busy,
  running,
  error,
  notice,
  hasSavedPlays,
  formationPending,
  onPause,
  onToday,
  onOpenTools,
}: {
  view: WorldView | null;
  selectedPlayer: string;
  onSelectPlayer: (id: string) => void;
  page: MainPage;
  onNavigate: (page: MainPage) => void;
  panels: Record<PanelName, ReactNode>;
  busy: boolean;
  running: boolean;
  error: string;
  notice: ReactNode;
  hasSavedPlays: boolean;
  formationPending: boolean;
  onPause: () => void;
  onToday: () => void;
  onOpenTools: () => void;
}) {
  const [card, setCard] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousPage = useRef(page);

  useEffect(() => {
    if (previousPage.current !== page) {
      headingRef.current?.focus({ preventScroll: true });
      headingRef.current?.scrollIntoView({ block: 'start' });
      previousPage.current = page;
    }
  }, [page]);
  const section = sectionOf(page);
  const squad =
    view?.definitions.squads.find((item) => item.squadId === view.management?.controlledSquadId) ??
    view?.definitions.squads[0];
  const standing = view?.standings.find((item) => item.squadId === squad?.squadId);
  const clubName = (id: string) =>
    view?.definitions.squads.find((item) => item.squadId === id)?.team.name ?? id;
  const ownGames =
    view?.games.filter(
      (game) =>
        game.statScope === 'firstRegular' &&
        (game.homeSquadId === squad?.squadId || game.awaySquadId === squad?.squadId),
    ) ?? [];
  const today = ownGames.find((game) => game.date === view?.currentDate);
  const home = today?.homeSquadId === squad?.squadId;
  const completed = ownGames.filter((game) => game.status === 'completed').length;
  const total = ownGames.length;
  const percent = total ? Math.round((completed / total) * 100) : 0;
  const date = view
    ? new Intl.DateTimeFormat('ja-JP', {
        month: 'long',
        day: 'numeric',
        weekday: 'short',
        timeZone: 'UTC',
      }).format(new Date(view.currentDate + 'T00:00:00Z'))
    : '準備中';
  const playerName = (id: string) => {
    const player = view?.definitions.squads
      .flatMap((item) => item.players)
      .find((player) => player.playerId === id);
    return player ? `${player.familyName} ${player.givenName}` : id;
  };
  const starters = today?.startingPitchers;
  const cardTitles = [
    '直近の予定・結果',
    'リーグ順位',
    '球団収支',
    '安打ランキング',
    '奪三振ランキング',
  ];
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
  const nearby = [...ownGames].sort((a, b) => a.date.localeCompare(b.date));
  const nextIndex = nearby.findIndex((game) => game.date >= (view?.currentDate ?? ''));
  const nearbyStart = nextIndex < 0 ? Math.max(0, nearby.length - 3) : Math.max(0, nextIndex - 1);

  function submenu(items: { page: MainPage; label: string }[]) {
    return (
      <nav className="main-subnav" aria-label="サブメニュー">
        {items.map((item) => (
          <button
            key={item.page}
            aria-current={page === item.page ? 'page' : undefined}
            onClick={() => onNavigate(item.page)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    );
  }

  return (
    <div className="main-shell">
      <div className="main-brand">
        <span>
          <b>BS</b> BASEBALL SIMULATOR
        </span>
        <span>
          CLUB MANAGEMENT <span className="main-preview">開発中</span>
        </span>
      </div>
      <main className="main-screen world-page">
        <header className="club-header">
          <div className="club-date">
            <span>{view?.currentDate.slice(0, 4) ?? '—'} SEASON</span>
            <time dateTime={view?.currentDate} data-testid="main-date">
              {date}
            </time>
          </div>
          <div className="club-heading">
            <p>MY CLUB / 担当球団</p>
            <h1>{squad?.team.name ?? '球団を準備しています'}</h1>
            <div className="club-record">
              <b>{standing?.wins ?? 0}</b> 勝 <b>{standing?.losses ?? 0}</b> 敗{' '}
              <b>{standing?.draws ?? 0}</b> 分 <span>一軍公式戦</span>
            </div>
          </div>
          <div className="season-progress">
            <span>
              シーズン進行 <b>{percent}%</b>
            </span>
            <progress value={completed} max={total || 1} aria-label="担当球団の一軍試合消化" />
            <small>
              {completed} / {total} 試合終了
            </small>
          </div>
        </header>
        {(running || busy || error || notice) && (
          <div
            className="main-status"
            data-active={busy || running || Boolean(error)}
            aria-label="進行と保存の状態"
          >
            {notice || (busy && <p role="status">処理しています…</p>)}
            {running && <button onClick={onPause}>進行を一時停止</button>}
            {error && <p role="alert">{error}</p>}
          </div>
        )}
        <div className="main-page-title">
          <h2 ref={headingRef} tabIndex={-1}>
            {TITLES[page]}
          </h2>
          <div className="save-indicator">
            <span className="save-badge" data-unsaved={formationPending || view?.unsavedChanges}>
              {!view
                ? '読み込み中'
                : formationPending
                  ? '編成を編集中'
                  : view.unsavedChanges
                    ? '未保存の変更あり'
                    : '保存済み'}
            </span>
            {page !== 'save' && (
              <button className="secondary" disabled={!view} onClick={() => onNavigate('save')}>
                セーブ画面を開く
              </button>
            )}
          </div>
        </div>
        {page === 'home' && (
          <>
            {hasSavedPlays && (
              <div className="resume-banner">
                <span>保存したプレイがあります。</span>
                <button onClick={() => onNavigate('save')}>セーブから再開 →</button>
              </div>
            )}
            <div className="home-grid">
              <section className="today-card" aria-label="今日の対戦">
                <div className="today-kicker">
                  <span>TODAY’S GAME</span>
                  <span className="venue-badge">
                    {today ? (home ? 'HOME' : 'VISITOR') : 'OFF DAY'}
                  </span>
                </div>
                <div className="field-mark" aria-hidden="true">
                  <span />
                  <i />
                </div>
                {today ? (
                  <>
                    <p className="match-status">
                      {today.status === 'completed'
                        ? '試合終了'
                        : today.status === 'playing'
                          ? '進行中'
                          : today.status === 'aborted'
                            ? '異常停止'
                            : '一軍公式戦'}
                    </p>
                    <div className="home-matchup">
                      <div>
                        <small>自球団</small>
                        <h3>{squad?.team.name}</h3>
                      </div>
                      <strong>
                        {today.score
                          ? `${home ? today.score.home : today.score.away} : ${home ? today.score.away : today.score.home}`
                          : 'VS'}
                      </strong>
                      <div>
                        <small>対戦相手</small>
                        <h3>{clubName(home ? today.awaySquadId : today.homeSquadId)}</h3>
                      </div>
                    </div>
                    <div className="starter-row">
                      <span>先発投手</span>
                      <p>
                        {starters
                          ? `${playerName(home ? starters.home : starters.away)} ／ ${playerName(home ? starters.away : starters.home)}`
                          : '試合開始時に確定'}
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="off-day">
                    <p>
                      {view?.phase === 'scheduleComplete' ? 'SEASON COMPLETE' : 'REST & PREPARE'}
                    </p>
                    <h3>
                      {view?.phase === 'scheduleComplete'
                        ? '今季の日程が終了しました'
                        : '今日は一軍の試合がありません'}
                    </h3>
                    <p>成績や選手を確認して、次の一日に備えましょう。</p>
                  </div>
                )}
                <button
                  className="today-action"
                  disabled={!view}
                  onClick={
                    view?.phase === 'scheduleComplete' ? () => onNavigate('summary') : onToday
                  }
                >
                  {view?.phase === 'scheduleComplete'
                    ? 'シーズン総括へ'
                    : today
                      ? today.status === 'completed'
                        ? '今日の結果・進行へ'
                        : '今日の試合へ'
                      : '翌日への進行を確認'}
                  <span>→</span>
                </button>
                <p className="today-note">
                  {view?.phase === 'scheduleComplete'
                    ? '確定したシーズンの記録を確認できます。'
                    : '進行画面を開きます。試合を始めるには、次の画面で「1日を自動進行」を押してください。'}
                </p>
              </section>
              <section
                className="home-info"
                aria-label="球団情報カード"
                aria-roledescription="カルーセル"
              >
                <div className="info-heading">
                  <span>CLUB REPORT</span>
                  <span>{String(card + 1).padStart(2, '0')} / 05</span>
                </div>
                <div className="info-body" aria-live="polite">
                  <h3>{cardTitles[card]}</h3>
                  {card === 0 && (
                    <>
                      <ul className="nearby-games">
                        {nearby.slice(nearbyStart, nearbyStart + 3).map((game) => (
                          <li key={game.gameId}>
                            <time>{game.date.slice(5).replace('-', '/')}</time>
                            <span>
                              {clubName(
                                game.homeSquadId === squad?.squadId
                                  ? game.awaySquadId
                                  : game.homeSquadId,
                              )}
                              <small>
                                {game.homeSquadId === squad?.squadId ? 'HOME' : 'VISITOR'} /{' '}
                                {game.status === 'completed' ? '終了' : '予定'}
                              </small>
                            </span>
                            <b>{game.score ? `${game.score.away} − ${game.score.home}` : '—'}</b>
                          </li>
                        ))}
                      </ul>
                      <p className="hint">スコアはビジター − ホームの順です。</p>
                      <button className="text-action" onClick={() => onNavigate('schedule')}>
                        日程・結果を見る →
                      </button>
                    </>
                  )}
                  {card === 1 && (
                    <>
                      <ol className="mini-standing">
                        {view?.standings.map((row) => (
                          <li key={row.squadId} data-own={row.squadId === squad?.squadId}>
                            <b>{row.rank ?? '—'}</b>
                            <span>{clubName(row.squadId)}</span>
                            <small>
                              {row.wins}勝 {row.losses}敗 {row.draws}分
                            </small>
                          </li>
                        ))}
                      </ol>
                      <button className="text-action" onClick={() => onNavigate('standings')}>
                        順位表を見る →
                      </button>
                    </>
                  )}
                  {card === 2 && (
                    <Construction title="収支サマリー">
                      財務モデルは未実装です。予算・収支は実装後に表示します。
                    </Construction>
                  )}
                  {card >= 3 && (
                    <>
                      <ol className="mini-standing">
                        {leaders.map((row) => (
                          <li key={row.playerId}>
                            <b>{row.rank ?? '—'}</b>
                            <span>{playerName(row.playerId)}</span>
                            <strong>
                              {formatStatValue(statValue(row, leaderMetric), leaderMetric)}
                            </strong>
                          </li>
                        ))}
                      </ol>
                      {leaders.length === 0 && (
                        <p className="empty-message">確定した試合の成績がまだありません。</p>
                      )}
                      <p className="hint">一軍・確定試合のみ。同順位を含む先頭3名。</p>
                      <button className="text-action" onClick={() => onNavigate('stats')}>
                        個人成績を見る →
                      </button>
                    </>
                  )}
                </div>
                <div className="card-navigation">
                  <button aria-label="前の情報カード" onClick={() => setCard((card + 4) % 5)}>
                    ←
                  </button>
                  <div>
                    {cardTitles.map((title, index) => (
                      <button
                        key={title}
                        aria-label={`${title}のカード`}
                        aria-pressed={card === index}
                        onClick={() => setCard(index)}
                      >
                        <span />
                      </button>
                    ))}
                  </div>
                  <button aria-label="次の情報カード" onClick={() => setCard((card + 1) % 5)}>
                    →
                  </button>
                </div>
              </section>
            </div>
            <aside className="home-notes">
              <span>INFORMATION</span>
              <p>
                {view?.definitions.name ?? '日程を読み込んでいます。'}
                。育成・補強など準備中の機能には「工事中」を表示しています。
              </p>
            </aside>
          </>
        )}
        {section === 'schedule' && (
          <>
            {submenu([
              { page: 'schedule', label: 'カレンダー' },
              { page: 'today', label: '今日の進行' },
              { page: 'results', label: '試合結果' },
            ])}
            {page === 'today' ? (
              <>
                {panels.progress}
                {panels.results}
                <Construction title="試合前のベンチ編集">
                  本画面の試合前編集は準備中です。既存の編集は開発用画面から利用できます。
                </Construction>
              </>
            ) : (
              <>
                {panels.competition}
                {page === 'schedule' && panels.calendar}
                {panels.results}
              </>
            )}
          </>
        )}
        {section === 'formation' && panels.formation}
        {section === 'team' && (
          <>
            {view && (
              <PlayerDirectory
                key={view.localWorldId + view.worldId}
                view={view}
                onSelect={onSelectPlayer}
              />
            )}
            <div className="feature-grid">
              <Construction title="トレード" />
              <Construction title="育成・練習" />
              <Construction title="自由契約・退団" />
              <Construction title="自由契約選手の獲得" />
              <Construction title="外国人選手の獲得" />
            </div>
          </>
        )}
        {section === 'records' && (
          <>
            {submenu([
              { page: 'standings', label: 'チーム成績' },
              { page: 'stats', label: '個人成績' },
              { page: 'memorial', label: 'メモリアル' },
              { page: 'summary', label: 'シーズン総括' },
            ])}
            {panels.competition}
            {page === 'standings' && panels.standings}
            {page === 'stats' && panels.stats}
            {page === 'memorial' && panels.memorial}
            {page === 'summary' && (
              <>
                {panels.summary || <p>全日程を終えると、確定した記録を表示します。</p>}
                <Construction title="表彰・ポストシーズン" />
              </>
            )}
          </>
        )}
        {section === 'system' && (
          <>
            {submenu([
              { page: 'save', label: 'セーブ・再開' },
              { page: 'new', label: '新規プレイ' },
              { page: 'help', label: 'ヘルプ' },
            ])}
            {page === 'save' && panels.storage}
            {page === 'new' && panels.setup}
            {page === 'help' && (
              <section className="panel">
                <h3>遊び方</h3>
                <p>
                  ホームの「今日の試合へ」で進行画面を開き、「1日を自動進行」を押すと、一軍・二軍の全試合を処理し、翌日の状態を自動保存します。日程やカードを見るだけでは進行しません。
                </p>
                <p>
                  保存したプレイは「セーブ・再開」の「保存済みプレイ」から選んで読み込みます。「新規プレイ」で短期または年間日程を選ぶと、既存の保存を残して別に作成し、初回保存後にホームを開きます。
                </p>
                <p>
                  正式v1.0に向けて開発中です。架空4球団・試作規則を使用しており、係数は未校正です。
                </p>
                <AppInfo />
              </section>
            )}
            <div className="feature-grid">
              <Construction title="アイテム" />
              <Construction title="ゲーム設定" />
              <Construction title="問い合わせ" />
            </div>
          </>
        )}
        <nav className="main-navigation" aria-label="メインメニュー">
          {NAV.map((item) => (
            <button
              key={item.id}
              aria-current={section === item.id ? 'page' : undefined}
              onClick={() => onNavigate(item.page)}
            >
              {item.name}
            </button>
          ))}
        </nav>
        <footer className="main-footer">
          <span>
            BASEBALL SIMULATOR <span>／ 架空リーグ・開発中</span>
          </span>
          <button disabled={busy || running} onClick={onOpenTools}>
            シミュレーション開発ツール ↗
          </button>
        </footer>
        {view && (
          <PlayerDetails view={view} playerId={selectedPlayer} onClose={() => onSelectPlayer('')} />
        )}
      </main>
    </div>
  );
}
