import { ProgressEstimate } from './ProgressEstimate.tsx';
import { WinBalanceChart } from './WinBalanceChart.tsx';
import { CalendarDayMenu } from './CalendarDayMenu.tsx';
import { ClubMark } from './visuals/BaseballVisuals.tsx';
import { GAME_STATUS_LABELS } from './home-view.ts';
import { allWorldSquads, isFarmSquad } from '../world/squads.ts';
import { useEffect, useId, useState } from 'react';
import type { WorldView } from '../world/controller.ts';
import './season-calendar.css';

export function SeasonCalendar({
  view,
  scope = 'firstRegular',
  onSelect,
  selectedDate,
  canAdvance,
  onAdvanceTo,
  onOpenGame,
  onToday,
}: {
  view: WorldView;
  scope?: 'firstRegular' | 'farmRegular';
  onSelect: (date: string) => void;
  selectedDate: string;
  canAdvance: boolean;
  onAdvanceTo: (date: string) => void;
  onOpenGame: (date: string, gameId: string) => void;
  onToday: () => void;
}) {
  const [chosenMonth, setChosenMonth] = useState('');
  const [menu, setMenu] = useState<{ date: string; anchor: HTMLButtonElement } | null>(null);
  const menuId = useId();
  const hintId = useId();
  const month =
    chosenMonth ||
    (view.currentDate > view.definitions.endDate
      ? view.definitions.endDate
      : view.currentDate
    ).slice(0, 7);
  const count = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0),
  ).getUTCDate();
  const squads = allWorldSquads(view.definitions);
  const controlled =
    view.definitions.squads.find((squad) => squad.squadId === view.management?.controlledSquadId) ??
    view.definitions.squads[0];
  const ownSquad = squads.find(
    (squad) =>
      squad.team.clubId === controlled?.team.clubId &&
      isFarmSquad(view.definitions, squad.squadId) === (scope === 'farmRegular'),
  );
  // 表示だけを担当球団へ絞る。進行と日次確定には全球団の日程を渡す。
  const ownGames = view.games.filter(
    (game) =>
      game.statScope === scope &&
      (game.homeSquadId === ownSquad?.squadId || game.awaySquadId === ownSquad?.squadId),
  );
  const selection =
    selectedDate ||
    (view.currentDate > view.definitions.endDate ? view.definitions.endDate : view.currentDate);
  const selectedGames = ownGames.filter((game) => game.date === selection);
  const selectedInRange = selection >= view.currentDate && selection <= view.definitions.endDate;
  const offset = new Date(month + '-01T00:00:00Z').getUTCDay();
  const padding = (7 - ((offset + count) % 7)) % 7;
  const opponent = (game: WorldView['games'][number]) =>
    squads.find(
      (squad) =>
        squad.squadId ===
        (game.homeSquadId === ownSquad?.squadId ? game.awaySquadId : game.homeSquadId),
    );
  const resultText = (game: WorldView['games'][number]) => {
    if (!game.score) return GAME_STATUS_LABELS[game.status];
    const ownHome = game.homeSquadId === ownSquad?.squadId;
    const ours = ownHome ? game.score.home : game.score.away;
    const theirs = ownHome ? game.score.away : game.score.home;
    const label =
      game.status === 'completed'
        ? ours > theirs
          ? '勝'
          : ours < theirs
            ? '敗'
            : '分'
        : GAME_STATUS_LABELS[game.status];
    return `${label} ${ours} − ${theirs}`;
  };

  // 月・大会・進行日を変えた後に、古いセルの操作を残さない。
  useEffect(() => {
    setMenu(null);
  }, [month, scope, view.currentDate, view.worldId]);
  useEffect(() => {
    if (menu && menu.date !== selectedDate) setMenu(null);
  }, [selectedDate, menu]);

  function move(delta: number) {
    const date = new Date(month + '-01T00:00:00Z');
    date.setUTCMonth(date.getUTCMonth() + delta);
    setChosenMonth(date.toISOString().slice(0, 7));
    setMenu(null);
  }
  function openGame(gameId: string) {
    setMenu(null);
    onOpenGame(selection, gameId);
  }

  return (
    <section className="panel calendar-panel" aria-label="月別カレンダー">
      <div className="calendar-heading">
        <div>
          <h2>月別カレンダー</h2>
          <p>
            {ownSquad?.team.name ?? '担当球団未設定'} ／{' '}
            {scope === 'firstRegular' ? '一軍' : '二軍'}
          </p>
        </div>
        <button className="secondary" onClick={onToday}>
          今日の試合へ
        </button>
      </div>
      <div className="calendar-toolbar">
        <button
          className="secondary"
          onClick={() => move(-1)}
          disabled={month <= view.definitions.startDate.slice(0, 7)}
        >
          前月
        </button>
        <label>
          表示月{' '}
          <input
            type="month"
            value={month}
            min={view.definitions.startDate.slice(0, 7)}
            max={view.definitions.endDate.slice(0, 7)}
            onChange={(event) => {
              if (
                /^\d{4}-\d{2}$/.test(event.target.value) &&
                event.target.value >= view.definitions.startDate.slice(0, 7) &&
                event.target.value <= view.definitions.endDate.slice(0, 7)
              ) {
                setChosenMonth(event.target.value);
                setMenu(null);
              }
            }}
          />
        </label>
        <button
          className="secondary"
          onClick={() => move(1)}
          disabled={month >= view.definitions.endDate.slice(0, 7)}
        >
          翌月
        </button>
        <button
          className="secondary"
          onClick={() => {
            setChosenMonth('');
            setMenu(null);
            onSelect(view.currentDate);
          }}
        >
          現在月
        </button>
      </div>
      <div className="calendar-layout">
        <div className="calendar-zone">
          <p className="calendar-caption calendar-scroll-hint">
            ← 日程は左右にスクロールできます →
          </p>
          <div
            className="calendar-scroll"
            tabIndex={0}
            role="group"
            aria-label="曜日別の日程（横スクロール）"
          >
            <div className="season-calendar">
              {['日', '月', '火', '水', '木', '金', '土'].map((day) => (
                <span className="calendar-weekday" key={day} aria-hidden="true">
                  {day}
                </span>
              ))}
              {Array.from({ length: offset }, (_, index) => (
                <span className="calendar-empty" key={'empty-' + index} aria-hidden="true" />
              ))}
              {Array.from({ length: count }, (_, index) => {
                const date = month + '-' + String(index + 1).padStart(2, '0');
                if (date < view.definitions.startDate || date > view.definitions.endDate) {
                  return (
                    <span className="calendar-outside" key={date}>
                      {index + 1}
                    </span>
                  );
                }
                const games = ownGames.filter((game) => game.date === date);
                const result =
                  games.length === 1 && games[0]!.status === 'completed'
                    ? resultText(games[0]!).slice(0, 1)
                    : null;
                return (
                  <button
                    key={date}
                    className="calendar-day secondary"
                    onClick={(event) => {
                      // 狭い画面の端で選んだ日付も、セル全体が見える横位置へ寄せる。
                      const cell = event.currentTarget;
                      const viewport = cell.closest<HTMLElement>('.calendar-scroll');
                      if (viewport) {
                        const area = viewport.getBoundingClientRect();
                        const bounds = cell.getBoundingClientRect();
                        if (bounds.left < area.left + 4)
                          viewport.scrollLeft += bounds.left - area.left - 4;
                        else if (bounds.right > area.right - 4)
                          viewport.scrollLeft += bounds.right - area.right + 4;
                      }
                      onSelect(date);
                      setMenu(
                        date === view.currentDate || menu?.date === date
                          ? null
                          : { date, anchor: event.currentTarget },
                      );
                    }}
                    aria-pressed={date === selection}
                    aria-haspopup={date !== view.currentDate ? 'dialog' : undefined}
                    aria-expanded={date !== view.currentDate ? menu?.date === date : undefined}
                    aria-controls={menu?.date === date ? menuId : undefined}
                    data-result={result}
                    aria-current={date === view.currentDate ? 'date' : undefined}
                  >
                    <strong>
                      {date.slice(5)} {date === view.currentDate ? '今日' : ''}{' '}
                      {view.completedDates.includes(date) ? '確定済み' : ''}
                    </strong>
                    {games.length === 0 ? (
                      <span className="calendar-no-games">試合なし</span>
                    ) : (
                      games.map((game) => (
                        <span className="calendar-match" key={game.gameId}>
                          <span className="calendar-venue">
                            {game.homeSquadId === ownSquad?.squadId ? 'HOME' : 'VISITOR'}
                          </span>
                          <span className="calendar-opponent">
                            {opponent(game)?.team.name ?? '対戦相手未設定'}
                          </span>
                          <span className="calendar-score">{resultText(game)}</span>
                        </span>
                      ))
                    )}
                  </button>
                );
              })}
              {Array.from({ length: padding }, (_, index) => (
                <span className="calendar-empty" key={'tail-' + index} aria-hidden="true" />
              ))}
            </div>
          </div>
          <p className="calendar-caption">担当球団の試合のみ表示 ／ 得点は自球団 − 相手</p>
          {menu && (
            <CalendarDayMenu
              id={menuId}
              anchor={menu.anchor}
              date={selection}
              onClose={() => setMenu(null)}
            >
              <p>
                {selectedGames.length
                  ? selectedGames
                      .map((game) => `${opponent(game)?.team.name} ／ ${resultText(game)}`)
                      .join('・')
                  : '担当球団の試合なし'}
              </p>
              {selectedInRange ? (
                <>
                  <p id={hintId}>この日を含む全球団の試合・日次保存まで進めます。</p>
                  <ProgressEstimate view={view} date={selection} />
                  <button
                    data-primary
                    disabled={!canAdvance}
                    aria-describedby={hintId}
                    onClick={() => {
                      setMenu(null);
                      onAdvanceTo(selection);
                    }}
                  >
                    この日の終了まで進める
                  </button>
                  {!canAdvance && <p>進行中・処理中、または保存の読込待ちです。</p>}
                </>
              ) : (
                selectedGames
                  .filter((game) => game.result)
                  .map((game) => (
                    <button data-primary key={game.gameId} onClick={() => openGame(game.gameId)}>
                      試合詳細へ{selectedGames.length > 1 ? `（${opponent(game)?.team.name}）` : ''}
                    </button>
                  ))
              )}
            </CalendarDayMenu>
          )}
        </div>
        <aside className="calendar-details" aria-label="選択日の詳細" aria-live="polite">
          <span className="calendar-detail-label">
            {selection === view.currentDate
              ? '今日'
              : selection < view.currentDate
                ? '結果'
                : '予定'}{' '}
            ／ {scope === 'firstRegular' ? '一軍' : '二軍'}
          </span>
          <h3>
            <time dateTime={selection}>
              {selection.slice(5).replace('-', '月') + '日'}（
              {'日月火水木金土'[new Date(selection + 'T00:00:00Z').getUTCDay()]}）
            </time>
          </h3>
          <p className="calendar-selection-date">選択日：{selection}</p>
          {selectedGames.length === 0 ? (
            <p>担当球団の試合はありません。</p>
          ) : (
            selectedGames.map((game) => (
              <div className="calendar-detail-game" key={game.gameId}>
                <span className="calendar-venue">
                  {game.homeSquadId === ownSquad?.squadId ? 'HOME' : 'VISITOR'}
                </span>
                <div className="calendar-detail-opponent">
                  <ClubMark clubId={opponent(game)?.team.clubId} small />
                  <strong>{opponent(game)?.team.name}</strong>
                </div>
                <p className="calendar-detail-score">{resultText(game)}</p>
                {game.result && (
                  <button className="secondary" onClick={() => openGame(game.gameId)}>
                    試合詳細へ
                  </button>
                )}
              </div>
            ))
          )}
          {selection === view.currentDate && (
            <button className="secondary" onClick={onToday}>
              今日の進行を確認
            </button>
          )}
        </aside>
      </div>
      <p className="calendar-caption">
        日付の選択では進行しません。過去日は試合詳細、未来日はその日の終了までの操作を表示します。
      </p>
      <WinBalanceChart
        view={view}
        scope={scope}
        month={month}
        selectedDate={selectedDate}
        onSelect={(date) => {
          setMenu(null);
          onSelect(date);
        }}
      />
    </section>
  );
}
