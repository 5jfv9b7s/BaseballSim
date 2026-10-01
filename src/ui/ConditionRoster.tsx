import { useState } from 'react';
import type { WorldView } from '../world/controller.ts';

/** 過去の試合前値の比較。モデルの将来値・乱数を表示しない。 */
export function ConditionRoster({ view }: { view: WorldView }) {
  const [period, setPeriod] = useState<'five' | 'ten'>('five');
  const rows = view.condition!;
  return (
    <section className="panel" aria-label="選手の調子">
      <h2>選手の調子</h2>
      <p className="hint">
        調子は体力・疲労と別の状態です。5段階で表示し、毎日なだらかに変わる試作です。能力補正にはまだ使いません。
      </p>
      <details>
        <summary>全選手の調子と変化を確認</summary>
        <label>
          比較するチーム試合数{' '}
          <select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)}>
            <option value="five">直近5試合</option>
            <option value="ten">直近10試合</option>
          </select>
        </label>
        <p className="hint">
          現在の登録期間内で、所属チームが実施した試合を比較します。欠場・ベンチ外でも数えます。増減は最後と最初の試合前調子の差で、能力の補正率や将来予測ではありません。
        </p>
        <p className="hint">
          一軍・二軍を移動した直後は比較を新しい登録期間から始めます。対象が0〜1試合なら増減は「—」です。試合のない日は調子だけ変わり、比較試合数は増えません。
        </p>
        <div className="world-table" tabIndex={0} aria-label="調子と直近変化の一覧">
          <table>
            <thead>
              <tr>
                <th>選手</th>
                <th>登録</th>
                <th>現在の調子</th>
                <th>増減（ポイント）</th>
                <th>対象試合数</th>
                <th>対象期間</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const comparison = row[period];
                const delta = comparison.deltaMilli;
                return (
                  <tr key={row.playerId} data-testid={'condition-' + row.playerId}>
                    <th scope="row">{row.displayName}</th>
                    <td>{row.category === 'first' ? '一軍' : '二軍'}</td>
                    <td data-testid="stage">{row.stage}</td>
                    <td data-testid="delta">
                      {delta === null ? '—' : (delta > 0 ? '+' : '') + (delta / 1000).toFixed(3)}
                    </td>
                    <td data-testid="sample-count">
                      {comparison.actualGames}／{comparison.requestedGames}試合
                    </td>
                    <td>
                      {comparison.fromDate
                        ? comparison.fromDate + '〜' + comparison.toDate
                        : '比較する試合なし'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
