import type { RngState } from './types.ts';
import { validateRng } from './validation.ts';

/** 全状態は非ゼロ32bit整数1個。暗号用途ではない。入力は変更しない。 */
export function nextRandom(state: RngState): { value: number; state: RngState } {
  validateRng(state);
  let word = state.fullState.word;
  word ^= word << 13; word ^= word >>> 17; word ^= word << 5;
  word >>>= 0;
  return { value: word / 0x100000000, state: { ...state, fullState: { word }, drawCount: state.drawCount + 1 } };
}
