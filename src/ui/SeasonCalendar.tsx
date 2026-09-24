import { useState } from 'react';
import type { WorldView } from '../world/controller.ts';

export function SeasonCalendar({
  view,
  onSelect,
}: {
  view: WorldView;
  onSelect: (date: string) => void;
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
  const names = new Map(view.definitions.squads.map((squad) => [squad.squadId, squad.team.name]));
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
      <div className="season-calendar">
        {Array.from({ length: count }, (_, index) => {
          const date = month + '-' + String(index + 1).padStart(2, '0');
          if (date < view.definitions.startDate || date > view.definitions.endDate) return null;
          const games = view.games.filter((game) => game.date === date);
          return (
            <button
              key={date}
              className="calendar-day secondary"
              onClick={() => onSelect(date)}
              aria-current={date === view.currentDate ? 'date' : undefined}
            >
              <strong>
                {date.slice(5)} {view.completedDates.includes(date) ? '確定済み' : ''}
              </strong>
              {games.length === 0 ? (
                <span>試合なし</span>
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
      <p className="hint">日付を選ぶと、その日の予定・結果を下の試合結果欄に表示します。</p>
    </section>
  );
}
