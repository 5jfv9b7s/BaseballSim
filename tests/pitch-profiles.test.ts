import 'fake-indexeddb/auto';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { createGame, advanceGameEvent, runToCompletion } from '../src/game/engine.ts';
import { finalizeGame } from '../src/game/results.ts';
import { createIndividualPitchDefinitions } from '../src/data/world/individual-pitches.ts';
import { createPitchProfileFixture } from '../src/data/datasets/pitch-profiles.ts';
import { createPitchProfileConfig } from '../src/data/pitch-types/profiles.ts';
import { createPitchProfileDefinitions } from '../src/data/world/pitch-profiles.ts';
import {
  createPitchProfileWorld,
  createBullpenWorld,
  advanceWorld,
  completeDay,
  worldPhase,
} from '../src/world/engine.ts';
import { validateWorld } from '../src/world/validation.ts';
import { WorldDatabase, DexieWorldStorage } from '../src/world/dexie-storage.ts';
import { validatePitchProfiles } from '../src/engine/pitch-profile-validation.ts';
import { pitchMovement } from '../src/engine/pitch-movement.ts';
import { canonicalJson, sha256, validateCompletedRecord } from '../src/storage/codec.ts';
import type { WorldRecord } from '../src/world/types.ts';
import type { PitchType } from '../src/engine/types.ts';
import { performanceDetails } from '../src/game/performance.ts';

function finishDay(world: WorldRecord, chunk: number) {
  while (worldPhase(world) === 'playing') world = advanceWorld(world, chunk);
  assert.equal(worldPhase(world), 'readyToComplete');
  return completeDay(world, world.currentDate);
}

test('球種入力：辞書だけの球種・欠損・非有限係数・不正軸・旧版混入を拒否', () => {
  const config = createPitchProfileConfig();
  validatePitchProfiles(config);
  assert.equal(config.profiles.length, 9);
  for (const mutate of [
    (c: typeof config) => {
      c.profiles.push(c.profiles[0]!);
    },
    (c: typeof config) => {
      c.profiles[0]!.delivery.spinAxis.xPpm = 0;
    },
    (c: typeof config) => {
      c.profiles[0]!.selection.baseWeight = 0;
    },
    (c: typeof config) => {
      c.movement.breakMmPerRpm = NaN;
    },
    (c: typeof config) => {
      c.movement.recognitionBase = 1;
    },
  ]) {
    const c = structuredClone(config);
    mutate(c);
    assert.throws(() => validatePitchProfiles(c));
  }
  const fixture = createPitchProfileFixture();
  // 名前だけ登録され、特性が未定義の球種で拒否を確認する。
  fixture.pitches[0]!.pitchTypeCode = 'slurve';
  assert.throws(() => createGame(1, fixture, 'game-prototype-v11'), /未対応の球種/);
  assert.throws(() => createGame(1, createPitchProfileFixture(), 'game-prototype-v10'), /版が一致/);
  const old = createBullpenWorld();
  old.definitions.pitchProfiles = config;
  assert.throws(() => validateWorld(old), /旧定義/);
});

test('変化量：左右の鏡像・無回転・速度依存・入力不変を満たす', () => {
  const c = createPitchProfileConfig();
  const d = c.profiles.find((p) => p.code === 'curve')!.delivery;
  const original = structuredClone(d);
  const right = pitchMovement(d, d.spinRateRpm, 13000, 'R', c.movement);
  const left = pitchMovement(d, d.spinRateRpm, 13000, 'L', c.movement);
  assert.equal(right.horizontalBreakMm, -left.horizontalBreakMm);
  assert.equal(right.verticalBreakMm, left.verticalBreakMm);
  assert.equal(right.release.lateralMm, -left.release.lateralMm);
  assert.equal(pitchMovement(d, 0, 13000, 'R', c.movement).horizontalBreakMm, 0);
  assert.ok(
    Math.abs(pitchMovement(d, d.spinRateRpm, 10000, 'R', c.movement).verticalBreakMm) >
      Math.abs(right.verticalBreakMm),
  );
  assert.deepEqual(d, original);
});

