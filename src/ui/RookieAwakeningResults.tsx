import type { WorldView } from '../world/controller.ts';
import { growthBasis, growthAbilityKey } from '../world/growth-basis.ts';

const points = (n: number) => (n / 1000).toFixed(3).replace(/\.?0+$/, '');
/** 保存済みの覚醒だけを表示。抽選・将来の発生予測はUIで行わない。 */
export function RookieAwakeningResults({
  view,
  playerId,
  onSelectPlayer,
}: {
  view: WorldView;
  playerId?: string;
  onSelectPlayer?: (id: string) => void;
}) {
  if (view.growth?.version !== 'daily-development-v4') return null;
  const own = view.definitions.squads.find(
    (s) => s.squadId === view.management?.controlledSquadId,
  )!;
  const ownIds = new Set(own.players.map((p) => p.playerId));
  const events = view.growth.rookieAwakening!.events.filter((e) =>
    playerId ? e.playerId === playerId : ownIds.has(e.playerId),
  );
  const profile = playerId
    ? view.definitions.playerProfiles!.players.find((p) => p.playerId === playerId)!
    : null;
  const label = playerId ? 'ルーキー覚醒' : 'ルーキー覚醒の記録（自球団 ' + events.length + '件）';
  const name = (id: string) => {
    const p = view.definitions.squads.flatMap((s) => s.players).find((p) => p.playerId === id)!;
    return (
      view.definitions.playerProfiles!.players.find((p) => p.playerId === id)!.displayName ??
      p.familyName + ' ' + p.givenName
    );
  };
  const ability = (id: string, ref: (typeof events)[number]['abilityRef']) =>
    growthBasis(view.definitions, id).find((a) => a.key === growthAbilityKey(ref))!.label;
  return (
    <details className="rookie-results">
      <summary>{label}</summary>
      {!view.definitions.awakeningConfig!.enabled ? (
        <p>このプレイではルーキー覚醒を無効にしています。</p>
      ) : profile?.firstProYear === null ? (
        <p>プロ入り年の記録がないため、対象か判定できません。</p>
      ) : profile ? (
        <p>
          {profile.firstProYear}年プロ入り ／{' '}
          {profile.firstProYear === Number(view.definitions.startDate.slice(0, 4))
            ? 'プロ1年目'
            : '今季の対象外'}
          {view.currentDate > view.definitions.endDate ? '（今季の対象期間は終了）' : ''}
        </p>
      ) : (
        <p>プロ1年目を対象に、一軍・二軍とも同じ条件で処理します。</p>
      )}
      {!events.length ? (
        <p>覚醒の記録はありません。発生は保証されません。</p>
      ) : (
        <div className="world-table" role="region" aria-label="覚醒履歴の表スクロール" tabIndex={0}>
          <table aria-label={playerId ? '選手のルーキー覚醒履歴' : '自球団のルーキー覚醒履歴'}>
            <thead>
              <tr>
                <th>日付</th>
                {!playerId && <th>選手</th>}
                <th>能力</th>
                <th>前</th>
                <th>後</th>
                <th>増加</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.eventId}>
                  <td>{e.date}</td>
                  {!playerId && (
                    <td>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => onSelectPlayer?.(e.playerId)}
                      >
                        {name(e.playerId)}
                      </button>
                    </td>
                  )}
                  <th scope="row">{ability(e.playerId, e.abilityRef)}</th>
                  <td>{points(e.beforeValue)}</td>
                  <td>{points(e.afterValue)}</td>
                  <td>+{points(e.afterValue - e.beforeValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="hint">能力は個別の成長上限を守ります。移籍覚醒・キャンプは工事中です。</p>
    </details>
  );
}
