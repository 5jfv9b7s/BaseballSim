import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { individualRepertoires } from '../src/data/repertoires/individual/index.ts';
import { createIndividualPitchDefinitions } from '../src/data/world/individual-pitches.ts';
import { createIndividualPitchFixture } from '../src/data/datasets/individual-pitches.ts';
import { createPitchProfileDefinitions } from '../src/data/world/pitch-profiles.ts';
import { createGame, advanceGameEvent } from '../src/game/engine.ts';
import {
  createPitchProfileWorld,
  advanceWorld,
  completeDay,
  worldPhase,
} from '../src/world/engine.ts';
import { validateWorld } from '../src/world/validation.ts';
import { WorldDatabase, DexieWorldStorage } from '../src/world/dexie-storage.ts';
import { canonicalJson, sha256 } from '../src/storage/codec.ts';
import type { WorldRecord } from '../src/world/types.ts';

function finishDay(world: WorldRecord) {
  while (worldPhase(world) === 'playing') world = advanceWorld(world, 25);
  assert.equal(worldPhase(world), 'readyToComplete');
  return completeDay(world, world.currentDate);
}

test('個人別持ち球：全4球団24投手80件を網羅し、新規試合と日程が同じ値を使う', () => {
  const world = createPitchProfileWorld();
  assert.equal(world.definitions.version, 'world-definitions-v15');
  assert.equal(individualRepertoires.length, 80);
  assert.equal(new Set(individualRepertoires.map((p) => p.playerId)).size, 24);
  assert.ok(individualRepertoires.every((p) => p.delivery));
  for (const squad of world.definitions.squads) {
    assert.equal(squad.pitches.length, 20);
    assert.equal(new Set(squad.pitches.map((p) => p.playerId)).size, 6);
  }
  const fixture = createIndividualPitchFixture();
  const worldPitches = world.definitions.squads.flatMap((s) => s.pitches);
  for (const pitch of fixture.pitches)
    assert.deepEqual(
      pitch,
      worldPitches.find((p) => p.pitchId === pitch.pitchId),
    );
  assert.deepEqual(createGame(1, undefined, 'game-prototype-v11').fixture.pitches, fixture.pitches);
  const fastballs = individualRepertoires.filter((p) => p.pitchTypeCode === 'fastball');
  assert.ok(new Set(fastballs.map((p) => p.delivery!.spinRateRpm)).size > 10);
  assert.ok(new Set(fastballs.map((p) => p.repeatability.valueMilli)).size > 10);
  // 一つの開始データの編集が別プレイ・ソース・旧定義へ漏れない。
  fixture.pitches[0]!.delivery!.spinRateRpm = 1;
  assert.notEqual(createIndividualPitchFixture().pitches[0]!.delivery!.spinRateRpm, 1);
  assert.notEqual(worldPitches[0]!.delivery!.spinRateRpm, 1);
  assert.ok(
    createPitchProfileDefinitions().squads.every((s) => s.pitches.every((p) => !p.delivery)),
  );
});

test('個人別持ち球の編集：不明な選手・重複ID・個人設定の欠落を取りこぼさない', () => {
  const original = [...individualRepertoires];
  for (const mutate of [
    () => {
      individualRepertoires[0]!.playerId = 'missing-player';
    },
    () => {
      individualRepertoires[0]!.pitchId = individualRepertoires[1]!.pitchId;
    },
    () => {
      delete individualRepertoires[0]!.delivery;
    },
    () => {
      Object.assign(individualRepertoires[0]!, { delivery: null });
    },
  ]) {
    try {
      // 選手ファイルがexportするオブジェクト自体は変更しない。
      individualRepertoires.splice(0, individualRepertoires.length, ...structuredClone(original));
      mutate();
      assert.throws(() => createIndividualPitchDefinitions());
    } finally {
      individualRepertoires.splice(0, individualRepertoires.length, ...original);
    }
  }
});

test('個人別球質：同じ球種・球速・seedでも投手の入力が実投球の回転と変化に反映される', () => {
  const fastballs = individualRepertoires.filter((p) => p.pitchTypeCode === 'fastball').slice(0, 2);
  const events = fastballs.map((source) => {
    const fixture = createIndividualPitchFixture();
    const id = fixture.teams.home.pitcherIds[0]!;
    const pitch = fixture.pitches.find((p) => p.playerId === id && p.pitchTypeCode === 'fastball')!;
    fixture.pitches = [pitch, ...fixture.pitches.filter((p) => p.playerId !== id)];
    pitch.delivery = structuredClone(source.delivery);
    pitch.repeatability = { valueMilli: 120000, ceilingMilli: 120000 };
    const game = createGame(99, fixture, 'game-prototype-v11');
    const step = advanceGameEvent(game.state, game.fixture);
    assert.deepEqual(step, advanceGameEvent(game.state, game.fixture));
    assert.equal(step.event.pitch!.measurement.spinRateRpm, source.delivery!.spinRateRpm);
    return step.event.pitch!;
  });
  assert.equal(events[0]!.pitchTypeCode, events[1]!.pitchTypeCode);
  assert.notEqual(events[0]!.measurement.spinRateRpm, events[1]!.measurement.spinRateRpm);
  assert.notEqual(
    events[0]!.measurement.horizontalBreakMm,
    events[1]!.measurement.horizontalBreakMm,
  );
});

test('個人別球質の保存：日次続行が一致し、記録後の球質改変は拒否される', async () => {
  const world = advanceWorld(createPitchProfileWorld(), 25);
  validateWorld(world);
  const broken = structuredClone(world);
  const game = broken.games[broken.dayPlan.gameIds[0]!]!;
  const pitch = game.fixture.pitches.find(
    (p) => p.pitchId === game.events.find((e) => e.pitch)!.pitch!.pitchId,
  )!;
  pitch.delivery!.spinRateRpm++;
  assert.throws(() => validateWorld(broken));
  const db = new WorldDatabase('individual-pitches-save');
  try {
    const storage = new DexieWorldStorage(db);
    await storage.save(world, 1, 'manual', 0);
    const loaded = (await storage.load('manual')).world;
    assert.deepEqual(loaded, world);
    assert.deepEqual(finishDay(loaded), finishDay(world));
  } finally {
    await db.delete();
  }
});

test('0.25.0固定保存：個人設定を追加せず当時の投球と再開結果を維持する', async () => {
  const frozen = JSON.parse(
    gunzipSync(
      readFileSync(new URL('./fixtures/world-v15-individual-baseline.json.gz', import.meta.url)),
    ).toString('utf8'),
  ) as WorldRecord;
  assert.equal(
    await sha256(canonicalJson(frozen)),
    'f2d9e35b4c3b1f69fdbadf713dd33109f68545a6be329889b8a4fa58dfeff700',
  );
  const old = createPitchProfileWorld(20260924, undefined, createPitchProfileDefinitions());
  assert.deepEqual(advanceWorld(old, 25), frozen);
  validateWorld(frozen);
  const db = new WorldDatabase('individual-pitches-old');
  try {
    const storage = new DexieWorldStorage(db);
    await storage.save(frozen, 1, 'manual', 0);
    const loaded = (await storage.load('manual')).world;
    assert.deepEqual(loaded, frozen);
    assert.deepEqual(finishDay(loaded), finishDay(frozen));
    assert.ok(loaded.definitions.squads.every((s) => s.pitches.every((p) => !p.delivery)));
  } finally {
    await db.delete();
  }
});
