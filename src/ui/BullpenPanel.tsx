import type { WorldView } from '../world/controller.ts';
import { isFarmSquad } from '../world/squads.ts';

const phases = { idle: '待機', warming: '準備中', ready: '準備完了' };
const actions = { started: '準備開始', ready: '準備完了', cancelled: '準備終了', entered: '登板' };

export function BullpenPanel({ view }: { view: WorldView }) {
  const names = new Map(
    view.definitions.squads.flatMap((s) =>
      s.players.map((p) => [p.playerId, p.familyName + ' ' + p.givenName] as const),
    ),
  );
  const config = view.definitions.bullpenConfig!;
  return (
    <section className="panel" aria-label="ブルペン準備">
      <h2>ブルペン準備</h2>
      <p className="hint">
        自動で候補を選び、準備完了後に登板させます。現実の待ち時間では進みません。
      </p>
      <details>
        <summary>準備状態と経過を確認</summary>
        <p>
          交代球数の{config.leadPitches}球前から候補を探し、自チームの守備中の
          {config.requiredPitches}球で準備完了になります。
        </p>
        {!view.bullpen!.length && <p>試合開始後に、担当球団の一軍・二軍の準備状態を表示します。</p>}
        {view.bullpen!.map((row) => (
          <section
            key={row.gameId}
            aria-label={
              row.date +
              '・' +
              (isFarmSquad(view.definitions, row.squadId) ? '二軍' : '一軍') +
              'のブルペン'
            }
          >
            <h3>
              {row.date}・{isFarmSquad(view.definitions, row.squadId) ? '二軍' : '一軍'}：
              {row.enabled ? '準備はおまかせ' : '準備制約なし'}
            </h3>
            <ul>
              {row.players.map((p) => (
                <li key={p.playerId} data-testid="bullpen-player">
                  {names.get(p.playerId)}：{p.used ? '登板済み' : phases[p.phase]}
                  {p.phase !== 'idle' &&
                    '（' + p.progressPitches + ' / ' + row.requiredPitches + '球）'}
                </li>
              ))}
            </ul>
            <h4>最近の経過（最大12件）</h4>
            {!row.history.length && <p>準備の開始はまだありません。</p>}
            <ul>
              {row.history.map((a) => (
                <li
                  key={a.eventSeq + ':' + a.playerId + ':' + a.kind}
                  data-testid="bullpen-history"
                >
                  {a.inning}回・{names.get(a.playerId)}：{actions[a.kind]}（準備{a.startOrder}番目、
                  {a.progressPitches}球）
                  <br />
                  {a.reason}
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p className="hint">
          未校正の試作です。準備開始ごとに1回分の負荷を記録し、登板しなかった場合も保持します。準備途中の中止も同じ負荷です。身体状態の内訳で確認できます。手動の開始・中止、準備完了後の冷却は未対応です。
        </p>
      </details>
    </section>
  );
}
