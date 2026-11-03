import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { advanceWorld, completeDay, worldPhase } from '../src/world/engine.ts';
import type { WorldRecord } from '../src/world/types.ts';
let completed: WorldRecord | undefined;
/** 固定の進行中検体を実際に日次完了させる。原ファイルには書き込まない。 */
export function completedRecordDay(): WorldRecord {
  if (!completed) {
    let world = JSON.parse(
      gunzipSync(
        readFileSync(new URL('./fixtures/world-v19-in-progress.json.gz', import.meta.url)),
      ).toString('utf8'),
    ) as WorldRecord;
    let batches = 0;
    while (worldPhase(world) === 'playing') {
      if (++batches > 10000) throw new Error('集計テスト用の日次進行が完了しません');
      world = advanceWorld(world, 25);
    }
    completed = completeDay(world, world.currentDate);
  }
  return structuredClone(completed);
}
