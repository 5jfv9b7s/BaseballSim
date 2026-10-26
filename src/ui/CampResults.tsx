import type { WorldView } from '../world/controller.ts';
import { growthBasis, growthAbilityKey } from '../world/growth-basis.ts';

/** 保存済みの実績のみ。抽選済みかどうかや将来の確率は表示しない。 */
export function CampResults({ view, playerId }: { view: WorldView; playerId: string }) {
  if (view.growth?.version !== 'daily-development-v5') return null;
  const events = view.growth.campBursts!.filter((e) => e.outcome.playerId === playerId);
  const basis = growthBasis(view.definitions, playerId);
  const points = (n: number) => (n / 1000).toFixed(3).replace(/\.?0+$/, '');
  return (
    <details className="camp-results">
      <summary>キャンプ爆発の記録（{events.length}件）</summary>
      {!events.length ? (
        <p>確定したキャンプ爆発の記録はありません。</p>
      ) : (
        events.map((e) => (
          <div key={e.outcome.eventId}>
            <p>
              {e.date} ／{' '}
              {view.definitions.campInputs!.periods.find((p) => p.campId === e.campId)!.label}
            </p>
            <ul>
              {e.changes.map((c) => (
                <li key={c.changeId}>
                  {basis.find((a) => a.key === growthAbilityKey(c.abilityRef))!.label}：
                  {points(c.beforeValue)} → {points(c.afterValue)}（+
                  {points(c.afterValue - c.beforeValue)}）
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
      <p className="hint">指定対象の成長だけを記録します。上限を超える分は加算しません。</p>
    </details>
  );
}
