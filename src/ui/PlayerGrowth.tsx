import { useId, useState } from 'react';
import type { WorldView } from '../world/controller.ts';
import { growthComparison } from '../world/growth-view.ts';
import './player-growth.css';

const PERIODS = {
  season: 'シーズン開始から',
  last30: '直近30日',
  last7: '直近7日',
  lastDay: '直近1日',
};
const INTENSITIES = { light: '軽め', normal: '普通', hard: '強め', rest: '休養' };
const signed = (value: number) => (value > 0 ? `+${value}` : String(value));
const points = (value: number) => (value / 1000).toFixed(3).replace(/\.?0+$/, '');

/** 保存された端点と確定実績のみ。閲覧でWorkerへ変更指示を送らない。 */
export function PlayerGrowth({ view, playerId }: { view: WorldView; playerId: string }) {
  const [period, setPeriod] = useState<keyof typeof PERIODS>('season');
  const titleId = useId();
  const growth = view.growth;
  if (!growth) return <p className="hint">この保存には日次成長の記録がありません。</p>;
  if (!growth.dates.length)
    return (
      <section aria-label="成長履歴">
        <h3>成長履歴</h3>
        <p>まだ日次の練習実績がありません。全試合終了後の日次確定から記録します。</p>
      </section>
    );
  const range = growth.periods[period];
  const comparison = growthComparison(
    view.definitions,
    playerId,
    range.start[playerId]!,
    growth.current[playerId]!,
  );
  const changed = comparison.rows.filter((row) => row.beforeValue !== row.afterValue);
  const dates = growth.dates.filter((date) => date >= range.from);
  const deltas = growth.dailyDeltas[playerId]!.slice(-dates.length);
  const limit = Math.max(1, ...deltas.map(Math.abs));
  const x = (i: number) => 32 + (deltas.length === 1 ? 130 : (i * 260) / (deltas.length - 1));
  const y = (v: number) => 73 - (v * 42) / limit;
  const outcome = growth.latest?.outcomes.find((row) => row.playerId === playerId);
  return (
    <section className="player-growth" aria-label="成長履歴">
      <div className="growth-heading">
        <h3>成長履歴</h3>
        <label>
          集計期間
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value as keyof typeof PERIODS)}
          >
            {Object.entries(PERIODS).map(([key, label]) => (
              <option value={key} key={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="hint">
        {range.from}〜{range.through}の確定実績 ／ 能力ポイント
      </p>
      <dl className="growth-totals" aria-label="期間内の成長合計">
        <div>
          <dt>増加</dt>
          <dd>{signed(comparison.increase)}</dd>
        </div>
        <div>
          <dt>減少</dt>
          <dd>{comparison.decrease}</dd>
        </div>
        <div>
          <dt>差引</dt>
          <dd>{signed(comparison.net)}</dd>
        </div>
      </dl>
      <svg className="growth-chart" viewBox="0 0 320 155" role="img" aria-labelledby={titleId}>
        <title id={titleId}>
          日別の能力変化。表示整数の差引。{dates[0]}から{dates.at(-1)}、最小{Math.min(...deltas)}
          、最大{Math.max(...deltas)}
        </title>
        <line x1="32" x2="292" y1="73" y2="73" className="growth-zero" />
        <text x="3" y="78">
          0
        </text>
        <text x="3" y="24">
          +{limit}
        </text>
        <text x="3" y="132">
          −{limit}
        </text>
        <polyline points={deltas.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
        {deltas.map((value, i) => (
          <circle key={dates[i]} cx={x(i)} cy={y(value)} r="3">
            <title>
              {dates[i]}：{signed(value)}
            </title>
          </circle>
        ))}
        <text x="32" y="150">
          {dates[0]?.slice(5)}
        </text>
        <text x="292" y="150" textAnchor="end">
          {dates.at(-1)?.slice(5)}
        </text>
      </svg>
      <p className="hint">
        合計は各能力の期間開始・終了時の表示整数を比較します。小数の変化は下表で確認できます。
      </p>
      <details>
        <summary>能力別の変化（{changed.length}項目）</summary>
        {changed.length ? (
          <div
            className="world-table"
            role="region"
            aria-label="能力別の成長表スクロール"
            tabIndex={0}
          >
            <table aria-label="能力別の成長">
              <thead>
                <tr>
                  <th>項目</th>
                  <th>開始</th>
                  <th>現在</th>
                  <th>表示差</th>
                  <th>内部差</th>
                </tr>
              </thead>
              <tbody>
                {changed.map((row) => (
                  <tr key={row.key}>
                    <th scope="row">{row.label}</th>
                    <td>{points(row.beforeValue)}</td>
                    <td>{points(row.afterValue)}</td>
                    <td>{signed(row.delta)}</td>
                    <td>{signed((row.afterValue - row.beforeValue) / 1000)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>この期間に記録された能力の変化はありません。</p>
        )}
        <p className="hint">
          基本22能力・守備習熟・持ち球の制球と再現性を集計。固定適性・才能・向上心・上限・球速・一時的な状態は含みません。
        </p>
      </details>
      <details>
        <summary>直近の練習結果（{growth.latest!.date}）</summary>
        {outcome && (
          <>
            <p>
              指定：{INTENSITIES[outcome.settings.intensity]} → 実施：
              {INTENSITIES[outcome.effectiveIntensity]}
              {outcome.adjustmentReasons.length > 0 &&
                `（${outcome.adjustmentReasons.join('・')}）`}
            </p>
            <p>
              {outcome.effectiveIntensity === 'rest'
                ? '休養のため練習なし'
                : outcome.opportunityOccurred
                  ? '成長機会が成立'
                  : '成長機会の成立なし'}{' '}
              ／ 体力消費 {points(outcome.energySpentMilli)} ／ 疲労追加{' '}
              {points(outcome.fatigueAddedMilli)}
            </p>
            <p className="hint">
              練習直後の消費・追加量です。現在の体力・疲労はその後の日次回復も含みます。成長量は上限で制限されます。
            </p>
          </>
        )}
      </details>
    </section>
  );
}
