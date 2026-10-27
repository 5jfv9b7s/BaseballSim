import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { createPitchLearningDefinitions } from '../src/data/world/pitch-learning.ts';
import {
  createPitchLearningWorld,
  advanceWorld,
  completeDay,
  worldPhase,
} from '../src/world/engine.ts';
import { DexieWorldStorage, WorldDatabase } from '../src/world/dexie-storage.ts';
import { exportStoredPlay } from '../src/world/backup-storage.ts';
import { decodeBackup } from '../src/world/backup-package.ts';
import { canonicalJson, sha256 } from '../src/storage/codec.ts';
import type { WorldRecord } from '../src/world/types.ts';

type Current = ReturnType<typeof createPitchLearningWorld>;
async function hashes(world: WorldRecord) {
  assert.ok('growth' in world);
  const { games, growth, ...core } = world,
    { days, ...state } = growth.state;
  const gameHashes: Record<string, string> = {},
    dayHashes: Record<string, string> = {};
  for (const id of Object.keys(games).sort())
    gameHashes[id] = await sha256(canonicalJson(games[id]));
  for (const date of Object.keys(days).sort())
    dayHashes[date] = await sha256(canonicalJson(days[date]));
  return {
    core: await sha256(canonicalJson(core)),
    growth: await sha256(canonicalJson({ ...growth, state })),
    games: gameHashes,
    days: dayHashes,
  };
}

test('新球種付き年間：188日216試合・習得後登板・407ブロックをDB/バックアップ復元', async () => {
  const d = createPitchLearningDefinitions('annual');
  // 実際の既定速度。CPUも同じ指定なら同じ習得処理を使う。
  for (const squad of d.squads)
    for (const pitch of squad.pitches.filter((p) => p.acquisitionProgressMilli < 100000)) {
      const target = { kind: 'pitchAcquisition' as const, pitchId: pitch.pitchId };
      d.trainingPlans!.players.find((p) => p.playerId === pitch.playerId)!.settings.target = target;
      for (const period of d.campInputs!.periods)
        period.players.find((p) => p.playerId === pitch.playerId)!.settings.target = target;
    }
  let world: Current | null = createPitchLearningWorld(20260924, undefined, d);
  while (worldPhase(world) !== 'scheduleComplete') {
    while (worldPhase(world) === 'playing') world = advanceWorld(world, 25) as Current;
    world = completeDay(world, world.currentDate) as Current;
    if (world.completedDates.length % 30 === 0) {
      console.log('新球種年間：' + world.completedDates.length + '日');
      await setImmediate();
    }
  }
  assert.equal(world.completedDates.length, 188);
  assert.equal(Object.keys(world.games).length, 216);
  assert.equal(Object.keys(world.growth.state.days).length, 188);
  assert.equal(world.currentDate, '2026-10-01');
  const acquired = Object.entries(world.growth.state.acquisition).filter(
    ([, p]) => p.progressMilli === 100000,
  );
  assert.ok(acquired.length > 0, '既定モデルで習得後の保存経路も検査する');
  for (const game of Object.values(world.games))
    for (const event of game.events) {
      if (!event.pitch) continue;
      const learning: import('../src/world/pitch-learning-types.ts').PitchAcquisition | undefined =
        world.growth.state.acquisition[event.pitch.pitchId];
      if (learning) {
        assert.equal(learning.progressMilli, 100000);
        assert.ok(
          learning.acquiredOn! < d.schedule.find((s) => s.gameId === game.state.gameId)!.date,
        );
      }
    }
  const expected = await hashes(world),
    db = new WorldDatabase('pitch-learning-annual-' + crypto.randomUUID());
  try {
    const save = async (value: Current) => {
      const storage = new DexieWorldStorage(db);
      await storage.save(value, 1, 'manual', 0);
      return storage.localWorldId;
    };
    console.log('新球種年間：完走・保存、習得' + acquired.length + '球');
    const localId = await save(world);
    world = null;
    const snapshot = (await db.save_snapshots.toArray())[0]!;
    assert.equal(snapshot.blockRefs.length, 407);
    assert.ok(snapshot.blockRefs.every((b) => b.rawBytes <= 16 * 1024 * 1024));
    console.log('新球種年間：DB復元');
    assert.deepEqual(
      await hashes((await new DexieWorldStorage(db, localId).load('manual')).world),
      expected,
    );
    console.log('新球種年間：バックアップ復元');
    assert.deepEqual(
      await hashes((await decodeBackup(await exportStoredPlay(db, localId, 'manual'))).world),
      expected,
    );
  } finally {
    await db.delete();
  }
});