test('9球種：実投球に回転・変化量を残し、1球を同じ入力から再現する', () => {
  for (const profile of createPitchProfileConfig().profiles) {
    const fixture = createPitchProfileFixture();
    const pitcherId = fixture.teams.home.pitcherIds[0]!;
    fixture.pitches = fixture.pitches.filter((p) => p.playerId !== pitcherId);
    const source = createPitchProfileFixture().pitches.find((p) => p.playerId === pitcherId)!;
    fixture.pitches.push({ ...source, pitchTypeCode: profile.code });
    const game = createGame(99, fixture, 'game-prototype-v11');
    const original = structuredClone(game);
    const a = advanceGameEvent(game.state, game.fixture);
    const b = advanceGameEvent(game.state, game.fixture);
    assert.deepEqual(a, b);
    assert.deepEqual(game, original);
    assert.equal(a.event.pitch!.pitchTypeCode, profile.code);
    assert.equal(a.event.pitch!.measurement.availableFields.length, 5);
    assert.ok(Number.isInteger(a.event.pitch!.measurement.spinRateRpm));
    assert.ok(Number.isInteger(a.event.pitch!.measurement.horizontalBreakMm));
  }
});

test('変化の認識：同じ配球・制球でも特性から打者判断が変わる', () => {
  let changed = false;
  for (let seed = 1; seed <= 20; seed++) {
    const a = createGame(seed, undefined, 'game-prototype-v11');
    const fixture = structuredClone(a.fixture);
    fixture.pitchProfiles!.movement.breakMmPerRpm = 0;
    const b = createGame(seed, fixture, 'game-prototype-v11');
    const first = advanceGameEvent(a.state, a.fixture);
    const neutral = advanceGameEvent(b.state, b.fixture);
    if (
      first.event.pitchDecision!.swingProbability !==
        neutral.event.pitchDecision!.swingProbability ||
      first.event.pitchDecision!.contactProbability !==
        neutral.event.pitchDecision!.contactProbability
    )
      changed = true;
  }
  assert.ok(changed, '特性を表示するだけでなく、投球から判断へ反映する');
});

test('新規世界：全4球団と二軍に8持ち球を追加し、同じ入力を固定する', () => {
  const definitions = createPitchProfileDefinitions();
  assert.equal(
    definitions.squads.flatMap((s) => s.pitches).filter((p) => p.pitchId.startsWith('profile-'))
      .length,
    8,
  );
  const world = createPitchProfileWorld(1, undefined, definitions);
  definitions.pitchProfiles!.profiles[0]!.delivery.spinRateRpm++;
  assert.notEqual(
    world.definitions.pitchProfiles!.profiles[0]!.delivery.spinRateRpm,
    definitions.pitchProfiles!.profiles[0]!.delivery.spinRateRpm,
  );
  for (const squad of world.definitions.squads) assert.equal(squad.pitches.length, 20);
  assert.deepEqual(finishDay(world, 1), finishDay(world, 25));
});

test('v11の終了試合：保存内の球種設定で全記録を再実行し、改変を拒否', () => {
  const game = createGame(99, undefined, 'game-prototype-v11');
  runToCompletion(game);
  finalizeGame(game);
  validateCompletedRecord(JSON.parse(canonicalJson(game)));
  const bad = structuredClone(game);
  bad.events.find((e) => e.pitch)!.pitch!.measurement.horizontalBreakMm!++;
  assert.throws(() => validateCompletedRecord(bad));
});

test('v15の途中保存：回転・持ち球・設定を復元し、再開結果が一致', async () => {
  const w = advanceWorld(createPitchProfileWorld(), 25);
  validateWorld(w);
  const bad = structuredClone(w);
  bad.games[bad.dayPlan.gameIds[0]!]!.fixture.pitchProfiles!.movement.breakMmPerRpm += 0.01;
  assert.throws(() => validateWorld(bad));
  const db = new WorldDatabase('pitch-profile-save');
  const storage = new DexieWorldStorage(db);
  try {
    await storage.save(w, 1, 'manual', 0);
    const loaded = (await storage.load('manual')).world;
    assert.deepEqual(loaded, w);
    assert.deepEqual(finishDay(loaded, 25), finishDay(w, 25));
  } finally {
    await db.delete();
  }
});

test('旧v10の投球は変化量なしのまま、新球種設定を補完しない', () => {
  const a = createGame(1, undefined, 'game-prototype-v10');
  assert.equal(a.fixture.pitchProfiles, undefined);
  const step = advanceGameEvent(a.state, a.fixture);
  assert.equal(step.event.pitch!.measurementModelVersion, 'endpoint-only-v1');
  assert.equal(step.event.pitch!.measurement.horizontalBreakMm, null);
  assert.equal(createBullpenWorld().definitions.pitchProfiles, undefined);
});

