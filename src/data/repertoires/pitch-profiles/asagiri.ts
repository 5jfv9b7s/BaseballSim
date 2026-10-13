import type { PitchRepertoire } from '../../../engine/types.ts';
import { rating } from '../../rating.ts';

/** 新規の球種特性モデルだけに追加する架空の持ち球。球速・能力は未校正。 */
export const repertoires: PitchRepertoire[] = [
  {
    pitchId: 'profile-repertoire-asagiri-player-h-10-sinker',
    playerId: 'asagiri-player-h-10',
    pitchTypeCode: 'sinker',
    acquisitionProgressMilli: 100000,
    control: rating(52000),
    repeatability: rating(70000),
    velocity: { typicalCentiKph: 13800, maxCentiKph: 14300, spreadCentiKph: 450 },
  },
  {
    pitchId: 'profile-repertoire-asagiri-player-h-25-changeup',
    playerId: 'asagiri-player-h-25',
    pitchTypeCode: 'changeup',
    acquisitionProgressMilli: 100000,
    control: rating(52000),
    repeatability: rating(70000),
    velocity: { typicalCentiKph: 12400, maxCentiKph: 12900, spreadCentiKph: 450 },
  },
];
