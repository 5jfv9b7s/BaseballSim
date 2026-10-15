import { ProgressEstimate } from './ProgressEstimate.tsx';
import { WinBalanceChart } from './WinBalanceChart.tsx';
import { allWorldSquads, isFarmSquad } from '../world/squads.ts';
import { useState } from 'react';
import type { WorldView } from '../world/controller.ts';

export function SeasonCalendar({
  view,
  scope = 'firstRegular',
  onSelect,
  selectedDate,
  canAdvance,
  onAdvanceTo,
}: {
  view: WorldView;
  scope?: 'firstRegular' | 'farmRegular';
  onSelect: (date: string) => void;
  selectedDate: string;
  canAdvance: boolean;
  onAdvanceTo: (date: string) => void;
}) {
  const [chosenMonth, setChosenMonth] = useState('');
  const month =
    chosenMonth ||
    (view.currentDate > view.definitions.endDate
      ? view.definitions.endDate
      : view.currentDate
    ).slice(0, 7);
  const count = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0),
  ).getUTCDate();
  const names = new Map(
    allWorldSquads(view.definitions).map((squad) => [squad.squadId, squad.team.name]),
  );
  const selection =
    selectedDate ||
    (view.currentDate > view.definitions.endDate ? view.definitions.endDate : view.currentDate);
  const selectedInRange = selection >= view.currentDate && selection <= view.definitions.endDate;
  const squads = allWorldSquads(view.definitions);
  const ownClubId = view.definitions.squads.find(
    (squad) => squad.squadId === view.management?.controlledSquadId,
  )?.team.clubId;
  const ownSquadId = squads.find(
    (squad) =>
      squad.team.clubId === ownClubId &&
      isFarmSquad(view.definitions, squad.squadId) === (scope === 'farmRegular'),
  )?.squadId;
  const offset = new Date(month + '-01T00:00:00Z').getUTCDay();
  const advanceHint = !selectedInRange
    ? '確定済みの日です。下の試合結果を確認できます。'
    : !canAdvance
      ? '進行中・処理中、または保存の読込待ちのため開始できません。画面上部の状態を確認してください。'
      : '選択だけでは進行しません。この日の全試合・日次確定・自動保存まで進めます。';

  function move(delta: number) {
    const date = new Date(month + '-01T00:00:00Z');
    date.setUTCMonth(date.getUTCMonth() + delta);
    setChosenMonth(date.toISOString().slice(0, 7));
  }
  return (
    <section className="panel" aria-label="月別カレンダー">
      <h2>月別カレンダー</h2>
      <div className="world-controls">
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
              )
                setChosenMonth(event.target.value);
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
        <button className="secondary" onClick={() => setChosenMonth('')}>
          現在月
        </button>
      </div>
      <div
        className="calendar-selection"
        aria-label="選択日の進行"
        data-selected={!!selectedDate && selectedInRange}
      >
        <div className="world-controls">
          <strong>選択日：{selection}</strong>
          {selectedDate && (
            <button className="secondary" onClick={() => onSelect('')}>
              日付の選択を解除
            </button>
          )}
        </div>
        <p id="calendar-advance-hint">{advanceHint}</p>
        {selectedInRange && (
          <>
            <ProgressEstimate view={view} date={selection} />
            <button
              disabled={!canAdvance}
              aria-describedby="calendar-advance-hint"
              onClick={() => onAdvanceTo(selection)}
            >
              この日の終了まで進める
            </button>
          </>
        )}
      </div>
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
            const games = view.games.filter(
              (game) => game.date === date && game.statScope === scope,
            );
            const ownGame = games.find(
              (game) => game.homeSquadId === ownSquadId || game.awaySquadId === ownSquadId,
            );
            const ownHome = ownGame?.homeSquadId === ownSquadId;
            const score = ownGame?.status === 'completed' ? ownGame.score : undefined;
            const difference = score
              ? ownHome
                ? score.home - score.away
                : score.away - score.home
              : null;
            const result =
              difference === null ? null : difference > 0 ? '勝' : difference < 0 ? '敗' : '分';
            return (
              <button
                key={date}
                className="calendar-day secondary"
                onClick={() => onSelect(date)}
                aria-pressed={date === selection}
                data-result={result}
                aria-current={date === view.currentDate ? 'date' : undefined}
              >
                <strong>
                  {date.slice(5)} {date === view.currentDate ? '今日' : ''}{' '}
                  {view.completedDates.includes(date) ? '確定済み' : ''}
                </strong>
                {ownGame && (
                  <span className="calendar-venue">
                    {ownHome ? 'HOME' : 'VISITOR'}
                    {result && `・自球団 ${result}`}
                  </span>
                )}
                {games.length === 0 ? (
                  <span className="calendar-no-games">試合なし</span>
                ) : (
                  games.map((game) => (
                    <span key={game.gameId}>
                      {names.get(game.awaySquadId)}{' '}
                      {game.score ? game.score.away + ' − ' + game.score.home : '対'}{' '}
                      {names.get(game.homeSquadId)}
                    </span>
                  ))
                )}
              </button>
            );
          })}
        </div>
      </div>
      <p className="hint">
        日付を選ぶだけでは進行しません。その日の予定・結果を下の試合結果欄に表示します。
      </p>
      <WinBalanceChart
        view={view}
        scope={scope}
        month={month}
        selectedDate={selectedDate}
        onSelect={onSelect}
      />
    </section>
  );
}
