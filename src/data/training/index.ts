import { createTrainingTargetCatalog } from './targets.ts';
import type { TrainingPlanInputs, TrainingSettings } from '../../world/training-types.ts';
import type { WorldDefinitions } from '../../world/types.ts';

/** 架空選手の開始時設定。効果の係数や成長予測ではない。 */
export const DEFAULT_TRAINING: TrainingSettings = {
  target: { kind: 'group', groupId: 'balanced' },
  intensity: 'normal',
  autoAdjustForFatigue: true,
};

/** 個別の初期指定を置く。固定選手IDをキーにし、省略選手は上の共通設定。 */
export const PLAYER_TRAINING_OVERRIDES: Record<string, TrainingSettings> = {};

export function createTrainingPlanInputs(definitions: WorldDefinitions): TrainingPlanInputs {
  const ids = definitions.squads.flatMap((s) => s.players.map((p) => p.playerId));
  for (const playerId of Object.keys(PLAYER_TRAINING_OVERRIDES))
    if (!ids.includes(playerId)) throw new Error('練習設定の固定選手IDが初期名簿にありません');
  return {
    version: 'training-plans-input-v1',
    catalog: createTrainingTargetCatalog(),
    players: ids.map((playerId) => ({
      playerId,
      settings: structuredClone(PLAYER_TRAINING_OVERRIDES[playerId] ?? DEFAULT_TRAINING),
    })),
  };
}
