import { canonicalJson } from '../storage/codec.ts';
import type { WorldRecord } from './types.ts';

export interface WorldCheckpoint {
  world: WorldRecord;
  actionIndex: number;
  definitions: string;
  actions: string;
}
export interface CheckpointCache {
  checkpoint?: WorldCheckpoint;
}

/** 終了試合は既存検証で深く凍結済み。それ以外はキャッシュと呼出側で共有しない。 */
export function copyCheckpointWorld(world: WorldRecord): WorldRecord {
  const { games, ...core } = world;
  return { ...structuredClone(core), games: { ...games } } as WorldRecord;
}

/** 検証済みの日次境界だけ再利用する。新しく読み込んだゲーム記録は必ず全再実行へ戻る。 */
export function resumeCheckpoint(
  candidate: WorldRecord,
  checkpoint: WorldCheckpoint | undefined,
): { world: WorldRecord; actionIndex: number } | null {
  if (!checkpoint) return null;
  const base = checkpoint.world;
  const actions = 'management' in candidate ? candidate.management.actions : [];
  if (
    candidate.version !== base.version ||
    candidate.seed !== base.seed ||
    candidate.worldId !== base.worldId ||
    ('management' in candidate ? candidate.management.controlledSquadId : null) !==
      ('management' in base ? base.management.controlledSquadId : null) ||
    candidate.completedDates.length < base.completedDates.length ||
    !base.completedDates.every((date, index) => candidate.completedDates[index] === date) ||
    actions.length < checkpoint.actionIndex ||
    canonicalJson(actions.slice(0, checkpoint.actionIndex)) !== checkpoint.actions ||
    canonicalJson(candidate.definitions) !== checkpoint.definitions ||
    !Object.entries(base.games).every(([id, game]) => candidate.games[id] === game)
  )
    return null;
  return { world: copyCheckpointWorld(base), actionIndex: checkpoint.actionIndex };
}

/** 最終照合が成功した後だけ、私有コピーへ差し替える。試合途中を境界にしない。 */
export function makeCheckpoint(world: WorldRecord, actionIndex: number): WorldCheckpoint {
  return {
    world: copyCheckpointWorld(world),
    actionIndex,
    definitions: canonicalJson(world.definitions),
    actions: canonicalJson(
      'management' in world ? world.management.actions.slice(0, actionIndex) : [],
    ),
  };
}
