import './pitch-learning.css';
import { pitchNames } from '../data/pitch-types/index.ts';
import type { WorldView } from '../world/controller.ts';

/** 保存済みの実績のみ。100%未満は小数切り捨てで未習得を明示する。 */
export function PitchLearningResults({ view, playerId }: { view: WorldView; playerId: string }) {
  const learning = view.growth?.pitchLearning;
  if (!learning) return null;
  const pitches = view.definitions.squads
    .flatMap((s) => s.pitches)
    .filter((p) => p.playerId === playerId && Object.hasOwn(learning.acquisition, p.pitchId));
  if (!pitches.length) return null;
  return (
    <section aria-label="新球種の習得状況" className="pitch-learning-results">
      <h4>新球種の習得</h4>
      {!view.definitions.pitchLearningConfig?.enabled && (
        <p>この保存では球種習得の進行を無効にしています。</p>
      )}
      {pitches.map((p) => {
        const state = learning.acquisition[p.pitchId]!;
        const percent = (Math.floor(state.progressMilli / 100) / 10).toFixed(1);
        const latest = learning.latest.find((o) => o.pitchId === p.pitchId);
        return (
          <div key={p.pitchId}>
            <p className="pitch-learning-summary">
              <strong>{pitchNames[p.pitchTypeCode]}</strong>
              <b>{percent}%</b>
              <span>
                {state.progressMilli === 100000 ? '習得済み' : '未習得・試合では使用不可'}
              </span>
            </p>
            <progress
              aria-label={`${pitchNames[p.pitchTypeCode]}の習得進度`}
              max={100000}
              value={state.progressMilli}
            />
            {state.acquiredOn && (
              <p>
                習得日：<time>{state.acquiredOn}</time>（翌日以降の試合で使用可能）
              </p>
            )}
            {latest && (
              <p>
                直近の練習：＋
                {((latest.afterMilli - latest.beforeMilli) / 1000).toFixed(3).replace(/\.?0+$/, '')}
                %
              </p>
            )}
          </div>
        );
      })}
      <p className="hint">
        練習対象で「○○の習得」を選ぶと、指定対象分の練習量を進度へ配分します。指定外の基礎練習は続けます。習得後は同じ指定で制球・再現性を練習します。
      </p>
      <details>
        <summary>球種習得の対応範囲</summary>
        <p>
          候補球の能力・球速・球質は保存の開始時入力です。進度と初期能力は成長合計に足しません。休養・機会不成立では進度は増えず、完成日は保証しません。試作速度は未校正です。
        </p>
      </details>
    </section>
  );
}
