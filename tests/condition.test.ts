import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { conditionConfig } from '../config/condition.ts';
import { createConditionDefinitions } from '../src/data/world/condition.ts';
import { createRestDefinitions } from '../src/data/world/rest.ts';
import {
  createConditionWorld,
  createRestWorld,
  advanceWorld,
  completeDay,
  worldPhase,
} from '../src/world/engine.ts';
import {
  advanceConditionState,
  conditionStage,
  conditionView,
  compareConditionSamples,
  sampleConditions,
} from '../src/world/condition.ts';
import type { ConditionWorld } from '../src/world/condition.ts';
import type { ConditionSample } from '../src/world/condition-types.ts';
import type { WorldRecord } from '../src/world/types.ts';
import { registrationEligibleOn, registrationPreview } from '../src/world/registration.ts';
import { applyManagement } from '../src/world/management.ts';
import { WorldDatabase, DexieWorldStorage } from '../src/world/dexie-storage.ts';
import { WorldController } from '../src/world/controller.ts';
import { validateWorld, WorldValidator } from '../src/world/validation.ts';

const playerId = 'player-a-01';
function finishGames<T extends WorldRecord>(world: T): T {
  let next: WorldRecord = world;
  while (worldPhase(next) === 'playing') next = advanceWorld(next, 25);
  assert.equal(worldPhase(next), 'readyToComplete');
  return next as T;
}
function finishDay(world: ConditionWorld): ConditionWorld {
  return completeDay(finishGames(world), world.currentDate) as ConditionWorld;
}

test('調子入力：全120人の独立した初期値、版・境界・参照・欠損を検査する', () => {
  const definitions = createConditionDefinitions();
  const world = createConditionWorld(1, undefined, definitions);
  assert.equal(Object.keys(world.condition.players).length, 120);
  definitions.squads[0]!.conditionInputs![0]!.conditionMilli = 1000;
  assert.equal(world.condition.players[playerId]!.conditionMilli, 45000);
  assert.equal(definitions.squads[1]!.conditionInputs![0]!.conditionMilli, 45000);
  const mutations = [
    (d: typeof definitions) => {
      d.squads[0]!.conditionInputs!.pop();
    },
    (d: typeof definitions) => {
      d.squads[0]!.conditionInputs![0]!.playerId = 'missing';
    },
    (d: typeof definitions) => {
      d.squads[0]!.conditionInputs![0]!.targetMilli = 100001;
    },
    (d: typeof definitions) => {
      d.squads[0]!.conditionInputs![0]!.durationDays = 1;
    },
    (d: typeof definitions) => {
      d.conditionConfig!.stageBoundariesMilli = [20000, 20000, 60000, 80000];
    },
    (d: typeof definitions) => {
      d.conditionConfig!.minSegmentDays = 43;
    },
    (d: typeof definitions) => {
      d.conditionConfig!.reversionPermille = 1001;
    },
  ];
  for (const mutate of mutations) {
    const d = createConditionDefinitions();
    mutate(d);
    assert.throws(() => createConditionWorld(1, undefined, d));
  }
  const old = createRestDefinitions();
  old.conditionConfig = conditionConfig;
  assert.throws(() => createRestWorld(1, undefined, old), /旧定義/);
});

test('調子の波：smoothstepの中点・終点、中立復帰、専用乱数の全状態を保持する', () => {
  const definitions = createConditionDefinitions();
  Object.assign(definitions.squads[0]!.conditionInputs![0]!, {
    conditionMilli: 0,
    targetMilli: 100000,
    durationDays: 4,
  });
  let state = createConditionWorld(7, undefined, definitions).condition.players[playerId]!;
  const initial = structuredClone(state);
  const config = { ...conditionConfig, targetSpreadMilli: 0, reversionPermille: 100 };
  const values = [];
  for (let i = 0; i < 4; i++) {
    state = advanceConditionState(state, config, registrationEligibleOn(state.lastUpdatedOn, 1));
    values.push(state.conditionMilli);
  }
  assert.deepEqual(values, [15625, 50000, 84375, 100000]);
  assert.equal(initial.conditionMilli, 0);
  assert.equal(state.conditionModelState.state.targetMilli, 95000);
  assert.equal(state.conditionModelState.state.elapsedDays, 0);
  assert.equal(state.conditionModelState.state.rng.drawCount, 2);
  assert.throws(() => advanceConditionState(state, config, state.lastUpdatedOn), /連続/);
  let copy = structuredClone(state);
  for (let i = 0; i < 730; i++) {
    const date = registrationEligibleOn(state.lastUpdatedOn, 1);
    state = advanceConditionState(state, conditionConfig, date);
    copy = advanceConditionState(copy, conditionConfig, date);
    assert(
      Number.isInteger(state.conditionMilli) &&
        state.conditionMilli >= 0 &&
        state.conditionMilli <= 100000,
    );
    assert.deepEqual(state, copy);
  }
});

