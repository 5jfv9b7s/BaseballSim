import { useEffect, useId, useMemo, useState } from 'react';
import type { WorldView } from '../world/controller.ts';
import type { StatKey } from '../world/types.ts';
import { winBalanceSeries } from '../world/win-balance.ts';
import { BALANCE_WINDOW_DAYS, recentBalanceWindow } from './balance-chart-view.ts';
import './win-balance.css';

const COLORS = ['#286b49', '#a04424', '#3865a0', '#83588e', '#89700d', '#226d76'];
const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

export function WinBalanceChart({
  view,
  scope,
  selectedDate,
  onSelect,
}: {
  view: WorldView;
  scope: StatKey['statScope'];
  selectedDate: string;
  onSelect: (date: string) => void;
}) {
  const titleId = useId();
  const [hovered, setHovered] = useState('');
  const series = useMemo(() => winBalanceSeries(view, scope), [view, scope]);
  const ownClub = view.definitions.squads.find(
    (s) => s.squadId === view.management?.controlledSquadId,
  )?.team.clubId;
  const { rows: visible, positions, ticks } = recentBalanceWindow(series);
  const dates = positions.map((point) => point.date);
  const start = dates[0];
  const end = dates.at(-1);
  // 範囲が流れた後に、以前の位置でホバーした日付を残さない。
  useEffect(() => setHovered(''), [start, end, scope, view.worldId]);
  const selected = dates.includes(hovered)
    ? hovered
    : dates.includes(selectedDate)
      ? selectedDate
      : dates.at(-1);
  const extent = Math.max(
    1,
    ...visible.flatMap((row) => row.points.map((point) => Math.abs(point.balance))),
  );
  const bound = Math.ceil(extent / 5) * 5;
  const x = (date: string) => positions.find((point) => point.date === date)!.x;
  const y = (value: number) => 130 - (value / bound) * 100;
  const rows = visible.map((row, index) => ({ ...row, index, own: row.clubId === ownClub }));
  // 自球団を最後に描画し、重なる線でも埋もれにくくする。
  const drawingOrder = [...rows].sort((a, b) => Number(a.own) - Number(b.own));

  return (
    <section className="balance-chart" aria-label="貯金・借金の推移">
      <h3>貯金・借金の推移</h3>
      <p className="balance-range">
        <strong>直近{BALANCE_WINDOW_DAYS}日</strong>
        {start && end && (
          <span>
            <time dateTime={start}>{start}</time> ～ <time dateTime={end}>{end}</time>
          </span>
        )}
        <span>{scope === 'firstRegular' ? '一軍公式戦' : '二軍公式戦'}</span>
      </p>
      <p className="hint">貯金＝勝数−敗数。一軍・二軍の全試合終了後に更新します。</p>
      <div className="balance-legend">
        {rows.map((row) => (
          <span key={row.squadId}>
            <i style={{ background: COLORS[row.index % COLORS.length] }} />
            {row.name}
            {row.own && '（担当球団）'}
          </span>
        ))}
      </div>
      {dates.length === 0 ? (
        <p>確定済みの結果を表示できる日付はまだありません。</p>
      ) : (
        <>
          <div className="balance-scroll">
            <svg viewBox="0 0 760 312" role="img" aria-labelledby={titleId}>
              <title id={titleId}>
                {start}から{end}
                までの勝数と敗数の差。最新日を右端に表示しています。日付別の数値は下の表で確認できます。
              </title>
              {[-bound, 0, bound].map((value) => (
                <g key={value}>
                  <line
                    x1="90"
                    x2="690"
                    y1={y(value)}
                    y2={y(value)}
                    className={value === 0 ? 'balance-zero' : 'balance-grid'}
                  />
                  <text x="75" y={y(value) + 4} textAnchor="end">
                    {signed(value)}
                  </text>
                </g>
              ))}
              {ticks.map((point) => (
                <text key={point.date} x={point.x} y="300" textAnchor="middle">
                  {point.date.slice(5).replace('-', '/')}
                </text>
              ))}
              {selected && (
                <line
                  x1={x(selected)}
                  x2={x(selected)}
                  y1="22"
                  y2="238"
                  className="balance-cursor"
                />
              )}
              {drawingOrder.map((row) => (
                <g key={row.squadId} data-own={row.own}>
                  <polyline
                    points={row.points
                      .map((point) => `${x(point.date)},${y(point.balance)}`)
                      .join(' ')}
                    fill="none"
                    stroke={COLORS[row.index % COLORS.length]}
                    strokeWidth={row.own ? 3.5 : 1.7}
                    strokeDasharray={row.own ? undefined : `${6 + row.index * 2} 3`}
                  />
                  {row.points
                    .filter((point) => point.date === selected || row.points.length === 1)
                    .map((point) => (
                      <circle
                        key={point.date}
                        cx={x(point.date)}
                        cy={y(point.balance)}
                        r={row.own ? 5 : 3}
                        fill={COLORS[row.index % COLORS.length]}
                      />
                    ))}
                </g>
              ))}
              {positions.map(({ date, hitLeft, hitWidth }) => (
                <rect
                  key={date}
                  x={hitLeft}
                  y="22"
                  width={hitWidth}
                  height="216"
                  fill="transparent"
                  onMouseEnter={() => setHovered(date)}
                  onMouseLeave={() => setHovered('')}
                  onClick={() => onSelect(date)}
                >
                  <title>{date}の結果を選択</title>
                </rect>
              ))}
            </svg>
          </div>
          <label>
            グラフで確認する日
            <select
              value={selected ?? ''}
              onChange={(event) => {
                setHovered('');
                onSelect(event.target.value);
              }}
            >
              {dates.map((date) => (
                <option key={date}>{date}</option>
              ))}
            </select>
          </label>
          <div className="world-table">
            <table aria-label="選択日の貯金・借金">
              <caption>{selected}時点・当季の累計</caption>
              <thead>
                <tr>
                  <th>球団</th>
                  <th>勝</th>
                  <th>敗</th>
                  <th>分</th>
                  <th>貯金・借金</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const point = row.points.find((item) => item.date === selected)!;
                  return (
                    <tr key={row.squadId} data-own-club={row.own}>
                      <th>
                        {row.name}
                        {row.own && <small> 担当球団</small>}
                      </th>
                      <td>{point.wins}</td>
                      <td>{point.losses}</td>
                      <td>{point.draws}</td>
                      <td>{signed(point.balance)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
