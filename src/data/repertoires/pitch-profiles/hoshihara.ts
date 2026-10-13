import type { PitchRepertoire } from '../../../engine/types.ts';
import { rating } from '../../rating.ts';

/** 新規の球種特性モデルだけに追加する架空の持ち球。球速・能力は未校正。 */
export const repertoires: PitchRepertoire[] = [
  {
    pitchId: 'profile-repertoire-player-a-10-curve',
    playerId: 'player-a-10',
    pitchTypeCode: 'curve',
    acquisitionProgressMilli: 100000,
    control: rating(52000),
    repeatability: rating(70000),
    velocity: { typicalCentiKph: 11800, maxCentiKph: 12300, spreadCentiKph: 450 },
  },
  {
    pitchId: 'profile-repertoire-player-a-25-splitter',
    playerId: 'player-a-25',
    pitchTypeCode: 'splitter',
    acquisitionProgressMilli: 100000,
    control: rating(52000),
    repeatability: rating(70000),
    velocity: { typicalCentiKph: 13800, maxCentiKph: 14300, spreadCentiKph: 450 },
  },
];