test('調子の表示：5段階の境界と直近5/10試合の始点終点差、欠測・登録期間', () => {
  assert.deepEqual(
    [0, 19999, 20000, 39999, 40000, 59999, 60000, 79999, 80000, 100000].map((v) =>
      conditionStage(v, conditionConfig),
    ),
    ['絶不調', '絶不調', '不調', '不調', '普通', '普通', '好調', '好調', '絶好調', '絶好調'],
  );
  const samples: ConditionSample[] = [48, 55, 60, 63, 66].map((v, i) => ({
    playerId,
    gameId: 'g' + i,
    clubId: 'c',
    squadId: 's',
    registrationId: 'r',
    date: '2026-09-' + (10 + i),
    gameOrder: i + 1,
    conditionMilli: v * 1000,
  }));
  assert.equal(compareConditionSamples([...samples].reverse(), 'r', 5).deltaMilli, 18000);
  assert.equal(compareConditionSamples(samples, 'r', 10).actualGames, 5);
  assert.equal(compareConditionSamples(samples.slice(0, 1), 'r', 5).deltaMilli, null);
  assert.equal(compareConditionSamples(samples, 'new-registration', 5).actualGames, 0);
  const longer = Array.from({ length: 12 }, (_, i) => ({
    ...samples[0]!,
    date: '2026-09-' + (10 + i),
    gameId: 'g' + i,
    gameOrder: i + 1,
    conditionMilli: i * 1000,
  }));
  assert.equal(compareConditionSamples(longer, 'r', 5).deltaMilli, 4000);
  assert.equal(compareConditionSamples(longer, 'r', 10).deltaMilli, 9000);
  assert.equal(compareConditionSamples(longer, 'r', 5).firstGameId, 'g7');
});

test('欠場も試合前に採取：一二軍120人、分割進行・再適用・保存検査で二重計上しない', () => {
  let base: ConditionWorld = createConditionWorld();
  const preview = registrationPreview(base)!;
  base = applyManagement(base, 'bench-rest', {
    kind: 'setGameBench',
    squadId: 'hoshihara-first',
    gameId: preview.gameId,
    playerIds: preview.roster.playerIds.filter((id) => id !== 'player-a-13'),
  }) as ConditionWorld;
  let one: ConditionWorld = base,
    many: ConditionWorld = base;
  for (let i = 0; i < 50; i++) one = advanceWorld(one, 1) as ConditionWorld;
  for (let i = 0; i < 2; i++) many = advanceWorld(many, 25) as ConditionWorld;
  assert.deepEqual(one, many);
  const world = finishGames(many);
  const samples = Object.values(world.condition.samples).flat();
  assert.equal(samples.length, 120);
  assert.equal(new Set(samples.map((s) => s.playerId)).size, 120);
  const roster = Object.values(world.registration.gameRosters[preview.gameId]!).find(
    (r) => r.squadId === 'hoshihara-first',
  )!;
  assert(!roster.playerIds.includes('player-a-13'));
  assert(samples.some((s) => s.playerId === 'player-a-13'));
  for (const sample of samples)
    assert.equal(sample.conditionMilli, base.condition.players[sample.playerId]!.conditionMilli);
  assert.deepEqual(sampleConditions(world, samples[0]!.gameId), world.condition);
  const validator: WorldValidator = new WorldValidator();
  validator.validate(world);
  validator.validate(world);
  const before = structuredClone(world.condition);
  conditionView(world);
  conditionView(world);
  assert.deepEqual(world.condition, before);
});

