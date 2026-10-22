import type { WorldView } from '../world/controller.ts';
import { growthBasis, growthAbilityKey } from '../world/growth-basis.ts';

const DOMAINS = { batting: '打撃', pitching: '投球', fielding: '守備' };
const UNITS = { batting: '打席', pitching: '球', fielding: '球分の守備参加' };
const points = (milli: number) => (milli / 1000).toFixed(3).replace(/\.?0+$/, '');

/** 実戦経験のあるモデルだけ表示。旧保存の未記録をゼロと扱わない。 */
export function ExperienceResults({ view, playerId }: { view: WorldView; playerId: string }) {
  const latest = view.growth?.latest;
  if (!latest?.experience) return null;
  const rows = latest.experience.filter((row) => row.playerId === playerId);
  const abilities = new Map(growthBasis(view.definitions, playerId).map((a) => [a.key, a.label]));
  return (
    <details className="experience-results">
      <summary>直近の実戦経験（{latest.date}）</summary>
      {!view.definitions.experienceConfig?.enabled ? (
        <p>このプレイでは実戦経験モデルを無効にしています。</p>
      ) : !rows.length ? (
        <p>この日は実戦経験の対象となる出場がありません。</p>
      ) : (
        <ul>
          {rows.map((row) => (
            <li key={row.domain}>
              <strong>
                {DOMAINS[row.domain]}：{row.units}
                {UNITS[row.domain]}
              </strong>
              <p>
                {row.opportunityOccurred
                  ? row.appliedMilli > 0
                    ? `能力に合計 +${points(row.appliedMilli)} を反映`
                    : '成長機会は成立（能力の増加なし）'
                  : '成長機会の成立なし'}
              </p>
              <p className="hint">
                対象：
                {row.targets
                  .map((target) => abilities.get(growthAbilityKey(target.abilityRef)))
                  .join('・')}
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">
        一軍・二軍の実出場を集計。凡退・失点でも経験の対象です。通常練習と別に判定し、出場量が多いほど追加効果は小さくなります。守備は投球時の配置を数え、刺殺・補殺の件数とは異なります。
      </p>
    </details>
  );
}
