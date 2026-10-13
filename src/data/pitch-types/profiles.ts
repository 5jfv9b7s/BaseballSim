import { profiles as fastballs } from './fastballs.ts';
import { profiles as breaking } from './breaking.ts';
import { profiles as offspeed } from './offspeed.ts';
import { pitchShapeConfig } from '../../../config/pitch-shape.ts';
import type { PitchProfileConfig } from '../../engine/pitch-profile-types.ts';

/** 名前の辞書だけでは有効化しない。計算用入力のある球種を開始時に固定する。 */
export function createPitchProfileConfig(): PitchProfileConfig {
  return structuredClone({
    version: 'pitch-shape-v1',
    profiles: [...fastballs, ...breaking, ...offspeed],
    movement: pitchShapeConfig,
  });
}
