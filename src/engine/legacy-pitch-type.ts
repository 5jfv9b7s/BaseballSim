import type { PitchType } from './types.ts';
import { ensure } from './validation.ts';
export type LegacyPitchType = 'fastball' | 'slider' | 'fork';
export function legacyPitchType(code: PitchType): LegacyPitchType {
  ensure(
    code === 'fastball' || code === 'slider' || code === 'fork',
    '旧モデルでは未対応の球種です',
  );
  return code;
}
