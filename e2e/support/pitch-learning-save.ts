import 'fake-indexeddb/auto';
import { createPitchLearningDefinitions } from '../../src/data/world/pitch-learning.ts';
import {
  createPitchLearningWorld,
  advanceWorld,
  completeDay,
  worldPhase,
} from '../../src/world/engine.ts';
import { DexieWorldStorage, WorldDatabase } from '../../src/world/dexie-storage.ts';
import { exportStoredPlay } from '../../src/world/backup-storage.ts';

/** 境界確認専用の開始進度・機会。アプリの既定値は変更しない。実計算と実保存を使用。 */
export async function pitchLearningSaveFixture() {
  const d = createPitchLearningDefinitions();
  const squad = d.squads[0]!;
  const pitch = squad.pitches.find((p) => p.acquisitionProgressMilli === 0)!;
  pitch.acquisitionProgressMilli = 99999;
  d.growthConfig!.opportunity = { baseMilli: 100000, ambitionMilli: 0 };
  d.trainingPlans!.players.find((p) => p.playerId === pitch.playerId)!.settings = {
    target: { kind: 'pitchAcquisition', pitchId: pitch.pitchId },
    intensity: 'normal',
    autoAdjustForFatigue: false,
  };
  let w = createPitchLearningWorld(7, undefined, d);
  while (worldPhase(w) !== 'scheduleComplete') {
    while (worldPhase(w) === 'playing') w = advanceWorld(w, 25) as typeof w;
    w = completeDay(w, w.currentDate) as typeof w;
  }
  const db = new WorldDatabase('learning-ui-' + crypto.randomUUID());
  try {
    const storage = new DexieWorldStorage(db);
    await storage.save(w, 1, 'manual', 0);
    return {
      buffer: Buffer.from(await exportStoredPlay(db, storage.localWorldId, 'manual')),
      pitchId: pitch.pitchId,
      playerId: pitch.playerId,
    };
  } finally {
    await db.delete();
  }
}
