import type { PitchProfileConfig } from '../engine/pitch-profile-types.ts';
import type { PitchRepertoire, Side } from '../engine/types.ts';
import { pitchMovement } from '../engine/pitch-movement.ts';

export function PitchCharacteristics({
  pitches,
  profiles,
  side,
}: {
  pitches: PitchRepertoire[];
  profiles: PitchProfileConfig;
  side: Side;
}) {
  return (
    <details>
      <summary>球種の特性（試作）</summary>
      <p className="hint">
        通常球速・基本回転での目安です。変化量は無回転の基準球との比較で、縦の＋は基準球より上を表します。係数は未校正です。
      </p>
      <div className="world-table">
        <table aria-label="球種の特性">
          <thead>
            <tr>
              <th>球種</th>
              <th>基本回転</th>
              <th>横変化</th>
              <th>縦変化</th>
            </tr>
          </thead>
          <tbody>
            {pitches.map((pitch) => {
              const profile = profiles.profiles.find((p) => p.code === pitch.pitchTypeCode)!;
              const delivery = pitch.delivery ?? profile.delivery;
              const shape = pitchMovement(
                delivery,
                delivery.spinRateRpm,
                pitch.velocity.typicalCentiKph,
                side,
                profiles.movement,
              );
              return (
                <tr key={pitch.pitchId}>
                  <th>{profile.name}</th>
                  <td>{delivery.spinRateRpm} rpm</td>
                  <td>{shape.horizontalBreakMm} mm</td>
                  <td>{shape.verticalBreakMm} mm</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}
