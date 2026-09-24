import 'fake-indexeddb/auto';
import { performance } from 'node:perf_hooks';
import { advanceWorld, completeDay, createAnnualWorld, worldPhase } from '../src/world/engine.ts';
import { DexieWorldStorage, WorldDatabase } from '../src/world/dexie-storage.ts';
import { canonicalJson, sha256 } from '../src/storage/codec.ts';
import type { WorldRecord } from '../src/world/types.ts';

/** 独立DBで全日次保存を通す容量試験。利用者のブラウザ保存には触れない。 */
const database = new WorldDatabase('annual-benchmark-' + crypto.randomUUID());
const storage = new DexieWorldStorage(database);
let world: WorldRecord = createAnnualWorld();
let slots = await storage.listSlots();
let saveMs = 0;
let maxSaveMs = 0;
let peakRssBytes = process.memoryUsage().rss;
const started = performance.now();
try {
  while (worldPhase(world) !== 'scheduleComplete') {
    while (worldPhase(world) === 'playing') world = advanceWorld(world, 25);
    world = completeDay(world, world.currentDate);
    const before = performance.now();
    slots = await storage.save(world, world.completedDates.length, 'auto', slots.storageRevision);
    const elapsed = performance.now() - before;
    saveMs += elapsed;
    maxSaveMs = Math.max(maxSaveMs, elapsed);
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
    if (world.currentDate.endsWith('-01')) console.log(world.currentDate, 'まで日次保存済み');
  }
  const progressionMs = performance.now() - started;
  const blocks = await database.save_blocks.toArray();
  const storedBytes = blocks.reduce((sum, block) => sum + block.payloadBytes.length, 0);
  const loadStart = performance.now();
  const loaded = (await new DexieWorldStorage(database).load('auto')).world;
  const loadMs = performance.now() - loadStart;
  // 巨大な全世界文字列を作らず、世界本体と各試合を個別に照合する。
  const { games: expectedGames, ...expectedCore } = world;
  const { games: actualGames, ...actualCore } = loaded;
  let reproducible =
    canonicalJson(expectedCore) === canonicalJson(actualCore) &&
    canonicalJson(Object.keys(expectedGames).sort()) ===
      canonicalJson(Object.keys(actualGames).sort());
  for (const gameId of Object.keys(expectedGames)) {
    reproducible &&=
      (await sha256(canonicalJson(expectedGames[gameId]))) ===
      (await sha256(canonicalJson(actualGames[gameId])));
  }
  if (!reproducible) throw new Error('年間記録の再現不一致');
  peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
  console.log(
    JSON.stringify(
      {
        days: world.completedDates.length,
        games: Object.keys(world.games).length,
        progressionMs: Math.round(progressionMs),
        saveMs: Math.round(saveMs),
        maxSaveMs: Math.round(maxSaveMs),
        loadMs: Math.round(loadMs),
        storedBytes,
        blocks: blocks.length,
        snapshots: await database.save_snapshots.count(),
        sampledPeakRssBytes: peakRssBytes,
        reproducible,
      },
      null,
      2,
    ),
  );
} finally {
  await database.delete();
}
