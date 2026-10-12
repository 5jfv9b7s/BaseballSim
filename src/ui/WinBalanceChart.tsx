import { useId, useMemo, useState } from 'react';
import type { WorldView } from '../world/controller.ts';
import type { StatKey } from '../world/types.ts';
import { winBalanceSeries } from '../world/win-balance.ts';
import './win-balance.css';

const COLORS = ['#286b49', '#a04424', '#3865a0', '#83588e', '#89700d', '#226d76'];
const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

export function WinBalanceChart({
  view,
  scope,
  month,
  selectedDate,
  onSelect,
}: {
  view: WorldView;
  scope: StatKey['statScope'];
  month: string;
  selectedDate: string;
  onSelect: (date: string) => void;
}) {
  const titleId = useId();
  const [hovered, setHovered] = useState('');
  const series = useMemo(() => winBalanceSeries(view, scope), [view, scope]);
  const ownClub = view.definitions.squads.find(
    (s) => s.squadId === view.management?.controlledSquadId,
  )?.team.clubId;
  const visible = series.map((row) => ({
    ...row,
    points: row.points.filter((point) => point.date.startsWith(month)),
  }));
  const dates = visible[0]?.points.map((point) => point.date) ?? [];
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
  const days = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0),
  ).getUTCDate();
  const x = (date: string) => 48 + ((Number(date.slice(8)) - 1) / (days - 1)) * 664;
  const y = (value: number) => 130 - (value / bound) * 100;
  const rows = visible.map((row, index) => ({ ...row, index, own: row.clubId === ownClub }));
  // 自球団を最後に描画し、重なる線でも埋もれにくくする。
  const drawingOrder = [...rows].sort((a, b) => Number(a.own) - Number(b.own));

  return (
    <section className="balance-chart" aria-label="貯金・借金の推移">
      <h3>貯金・借金の推移</h3>
      <p>
        {month} ／ {scope === 'firstRegular' ? '一軍公式戦' : '二軍公式戦'} ／ 確定試合のみ
      </p>
      <p className="hint">
        貯金＝勝数−敗数。0が中央線です。日付の選択や線の確認だけでは試合は進みません。
      </p>
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
        <p>この月の確定試合を表示できる日付はまだありません。</p>
      ) : (
        <>
          <div className="balance-scroll">
            <svg viewBox="0 0 760 266" role="img" aria-labelledby={titleId}>
              <title id={titleId}>
                {month}の勝数と敗数の差。日付別の数値は下の表で確認できます。
              </title>
              {[-bound, 0, bound].map((value) => (
                <g key={value}>
                  <line
                    x1="48"
                    x2="712"
                    y1={y(value)}
                    y2={y(value)}
                    className={value === 0 ? 'balance-zero' : 'balance-grid'}
                  />
                  <text x="37" y={y(value) + 4} textAnchor="end">
                    {signed(value)}
                  </text>
                </g>
              ))}
              {[1, Math.ceil(days / 2), days].map((day) => (
                <text key={day} x={48 + ((day - 1) / (days - 1)) * 664} y="254" textAnchor="middle">
                  {day}日
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
              {dates.map((date) => (
                <rect
                  key={date}
                  x={x(date) - 332 / days}
                  y="22"
                  width={664 / days}
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
