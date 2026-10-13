import type { PitchRepertoire } from '../../../engine/types.ts';
import { rating } from '../../rating.ts';

/** 新規の球種特性モデルだけに追加する架空の持ち球。球速・能力は未校正。 */
export const repertoires: PitchRepertoire[] = [
  {
    pitchId: 'profile-repertoire-player-h-10-changeup',
    playerId: 'player-h-10',
    pitchTypeCode: 'changeup',
    acquisitionProgressMilli: 100000,
    control: rating(52000),
    repeatability: rating(70000),
    velocity: { typicalCentiKph: 12700, maxCentiKph: 13200, spreadCentiKph: 450 },
  },
  {
    pitchId: 'profile-repertoire-player-h-25-sweeper',
    playerId: 'player-h-25',
    pitchTypeCode: 'sweeper',
    acquisitionProgressMilli: 100000,
    control: rating(52000),
    repeatability: rating(70000),
    velocity: { typicalCentiKph: 13000, maxCentiKph: 13500, spreadCentiKph: 450 },
  },
];
