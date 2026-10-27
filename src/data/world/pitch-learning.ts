import { createCampDevelopmentDefinitions } from './camp-development.ts';
import { PITCH_LEARNING_CONFIG } from '../../../config/pitch-learning.ts';
import { pitchLearningCandidates as candidates } from '../pitch-learning/index.ts';
import { ensure } from '../../engine/validation.ts';
import type { WorldDefinitions } from '../../world/types.ts';

/** 未習得球も開始時入力として固定。試合開始時に球種を生成しない。 */
export function createPitchLearningDefinitions(
  calendar: 'short' | 'annual' = 'short',
): WorldDefinitions {
  const base = createCampDevelopmentDefinitions(calendar);
  const playerIds = new Set(base.squads.flatMap((s) => s.players.map((p) => p.playerId)));
  ensure(
    candidates.every((p) => playerIds.has(p.playerId)),
    '球種習得候補に不明な選手がいます',
  );
  return {
    ...base,
    version: 'world-definitions-v26',
    pitchLearningConfig: structuredClone(PITCH_LEARNING_CONFIG),
    squads: base.squads.map((squad) => ({
      ...squad,
      pitches: [
        ...squad.pitches,
        ...structuredClone(candidates).filter((p) =>
          squad.players.some((player) => player.playerId === p.playerId),
        ),
      ],
    })),
  };
}