test('休養日・登録移動：波は日次で進み、現在登録期間だけ比較し旧試合を保存する', () => {
  let world = finishDay(createConditionWorld());
  const id = 'player-a-10';
  const before = structuredClone(world.condition);
  world = applyManagement(world, 'demote', {
    kind: 'setRegistrations',
    squadId: 'hoshihara-first',
    changes: [{ playerId: id, category: 'farm' }],
  }) as ConditionWorld;
  assert.deepEqual(world.condition, before);
  assert.equal(conditionView(world).find((r) => r.playerId === id)!.five.actualGames, 0);
  world = finishDay(world);
  assert.equal(conditionView(world).find((r) => r.playerId === id)!.five.actualGames, 0);
  const firstId = 'player-a-01';
  const firstCount = conditionView(world).find((r) => r.playerId === firstId)!.five.actualGames;
  const previous = world.condition.players[firstId]!.conditionMilli;
  world = finishDay(world); // 9/26は一軍休養日、二軍試合あり。
  assert.equal(conditionView(world).find((r) => r.playerId === id)!.five.actualGames, 1);
  assert.equal(
    conditionView(world).find((r) => r.playerId === firstId)!.five.actualGames,
    firstCount,
  );
  assert.notEqual(world.condition.players[firstId]!.conditionMilli, previous);
  assert(
    Object.values(world.condition.samples)
      .flat()
      .some((s) => s.playerId === id && s.squadId === 'hoshihara-first'),
  );
  validateWorld(world);
});

test('調子は能力・身体・試合乱数と分離し、旧v9と全短期試合・成績が一致する', () => {
  let world: ConditionWorld = createConditionWorld();
  let old = createRestWorld();
  while (worldPhase(world) !== 'scheduleComplete') {
    world = finishDay(world);
    old = completeDay(finishGames(old), old.currentDate) as typeof old;
  }
  assert.deepEqual(world.games, old.games);
  assert.deepEqual(world.stats, old.stats);
  assert.deepEqual(world.physical, old.physical);
  assert.deepEqual(world.restControl, old.restControl);
  assert.deepEqual(
    world.definitions.squads.map((s) => s.players),
    old.definitions.squads.map((s) => s.players),
  );
  const defs = createConditionDefinitions();
  Object.assign(defs.squads[0]!.conditionInputs![0]!, {
    conditionMilli: 90000,
    targetMilli: 95000,
  });
  Object.assign(defs.squads[0]!.physicalInputs![0]!, { energyMilli: 42000, fatigueMilli: 68000 });
  const tired = createConditionWorld(1, undefined, defs);
  assert.equal(conditionView(tired)[0]!.stage, '絶好調');
  assert.equal(tired.physical.players[playerId]!.fatigueMilli, 68000);
});

test('調子保存：内部状態・設定・試合前記録の改変を拒否し、途中から同じ波を再開する', async () => {
  const defs = createConditionDefinitions();
  defs.squads[0]!.conditionInputs![0]!.durationDays = 2;
  const world = advanceWorld(
    finishDay(finishDay(createConditionWorld(42, undefined, defs))),
    17,
  ) as ConditionWorld;
  const db = new WorldDatabase('condition-save');
  const storage = new DexieWorldStorage(db);
  try {
    await storage.save(world, 1, 'manual', 0);
    const loaded = (await storage.load('manual')).world as ConditionWorld;
    assert.deepEqual(loaded, world);
    assert.deepEqual(finishDay(loaded), finishDay(world));
    for (const mutate of [
      (w: ConditionWorld) => {
        w.condition.players[playerId]!.conditionModelState.state.rng.fullState.word ^= 1;
      },
      (w: ConditionWorld) => {
        w.condition.players[playerId]!.conditionModelState.state.targetMilli++;
      },
      (w: ConditionWorld) => {
        w.condition.players[playerId]!.conditionMilli++;
      },
      (w: ConditionWorld) => {
        Object.values(w.condition.samples)[0]![0]!.conditionMilli++;
      },
      (w: ConditionWorld) => {
        delete w.condition.samples[Object.keys(w.condition.samples)[0]!];
      },
      (w: ConditionWorld) => {
        w.definitions.conditionConfig!.stageBoundariesMilli[0] = 100000;
      },
    ]) {
      const bad = structuredClone(world);
      mutate(bad);
      assert.throws(() => validateWorld(bad));
    }
  } finally {
    await db.delete();
  }
});

