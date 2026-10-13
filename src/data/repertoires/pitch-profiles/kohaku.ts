import type { PitchRepertoire } from '../../../engine/types.ts';
import { rating } from '../../rating.ts';

/** 新規の球種特性モデルだけに追加する架空の持ち球。球速・能力は未校正。 */
export const repertoires: PitchRepertoire[] = [
  {
    pitchId: 'profile-repertoire-kohaku-player-a-10-cutter',
    playerId: 'kohaku-player-a-10',
    pitchTypeCode: 'cutter',
    acquisitionProgressMilli: 100000,
    control: rating(52000),
    repeatability: rating(70000),
    velocity: { typicalCentiKph: 14200, maxCentiKph: 14700, spreadCentiKph: 450 },
  },
  {
    pitchId: 'profile-repertoire-kohaku-player-a-25-curve',
    playerId: 'kohaku-player-a-25',
    pitchTypeCode: 'curve',
    acquisitionProgressMilli: 100000,
    control: rating(52000),
    repeatability: rating(70000),
    velocity: { typicalCentiKph: 11600, maxCentiKph: 12100, spreadCentiKph: 450 },
  },
];
