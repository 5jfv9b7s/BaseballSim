import type { PitchDelivery, PitchProfileConfig, SpinAxis } from './pitch-profile-types.ts';
import type { Side } from './types.ts';

/** 定加速度近似の試作。回転軸×投球方向の向きから、無回転基準への変化量を導出する。 */
export function pitchMovement(
  delivery: PitchDelivery,
  spinRateRpm: number,
  velocityCentiKph: number,
  side: Side,
  config: PitchProfileConfig['movement'],
) {
  const sign = side === 'R' ? 1 : -1;
  const spinAxis: SpinAxis = { ...delivery.spinAxis, zPpm: delivery.spinAxis.zPpm * sign + 0 };
  const scale =
    spinRateRpm * config.breakMmPerRpm * (config.referenceVelocityCentiKph / velocityCentiKph) ** 2;
  return {
    spinAxis,
    release: { ...delivery.release, lateralMm: delivery.release.lateralMm * sign + 0 },
    horizontalBreakMm: Math.round((scale * spinAxis.zPpm) / 1000000) + 0,
    verticalBreakMm: Math.round((-scale * spinAxis.xPpm) / 1000000) + 0,
  };
}
