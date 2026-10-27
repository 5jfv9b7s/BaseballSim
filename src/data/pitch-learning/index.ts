import type { PitchRepertoire } from '../../engine/types.ts';
import candidate1 from './hoshihara/player-a-10.json' with { type: 'json' };
import candidate2 from './hoshihara/player-a-11.json' with { type: 'json' };
import candidate3 from './hoshihara/player-a-12.json' with { type: 'json' };
import candidate4 from './hoshihara/player-a-25.json' with { type: 'json' };
import candidate5 from './hoshihara/player-a-26.json' with { type: 'json' };
import candidate6 from './hoshihara/player-a-27.json' with { type: 'json' };
import candidate7 from './aonagi/player-h-10.json' with { type: 'json' };
import candidate8 from './aonagi/player-h-11.json' with { type: 'json' };
import candidate9 from './aonagi/player-h-12.json' with { type: 'json' };
import candidate10 from './aonagi/player-h-25.json' with { type: 'json' };
import candidate11 from './aonagi/player-h-26.json' with { type: 'json' };
import candidate12 from './aonagi/player-h-27.json' with { type: 'json' };
import candidate13 from './kohaku/kohaku-player-a-10.json' with { type: 'json' };
import candidate14 from './kohaku/kohaku-player-a-11.json' with { type: 'json' };
import candidate15 from './kohaku/kohaku-player-a-12.json' with { type: 'json' };
import candidate16 from './kohaku/kohaku-player-a-25.json' with { type: 'json' };
import candidate17 from './kohaku/kohaku-player-a-26.json' with { type: 'json' };
import candidate18 from './kohaku/kohaku-player-a-27.json' with { type: 'json' };
import candidate19 from './asagiri/asagiri-player-h-10.json' with { type: 'json' };
import candidate20 from './asagiri/asagiri-player-h-11.json' with { type: 'json' };
import candidate21 from './asagiri/asagiri-player-h-12.json' with { type: 'json' };
import candidate22 from './asagiri/asagiri-player-h-25.json' with { type: 'json' };
import candidate23 from './asagiri/asagiri-player-h-26.json' with { type: 'json' };
import candidate24 from './asagiri/asagiri-player-h-27.json' with { type: 'json' };

/** 新規プレイ用の架空候補。既存の習得済み持ち球とは別入力。 */
export const pitchLearningCandidates = [
  ...candidate1,
  ...candidate2,
  ...candidate3,
  ...candidate4,
  ...candidate5,
  ...candidate6,
  ...candidate7,
  ...candidate8,
  ...candidate9,
  ...candidate10,
  ...candidate11,
  ...candidate12,
  ...candidate13,
  ...candidate14,
  ...candidate15,
  ...candidate16,
  ...candidate17,
  ...candidate18,
  ...candidate19,
  ...candidate20,
  ...candidate21,
  ...candidate22,
  ...candidate23,
  ...candidate24,
] as PitchRepertoire[];
