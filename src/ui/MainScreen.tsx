import { MenuIcon, type MenuIconName } from './MenuIcon.tsx';
import { PlayerDetails } from './PlayerDetails.tsx';
import { PlayerDirectory } from './PlayerDirectory.tsx';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { WorldView } from '../world/controller.ts';
import { HomeDashboard } from './HomeDashboard.tsx';
import { AppInfo } from './AppInfo.tsx';
import './main-screen.css';

export type MainPage =
  | 'home'
  | 'schedule'
  | 'today'
  | 'formation'
  | 'team'
  | 'training'
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
  | 'training'
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
const NAV: { id: Section; name: string; page: MainPage; icon: MenuIconName }[] = [
  { id: 'home', icon: 'home', name: 'ホーム', page: 'home' },
  { id: 'schedule', icon: 'schedule', name: '日程', page: 'schedule' },
  { id: 'formation', icon: 'lineup', name: '編成', page: 'formation' },
  { id: 'team', icon: 'team', name: 'チーム', page: 'team' },
  { id: 'records', icon: 'stats', name: '成績', page: 'standings' },
  { id: 'system', icon: 'settings', name: 'システム', page: 'save' },
];
const TITLES: Record<MainPage, string> = {
  home: 'クラブハウス',
  schedule: '日程・結果',
  today: '今日の試合',
  formation: 'チーム編成',
  team: 'チーム',
  training: '育成・練習',
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
  if (page === 'training') return 'team';
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
  trainingPending,
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
  trainingPending: boolean;
  onPause: () => void;
  onToday: () => void;
  onOpenTools: () => void;
}) {
  const [card, setCard] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const navigationRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = navigationRef.current;
    if (!nav) return;
    const update = () =>
      mainRef.current?.style.setProperty(
        '--menu-clearance',
        `${Math.ceil(nav.getBoundingClientRect().height) + 24}px`,
      );
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    update();
    return () => observer.disconnect();
  }, []);
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
  const ownGames =
    view?.games.filter(
      (game) =>
        game.statScope === 'firstRegular' &&
        (game.homeSquadId === squad?.squadId || game.awaySquadId === squad?.squadId),
    ) ?? [];
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
    <div className="main-shell" data-page={page}>
      <div className="main-brand">
        <span>
          <b>BS</b> BASEBALL SIMULATOR
        </span>
        <span>
          CLUB MANAGEMENT <span className="main-preview">開発中</span>
        </span>
      </div>
      <main className="main-screen world-page" ref={mainRef}>
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
            <span
              className="save-badge"
              data-unsaved={formationPending || trainingPending || view?.unsavedChanges}
            >
              {!view
                ? '読み込み中'
                : trainingPending
                  ? '練習設定を編集中'
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
            <HomeDashboard
              view={view}
              card={card}
              setCard={setCard}
              onNavigate={onNavigate}
              onToday={onToday}
              onSelectPlayer={onSelectPlayer}
            />
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
                {page === 'schedule' ? panels.calendar : panels.results}
              </>
            )}
          </>
        )}
        {section === 'formation' && panels.formation}
        {section === 'team' && (
          <>
            {submenu([
              { page: 'team', label: '選手一覧' },
              { page: 'training', label: '育成・練習' },
            ])}
            {page === 'training' ? (
              panels.training
            ) : (
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
                  <Construction title="自由契約・退団" />
                  <Construction title="自由契約選手の獲得" />
                  <Construction title="外国人選手の獲得" />
                </div>
              </>
            )}
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
        <nav className="main-navigation" aria-label="メインメニュー" ref={navigationRef}>
          {NAV.map((item) => (
            <button
              key={item.id}
              aria-current={section === item.id ? 'page' : undefined}
              onClick={() => onNavigate(item.page)}
            >
              <MenuIcon name={item.icon} />
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
