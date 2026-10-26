import 'fake-indexeddb/auto';
import { createRookieDevelopmentDefinitions } from '../../src/data/world/rookie-development.ts';
import {
  createRookieDevelopmentWorld,
  advanceWorld,
  completeDay,
  worldPhase,
} from '../../src/world/engine.ts';
import { DexieWorldStorage, WorldDatabase } from '../../src/world/dexie-storage.ts';
import { exportStoredPlay } from '../../src/world/backup-storage.ts';
import { growthView } from '../../src/world/growth-view.ts';

/** 表示値の差し替えではなく、試験専用100%設定で実計算・実保存したファイル。 */
export async function rookieSaveFixture() {
  const d = createRookieDevelopmentDefinitions();
  d.awakeningConfig!.opportunity = { basePpm: 1000000, ambitionPpm: 0 };
  let w = createRookieDevelopmentWorld(31, 'aonagi-first', d);
  while (worldPhase(w) === 'playing') w = advanceWorld(w, 25) as typeof w;
  w = completeDay(w, w.currentDate) as typeof w;
  const db = new WorldDatabase('rookie-e2e-fixture');
  try {
    const storage = new DexieWorldStorage(db);
    await storage.save(w, 1, 'manual', 0);
    return {
      buffer: Buffer.from(await exportStoredPlay(db, storage.localWorldId, 'manual')),
      events: growthView(w)!.rookieAwakening!.events,
    };
  } finally {
    db.close();
    await db.delete();
  }
}
