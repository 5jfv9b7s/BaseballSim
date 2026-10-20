import { abilityRank } from '../../players/abilities.ts';
import './ability-rating.css';

/** 数値と評価は切り捨て、ゲージは実際の内部値。任意の評価値を追加しない。 */
export function AbilityRating({ valueMilli, label }: { valueMilli: number; label: string }) {
  const value = Math.floor(valueMilli / 1000);
  const exact = (valueMilli / 1000).toFixed(3);
  return (
    <span className="ability-rating" title={`内部値 ${exact} / 120`}>
      <span className="ability-rating-value">
        <span className="ability-rating-rank">{abilityRank(valueMilli)}</span>
        <span>{value}</span>
      </span>
      <meter aria-label={label} min={0} max={120} value={valueMilli / 1000}>
        {exact} / 120
      </meter>
    </span>
  );
}
