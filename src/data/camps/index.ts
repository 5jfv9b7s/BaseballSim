import short from './short.json' with { type: 'json' };
import annual from './annual.json' with { type: 'json' };
import type { CampInputs } from '../../world/camp-types.ts';
import type { TrainingSettings } from '../../world/training-types.ts';
import type { WorldDefinitions } from '../../world/types.ts';

/** 正式な対象・時期は未決定。既存の日程内で動作確認する固定入力例。 */
export const DEFAULT_CAMP_TRAINING: TrainingSettings = {
  target: { kind: 'group', groupId: 'physical' },
  intensity: 'normal',
  autoAdjustForFatigue: true,
};
/** 固定選手ID別の上書き。通常練習とは独立して編集する。 */
export const CAMP_PLAYER_OVERRIDES: Record<string, TrainingSettings> = {};
export function createCampInputs(calendar: 'short' | 'annual', d: WorldDefinitions): CampInputs {
  const ids = d.squads.flatMap((s) => s.players.map((p) => p.playerId));
  for (const id of Object.keys(CAMP_PLAYER_OVERRIDES))
    if (!ids.includes(id)) throw Error('キャンプ設定の選手IDが初期名簿にありません');
  return {
    version: 'camp-inputs-v1',
    periods: structuredClone(calendar === 'annual' ? annual : short).map((period) => ({
      ...period,
      players: ids.map((playerId) => ({
        playerId,
        settings: structuredClone(CAMP_PLAYER_OVERRIDES[playerId] ?? DEFAULT_CAMP_TRAINING),
      })),
    })),
  };
}
