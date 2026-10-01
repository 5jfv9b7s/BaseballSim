import type { WorldView } from '../world/controller.ts';

/** 二軍は自動編成。保存内の同じplayerIdで、移動後も表示・成績を追う。 */
export function FarmRoster({ view }: { view: WorldView }) {
  const preview = view.farm!.preview;
  const players = view.definitions.squads.flatMap((squad) => squad.players);
  const name = (id: string) => {
    const player = players.find((player) => player.playerId === id)!;
    return player.familyName + ' ' + player.givenName;
  };
  return (
    <section className="panel" aria-label="二軍の起用">
      <h2>二軍の起用</h2>
      <p className="hint">
        二軍登録の選手から自動で編成します。理想打順に不在の選手がいる場合は名簿順で代役を選ぶ試作です。
      </p>
      {preview ? (
        <details>
          <summary>今日の二軍オーダーを確認</summary>
          <p>
            先発：{name(preview.starterId)} ／ ベンチ {preview.roster.playerIds.length}人
          </p>
          <ol>
            {preview.lineup.map((slot) => (
              <li key={slot.playerId}>
                {name(slot.playerId)}（{slot.position}）
              </li>
            ))}
          </ol>
          <p>ベンチ：{preview.roster.participants.map((entry) => entry.displayName).join('、')}</p>
        </details>
      ) : (
        <p>担当球団の二軍は今日は試合がありません。</p>
      )}
      <p className="hint">
        一軍ベンチ外だけでは二軍へ移りません。入れ替えは登録画面で行い、同日に両方へ出場しない運用です。
      </p>
    </section>
  );
}
