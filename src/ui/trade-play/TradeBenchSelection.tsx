import type { TradePlayView } from '../../world/trade-play-view.ts';
import type { TeamSide } from '../../game/types.ts';

type MatchSide = NonNullable<TradePlayView['matchSetup']>['sides'][TeamSide];

/** 両軍の明示選択。全員選択も利用者の操作でだけ行い、CPU選出とは扱わない。 */
export function TradeBenchSelection({
  team,
  selected,
  disabled,
  onChange,
}: {
  team: MatchSide;
  selected: string[];
  disabled: boolean;
  onChange: (ids: string[]) => void;
}) {
  const foreignCount = team.players.filter(
    (p) => selected.includes(p.playerId) && p.foreignBaseStatus === 'subject',
  ).length;
  const overLimit =
    selected.length > team.benchLimit ||
    (team.foreignBenchLimit !== null && foreignCount > team.foreignBenchLimit);
  return (
    <fieldset className="trade-bench" disabled={disabled || team.savedBenchIds !== null}>
      <legend>
        {team.name}（{team.category === 'first' ? '一軍' : '二軍'}）
      </legend>
      <p>
        選択 {selected.length} / {team.benchLimit}人
        {team.foreignBenchLimit !== null &&
          ` ／ 外国人枠 ${foreignCount} / ${team.foreignBenchLimit}人`}
      </p>
      {overLimit && <p role="alert">ベンチ枠を超えています。選択を減らしてください。</p>}
      {team.savedBenchIds !== null ? (
        <p>保存済みの当日ベンチ指定を使用します。</p>
      ) : (
        <div className="trade-play-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => onChange(team.players.map((p) => p.playerId))}
          >
            登録全員を選択
          </button>
          <button type="button" className="secondary" onClick={() => onChange([])}>
            選択を解除
          </button>
        </div>
      )}
      <p className="muted">
        打順は{team.lineupSource === 'gameOverride' ? '当日指定' : '理想オーダー'}
        。実際の先発・打順は開始時に休養設定も判定します。
      </p>
      <div className="trade-bench-list">
        {team.players.map((player) => {
          const batting = team.lineup.find((slot) => slot.playerId === player.playerId);
          const rotation = team.pitchers.rotationSlots.find(
            (slot) => slot.playerId === player.playerId,
          );
          const relief = team.pitchers.reliefRoles.some((r) => r.playerId === player.playerId);
          const explicitStarter = team.explicitStarterId === player.playerId;
          const planned = rotation?.slotNo === team.pitchers.nextSlotNo;
          return (
            <label className="trade-bench-player" key={player.playerId}>
              <input
                type="checkbox"
                checked={selected.includes(player.playerId)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, player.playerId]
                      : selected.filter((id) => id !== player.playerId),
                  )
                }
              />
              <span>
                <strong>{player.name}</strong>
                <small>
                  {[
                    batting ? `${batting.slotNo}番 ${batting.battingRole}` : null,
                    explicitStarter
                      ? '当日先発指定'
                      : planned
                        ? 'ローテ先発予定'
                        : rotation
                          ? '先発枠'
                          : relief
                            ? '救援'
                            : '控え',
                    player.foreignBaseStatus === 'subject' ? '外国人枠対象' : null,
                  ]
                    .filter(Boolean)
                    .join(' ／ ')}
                </small>
              </span>
              <small>
                体力 {(player.energyMilli / 1000).toFixed(0)}
                <br />
                疲労 {(player.fatigueMilli / 1000).toFixed(0)}
              </small>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
