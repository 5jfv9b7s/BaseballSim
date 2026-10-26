import type { WorldView } from '../world/controller.ts';

const GROUP_NAMES = { physical: '身体', technique: '技術', judgment: '判断' };
const points = (value: number) => {
  const text = (value / 1000).toFixed(3).replace(/\.?0+$/, '');
  return value > 0 ? '+' + text : text;
};

/** 将来の能力予測や内部の成長期は表示せず、確定した年齢変化だけを示す。 */
export function AgeResults({ view, playerId }: { view: WorldView; playerId: string }) {
  if (
    view.growth?.version !== 'daily-development-v3' &&
    view.growth?.version !== 'daily-development-v4' &&
    view.growth?.version !== 'daily-development-v5'
  )
    return null;
  const latest = view.growth.latest;
  const row = latest?.aging?.find((p) => p.playerId === playerId);
  return (
    <details className="age-results">
      <summary>直近の年齢変化{latest ? `（${latest.date}）` : ''}</summary>
      {!view.definitions.ageConfig?.enabled ? (
        <p>このプレイでは年齢変化モデルを無効にしています。</p>
      ) : !row ? (
        <p>まだ年齢変化の確定実績がありません。</p>
      ) : (
        <>
          <p>{Math.floor(row.ageMilli / 1000)}歳時点の確定実績 ／ 能力ポイント</p>
          <div
            className="world-table"
            role="region"
            aria-label="年齢変化の表スクロール"
            tabIndex={0}
          >
            <table aria-label="年齢変化の内訳">
              <thead>
                <tr>
                  <th>能力群</th>
                  <th>増加</th>
                  <th>減少</th>
                  <th>差引</th>
                </tr>
              </thead>
              <tbody>
                {row.groups.map((g) => (
                  <tr key={g.group}>
                    <th scope="row">{GROUP_NAMES[g.group]}</th>
                    <td>{points(g.increaseMilli)}</td>
                    <td>{points(g.decreaseMilli)}</td>
                    <td>{points(g.increaseMilli + g.decreaseMilli)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="hint">
        出場・休養にかかわらず日次確定で処理します。通常練習・実戦経験とは別の変化です。能力群と選手ごとに時期・速度が異なり、成長上限と能力の下限を守ります。
      </p>
    </details>
  );
}
