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
        通常球速・基本回転での目安です。変化量は無回転の基準球との比較で、縦の＋は基準球より上を表します。係数は未校正です。個人設定はこの選手の値、球種共通は球種テンプレートの値です。
      </p>
      <div className="world-table">
        <table aria-label="球種の特性">
          <thead>
            <tr>
              <th>球種</th>
              <th>設定元</th>
              <th>基本回転</th>
              <th>回転の基礎幅</th>
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
                  <td>{pitch.delivery ? '個人設定' : '球種共通'}</td>
                  <td>{delivery.spinRateRpm} rpm</td>
                  <td>±{delivery.spinSpreadRpm} rpm</td>
                  <td>{shape.horizontalBreakMm} mm</td>
                  <td>{shape.verticalBreakMm} mm</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">
        基礎幅は片側の入力値です。実際の回転のばらつきは再現性に応じて小さくなります。
        回転が多ければ必ず有利になるわけではありません。
      </p>
      <details>
        <summary>回転軸・リリースを確認</summary>
        <p className="hint">
          捕手視点の値です。回転軸は100万で割ると単位ベクトルになります。
          リリースは現在、投球への記録のみで軌道計算には使っていません。
        </p>
        <div className="world-table">
          <table aria-label="回転軸とリリース">
            <thead>
              <tr>
                <th>球種</th>
                <th>回転軸 x / y / z（ppm）</th>
                <th>リリース 左右 / 高さ / 前方（mm）</th>
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
                    <td>
                      {shape.spinAxis.xPpm} / {shape.spinAxis.yPpm} / {shape.spinAxis.zPpm}
                    </td>
                    <td>
                      {shape.release.lateralMm} / {shape.release.heightMm} /{' '}
                      {shape.release.extensionMm}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </details>
  );
}