test('旧v9固定保存：凍結ハッシュ・旧版のままの保存読込と続行を維持する', async () => {
  const bytes = readFileSync(new URL('./fixtures/world-v9-save.json.gz', import.meta.url));
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    'e054eeca48c114fd1ee7213a03099ec0adf233ea9444f63c57ac33afee5ff2f3',
  );
  const old = JSON.parse(gunzipSync(bytes).toString()) as WorldRecord;
  validateWorld(old);
  assert(!('condition' in old));
  const db = new WorldDatabase('condition-legacy');
  const storage = new DexieWorldStorage(db);
  try {
    await storage.save(old, 1, 'manual', 0);
    const loaded = (await storage.load('manual')).world;
    assert.deepEqual(loaded, old);
    assert.deepEqual(advanceWorld(loaded, 25), advanceWorld(old, 25));
  } finally {
    await db.delete();
  }
});

test('調子の日次保存失敗：表示と正本を進めず、再送でも一回だけ更新する', async () => {
  const definitions = createConditionDefinitions();
  definitions.schedule = [];
  const world = createConditionWorld(8, undefined, definitions);
  const db = new WorldDatabase('condition-retry');
  const storage = new DexieWorldStorage(db);
  try {
    await storage.save(world, 1, 'manual', 0);
    let fail = false;
    const controller = new WorldController({
      listSlots: () => storage.listSlots(),
      load: (s) => storage.load(s),
      save: (...args) => {
        if (fail) throw Error('test quota');
        return storage.save(...args);
      },
    });
    await controller.initialize();
    const before = await controller.dispatch({
      kind: 'load',
      slot: 'manual',
      commandId: 'load',
      localWorldId: 'v02-local',
      expectedStateRevision: 0,
    });
    const command = {
      kind: 'completeDay' as const,
      date: before.currentDate,
      commandId: 'day',
      localWorldId: 'v02-local' as const,
      expectedStateRevision: before.revision,
    };
    fail = true;
    await assert.rejects(controller.dispatch(command), /quota/);
    assert.deepEqual(controller.query().condition, before.condition);
    assert.equal(controller.query().currentDate, before.currentDate);
    fail = false;
    const after = await controller.dispatch(command);
    assert.deepEqual(await controller.dispatch(command), after);
    const loaded = (await storage.load('auto')).world as ConditionWorld;
    assert.deepEqual(loaded, completeDay(world, world.currentDate));
  } finally {
    await db.delete();
  }
});

test(
  '年間調子：216試合・188日の全試合前値と内部状態を保存復元する',
  { timeout: 600000 },
  async () => {
    let world: ConditionWorld = createConditionWorld(
      20260924,
      undefined,
      createConditionDefinitions('annual'),
    );
    while (worldPhase(world) !== 'scheduleComplete') world = finishDay(world);
    assert.equal(world.completedDates.length, 188);
    assert.equal(Object.keys(world.condition.samples).length, 216);
    assert.equal(Object.values(world.condition.samples).flat().length, 216 * 30);
    assert.equal(conditionView(world)[0]!.ten.actualGames, 10);
    assert(
      Object.values(world.condition.players).every(
        (s) => s.conditionModelState.state.rng.drawCount > 0,
      ),
    );
    const db = new WorldDatabase('condition-annual');
    const storage = new DexieWorldStorage(db);
    try {
      await storage.save(world, 1, 'manual', 0);
      assert.deepEqual((await storage.load('manual')).world, world);
    } finally {
      await db.delete();
    }
  },
);