// 464a85f のソースで生成。現在の実装で期待値を作り直さない。
test('旧v14の固定世界：導入前の全状態と一致し、保存と再開を維持する', async () => {
  const frozen = JSON.parse(
    gunzipSync(
      readFileSync(new URL('./fixtures/world-v14-pitch-baseline.json.gz', import.meta.url)),
    ).toString('utf8'),
  ) as WorldRecord;
  assert.equal(
    await sha256(canonicalJson(frozen)),
    'ca924b070286c3a14db2b9ad971c43cfdf20a4e2e0c6764093eff0dc626aaea0',
  );
  assert.deepEqual(advanceWorld(createBullpenWorld(), 25), frozen);
  validateWorld(frozen);
  const db = new WorldDatabase('pitch-old-v14');
  try {
    const storage = new DexieWorldStorage(db);
    await storage.save(frozen, 1, 'manual', 0);
    const loaded = (await storage.load('manual')).world;
    assert.deepEqual(loaded, frozen);
    assert.deepEqual(finishDay(loaded, 25), finishDay(frozen, 25));
  } finally {
    await db.delete();
  }
});

test('選手固有の回転：テンプレートを変えず、再現性の上限でばらつきを消す', () => {
  const fixture = createPitchProfileFixture();
  const pitcherId = fixture.teams.home.pitcherIds[0]!;
  const pitch = fixture.pitches.find((p) => p.playerId === pitcherId)!;
  fixture.pitches = [pitch, ...fixture.pitches.filter((p) => p.playerId !== pitcherId)];
  pitch.delivery = structuredClone(
    fixture.pitchProfiles!.profiles.find((p) => p.code === pitch.pitchTypeCode)!.delivery,
  );
  pitch.delivery.spinRateRpm = 1800;
  pitch.repeatability = { valueMilli: 120000, ceilingMilli: 120000 };
  const game = createGame(3, fixture, 'game-prototype-v11');
  const event = advanceGameEvent(game.state, game.fixture).event;
  assert.equal(event.pitch!.measurement.spinRateRpm, 1800);
  assert.notEqual(fixture.pitchProfiles!.profiles[0]!.delivery.spinRateRpm, 1800);
});

test('新v15の年間進行：188日216試合を終え、年度末を保存内の球種で復元する', async () => {
  let world: WorldRecord = createPitchProfileWorld(
    20260924,
    undefined,
    createIndividualPitchDefinitions('annual'),
  );
  while (worldPhase(world) !== 'scheduleComplete') world = finishDay(world, 25);
  assert.equal(world.completedDates.length, 188);
  assert.equal(Object.keys(world.games).length, 216);
  assert.equal(Object.keys(world.statApplicationMarkers).length, 216);
  assert.equal(world.currentDate, '2026-10-01');
  assert.ok('seasonSummary' in world && world.seasonSummary);
  assert.ok('farmSummary' in world && world.farmSummary);
  assert.ok(
    Object.values(world.games).every(
      (game) => game.state.simulationVersion === 'game-prototype-v11',
    ),
  );
  const db = new WorldDatabase('pitch-new-annual');
  try {
    const storage = new DexieWorldStorage(db);
    await storage.save(world, 1, 'manual', 0);
    const loaded = (await storage.load('manual')).world;
    const { games: oldGames, ...oldCore } = world;
    const { games: newGames, ...newCore } = loaded;
    assert.deepEqual(newCore, oldCore);
    assert.deepEqual(Object.keys(newGames).sort(), Object.keys(oldGames).sort());
    for (const gameId of Object.keys(oldGames))
      assert.equal(
        await sha256(canonicalJson(newGames[gameId])),
        await sha256(canonicalJson(oldGames[gameId])),
      );
  } finally {
    await db.delete();
  }
});

test('保存内の球種名：現在の辞書から消えたコードでも補正表示と途中再開ができる', async () => {
  const definitions = createPitchProfileDefinitions();
  const profile = definitions.pitchProfiles!.profiles.find((p) => p.code === 'fastball')!;
  // JSON保存にだけ残る過去コードを模擬する。現行辞書へ追加しない。
  profile.code = 'archivedPitch' as PitchType;
  profile.name = '保存した球種名';
  for (const squad of definitions.squads) {
    for (const pitch of squad.pitches) {
      if (pitch.pitchTypeCode === 'fastball') pitch.pitchTypeCode = profile.code;
    }
  }
  const world = advanceWorld(createPitchProfileWorld(1, undefined, definitions), 25);
  const game = Object.values(world.games)[0]!;
  const details = performanceDetails(game.fixture, game.performance!);
  assert.ok(details.some((p) => p.abilities.some((a) => a.label === '保存した球種名：制球')));
  const db = new WorldDatabase('pitch-archived-code');
  try {
    const storage = new DexieWorldStorage(db);
    await storage.save(world, 1, 'manual', 0);
    const loaded = (await storage.load('manual')).world;
    assert.deepEqual(loaded, world);
    assert.deepEqual(advanceWorld(loaded, 25), advanceWorld(world, 25));
  } finally {
    await db.delete();
  }
});
