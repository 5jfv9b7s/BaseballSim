import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createBullpenDefinitions } from '../src/data/world/bullpen.ts';
import { createReliefDefinitions } from '../src/data/world/relief.ts';
import {
  createBullpenWorld,
  createReliefWorld,
  createScheduledGame,
  advanceWorld,
  completeDay,
  worldPhase,
} from '../src/world/engine.ts';
import { advanceGameEvent } from '../src/game/engine.ts';
import { selectReliever } from '../src/game/relief.ts';
import { applyPhysicalGame, activityKey } from '../src/world/physical.ts';
import { validateWorld, WorldValidator } from '../src/world/validation.ts';
import { WorldDatabase, DexieWorldStorage } from '../src/world/dexie-storage.ts';
import { WorldController } from '../src/world/controller.ts';
import type { BullpenWorld } from '../src/world/bullpen.ts';
import type { WorldRecord } from '../src/world/types.ts';

const p1 = 'player-a-10',
  p2 = 'player-a-11',
  p3 = 'player-a-12';
const squadId = 'hoshihara-first';
function setup() {
  const w = createBullpenWorld();
  const game = structuredClone(createScheduledGame(w, w.dayPlan.gameIds[0]!));
  game.state.half = 'bottom';
  game.state.pitcherPitchCounts[p1] = 70;
  return game;
}
function finish<T extends WorldRecord>(w: T, count = 25): T {
  let next: WorldRecord = w;
  while (worldPhase(next) === 'playing') next = advanceWorld(next, count);
  assert.equal(worldPhase(next), 'readyToComplete');
  return next as T;
}
const day = <T extends WorldRecord>(w: T, count = 25) =>
  completeDay(finish(w, count), w.currentDate) as T;
function early(calendar: 'short' | 'annual' = 'short') {
  const defs = createBullpenDefinitions(calendar);
  defs.bullpenConfig!.leadPitches = 200;
  defs.bullpenConfig!.requiredPitches = 100;
  const roles = defs.reliefPolicyInputs!.find((p) => p.squadId === squadId)!.reliefRoles;
  roles.find((r) => r.playerId === p2)!.conditions.endInning = 1;
  return createBullpenWorld(20260924, undefined, defs);
}

test('ブルペン入力：8チームの独立設定・数値境界・身体版・旧版への混入を検査', () => {
  const defs = createBullpenDefinitions();
  const world = createBullpenWorld(1, undefined, defs);
  assert.equal(defs.bullpenInputs!.length, 8);
  assert.equal(world.physical.version, 'physical-load-v2');
  defs.bullpenInputs![0]!.enabled = false;
  defs.bullpenConfig!.requiredPitches = 1;
  assert.equal(world.definitions.bullpenInputs![0]!.enabled, true);
  assert.equal(world.definitions.bullpenConfig!.requiredPitches, 8);
  assert.equal(defs.bullpenInputs![1]!.enabled, true);
  for (const mutate of [
    (d: typeof defs) => {
      d.bullpenInputs!.pop();
    },
    (d: typeof defs) => {
      d.bullpenInputs![0]!.squadId = 'missing';
    },
    (d: typeof defs) => {
      d.bullpenInputs![0]!.enabled = 1 as unknown as boolean;
    },
    (d: typeof defs) => {
      d.bullpenConfig!.requiredPitches = 0;
    },
    (d: typeof defs) => {
      d.bullpenConfig!.leadPitches = 201;
    },
    (d: typeof defs) => {
      d.bullpenConfig!.leadPitches = NaN;
    },
    (d: typeof defs) => {
      d.physicalConfig!.version = 'physical-load-v1';
    },
  ]) {
    const d = createBullpenDefinitions();
    mutate(d);
    assert.throws(() => createBullpenWorld(1, undefined, d));
  }
  const old = createReliefDefinitions();
  old.bullpenConfig = defs.bullpenConfig;
  assert.throws(() => createReliefWorld(1, undefined, old), /旧定義/);
});

test('準備境界：球数の先行目安で開始し、実投球8球で完了、未準備は登板しない', () => {
  const g = setup();
  g.state.pitcherPitchCounts[p1] = 69;
  let step = advanceGameEvent(g.state, g.fixture);
  assert.equal(step.state.bullpen!.teams.away.players[p2]!.phase, 'idle');
  assert.equal(g.state.bullpen!.teams.away.players[p2]!.phase, 'idle');
  for (let n = 1; n <= 8; n++) {
    step.state.outs = 0;
    step = advanceGameEvent(step.state, g.fixture);
    const entry = step.state.bullpen!.teams.away.players[p2]!;
    assert.equal(entry.progressPitches, n);
    assert.equal(entry.phase, n === 8 ? 'ready' : 'warming');
    assert.equal(selectReliever(step.state, g.fixture, 'away').selectedId, n === 8 ? p2 : null);
  }
  assert.equal(step.state.bullpen!.nextStartOrder, 2);
});

test('準備待ち：交代基準到達後も未完了なら続投し、完了後の打席間に交代する', () => {
  const g = setup();
  g.fixture.bullpenPolicy!.config = {
    version: 'auto-bullpen-v1',
    leadPitches: 0,
    requiredPitches: 3,
  };
  g.state.pitcherPitchCounts[p1] = 90;
  let step = advanceGameEvent(g.state, g.fixture);
  assert.equal(step.event.kind, 'pitch');
  assert.match(step.event.reliefDecision!.candidates[0]!.reason, /準備/);
  for (let n = 0; n < 2; n++) {
    step.state.outs = 0;
    step = advanceGameEvent(step.state, g.fixture);
  }
  step.state.paPitches = 0;
  step.state.count = { balls: 0, strikes: 0 };
  const before = structuredClone(step.state.rng);
  step = advanceGameEvent(step.state, g.fixture);
  assert.equal(step.event.kind, 'substitution');
  assert.equal(step.event.substitution!.inPlayerId, p2);
  assert.deepEqual(step.state.rng, before);
  assert.equal(step.event.bullpenActions![0]!.kind, 'entered');
  assert.deepEqual(step.state.usedPitcherIds!.away, [p1, p2]);
});

test('準備中止：点差条件の変化で中止し、次候補を新しい開始順で準備する', () => {
  const g = setup();
  g.fixture.reliefPolicy!.teams.away.reliefRoles.find(
    (r) => r.playerId === p2,
  )!.conditions.scoreStates = ['lead'];
  g.state.score.away = 2;
  let step = advanceGameEvent(g.state, g.fixture);
  assert.equal(step.state.bullpen!.teams.away.players[p2]!.phase, 'warming');
  step.state.score = { away: 0, home: 2 };
  step = advanceGameEvent(step.state, g.fixture);
  assert.deepEqual(
    step.event.bullpenActions!.map((a) => [a.playerId, a.kind]),
    [
      [p2, 'cancelled'],
      [p3, 'started'],
    ],
  );
  assert.equal(step.state.bullpen!.teams.away.players[p3]!.startOrder, 2);
  assert.equal(step.state.bullpen!.teams.away.players[p2]!.phase, 'idle');
});

test('進行単位：攻守交代・相手の守備投球・表示は準備を進めず、終了時に待機へ戻す', () => {
  const g = setup();
  let step = advanceGameEvent(g.state, g.fixture);
  step.state.phase = 'halfComplete';
  const before = structuredClone(step.state.bullpen!.teams.away);
  step = advanceGameEvent(step.state, g.fixture);
  assert.deepEqual(step.state.bullpen!.teams.away, before);
  step = advanceGameEvent(step.state, g.fixture);
  assert.deepEqual(step.state.bullpen!.teams.away, before);
  step.state.phase = 'halfComplete';
  step.state.inning = 9;
  step.state.half = 'bottom';
  step.state.score = { away: 3, home: 1 };
  step = advanceGameEvent(step.state, g.fixture);
  assert.equal(step.state.phase, 'gameComplete');
  assert.equal(step.state.bullpen!.teams.away.players[p2]!.phase, 'idle');
  assert(step.event.bullpenActions!.some((a) => a.kind === 'cancelled'));
});

test('未登板負荷：準備中止した未登板投手にも1開始分を記録し、分割・再適用で二重にしない', () => {
  const before = early();
  const a = finish(before, 1),
    b = finish(before, 25);
  assert.deepEqual(a, b);
  const gameId = before.dayPlan.gameIds[0]!,
    game = a.games[gameId]!;
  assert(!game.state.usedPitcherIds!.away.includes(p2));
  const starts = game.events
    .flatMap((e) => e.bullpenActions ?? [])
    .filter((e) => e.playerId === p2 && e.kind === 'started');
  assert.equal(starts.length, 1);
  const loads = a.physical.activityLoads[activityKey(p2, a.currentDate)]!.sourceLoads;
  assert.equal(loads.find((l) => l.kind === 'preparation')!.actualCounts, 1);
  assert.equal(
    loads.find((l) => l.kind === 'preparation')!.workloadUnits,
    a.definitions.physicalConfig!.workloadUnits.preparation,
  );
  assert.equal(
    loads.some((l) => l.kind === 'pitching'),
    false,
  );
  assert.deepEqual(applyPhysicalGame(a, gameId, game), a.physical);
  assert.equal(
    a.registration.gameRosters[gameId]!.away.participants.find((p) => p.playerId === p2)!.appeared,
    false,
  );
});

test('準備負荷：登板時の二重加算を防ぎ、CPUと二軍にも開始イベントを適用する', () => {
  const w = finish(createBullpenWorld());
  let entered = 0;
  for (const game of Object.values(w.games)) {
    for (const side of ['away', 'home'] as const) {
      const actions = game.events
        .flatMap((e) => e.bullpenActions ?? [])
        .filter((a) => a.side === side);
      assert(actions.some((a) => a.kind === 'started'));
      for (const id of game.fixture.teams[side].pitcherIds.slice(1)) {
        const starts = actions.filter((a) => a.kind === 'started' && a.playerId === id).length;
        const loads = w.physical.activityLoads[activityKey(id, w.currentDate)]?.sourceLoads;
        const prep = loads?.find(
          (l) => l.sourceKey === JSON.stringify([game.state.gameId, 1, 'preparation']),
        );
        assert.equal(prep?.actualCounts ?? 0, starts);
      }
      entered += actions.filter((a) => a.kind === 'entered').length;
    }
  }
  assert(entered > 0);
});

test('準備無効：旧v13と短期全試合・成績・身体状態を維持し、旧モデルへ規則を追加しない', () => {
  const defs = createBullpenDefinitions();
  defs.bullpenInputs!.forEach((i) => {
    i.enabled = false;
  });
  let a: WorldRecord = createBullpenWorld(20260924, undefined, defs),
    b: WorldRecord = createReliefWorld();
  while (worldPhase(a) !== 'scheduleComplete') {
    a = day(a);
    b = day(b);
  }
  const normalizedGames = structuredClone(a.games);
  for (const g of Object.values(normalizedGames)) {
    delete g.fixture.bullpenPolicy;
    delete g.state.bullpen;
  }
  assert.deepEqual(normalizedGames, b.games);
  assert.deepEqual(a.stats, b.stats);
  if ('physical' in a && 'physical' in b)
    assert.deepEqual({ ...a.physical, version: 'physical-load-v1' }, b.physical);
});

test('準備途中保存：進行量・開始順・設定を復元し、改変と負荷の不一致を拒否する', async () => {
  const w = advanceWorld(early(), 1);
  const gameId = w.dayPlan.gameIds[0]!;
  const original = structuredClone(w);
  const validator: WorldValidator = new WorldValidator();
  validator.validate(w);
  validator.validate(w);
  assert.deepEqual(w, original);
  for (const mutate of [
    (c: BullpenWorld) => {
      c.games[gameId]!.state.bullpen!.nextStartOrder++;
    },
    (c: BullpenWorld) => {
      c.games[gameId]!.state.bullpen!.teams.home.players['player-h-11']!.progressPitches++;
    },
    (c: BullpenWorld) => {
      c.games[gameId]!.fixture.bullpenPolicy!.config.requiredPitches++;
    },
    (c: BullpenWorld) => {
      c.games[gameId]!.events[0]!.bullpenActions![0]!.reason = 'changed';
    },
    (c: BullpenWorld) => {
      c.physical.players['player-h-11']!.fatigueMilli++;
    },
  ]) {
    const c = structuredClone(w) as BullpenWorld;
    mutate(c);
    assert.throws(() => validateWorld(c));
  }
  const db = new WorldDatabase('bullpen-partial'),
    storage = new DexieWorldStorage(db);
  try {
    await storage.save(w, 1, 'manual', 0);
    const loaded = (await storage.load('manual')).world;
    assert.deepEqual(loaded, w);
    assert.deepEqual(finish(loaded), finish(w));
  } finally {
    await db.delete();
  }
});

test('旧v13固定保存：変更前ハッシュ、旧版の保存読込と途中継続を維持する', async () => {
  const bytes = readFileSync('tests/fixtures/world-v13-save.json.gz');
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    'b8f271a06e4d405369fdca370efd59561b5896b111e62cf21e0976e1d6c37c99',
  );
  const old = JSON.parse(gunzipSync(bytes).toString()) as WorldRecord;
  validateWorld(old);
  const db = new WorldDatabase('bullpen-old'),
    storage = new DexieWorldStorage(db);
  try {
    await storage.save(old, 1, 'manual', 0);
    const loaded = (await storage.load('manual')).world;
    assert.deepEqual(loaded, old);
    assert.deepEqual(advanceWorld(loaded, 25), advanceWorld(old, 25));
  } finally {
    await db.delete();
  }
});

test('準備の保存失敗：日次確定を公開せず、同じ指示で再試行して負荷と回復を一回だけ確定', async () => {
  const db = new WorldDatabase('bullpen-controller'),
    storage = new DexieWorldStorage(db);
  let fail = false;
  const controller = new WorldController({
    listSlots: () => storage.listSlots(),
    load: (s) => storage.load(s),
    save: (...args) => {
      if (fail) throw Error('test quota');
      return storage.save(...args);
    },
  });
  try {
    let view = await controller.initialize();
    let seq = 0;
    while (view.phase === 'playing')
      view = await controller.dispatch({
        kind: 'advance',
        count: 25,
        commandId: 'advance-' + seq++,
        localWorldId: 'v02-local',
        expectedStateRevision: view.revision,
      });
    const before = structuredClone(view);
    const command = {
      kind: 'completeDay' as const,
      date: view.currentDate,
      commandId: 'finish-day',
      localWorldId: 'v02-local' as const,
      expectedStateRevision: view.revision,
    };
    fail = true;
    await assert.rejects(controller.dispatch(command));
    assert.deepEqual(controller.query().physical, before.physical);
    assert.deepEqual(controller.query().bullpen, before.bullpen);
    fail = false;
    const after = await controller.dispatch(command);
    assert.deepEqual(await controller.dispatch(command), after);
    assert.equal(after.completedDates.length, 1);
    const saved = (await storage.load('auto')).world;
    assert.equal(saved.completedDates.length, 1);
  } finally {
    await db.delete();
  }
});

test(
  '年間ブルペン：216試合・188日・準備負荷の全件照合と終了保存の完全復元',
  { timeout: 1200000 },
  async () => {
    let w = createBullpenWorld(20260924, undefined, createBullpenDefinitions('annual'));
    while (worldPhase(w) !== 'scheduleComplete') w = day(w);
    assert.equal(w.completedDates.length, 188);
    assert.equal(Object.keys(w.games).length, 216);
    for (const game of Object.values(w.games)) {
      assert.equal(game.state.phase, 'gameComplete');
      for (const side of ['away', 'home'] as const) {
        const actions = game.events
          .flatMap((e) => e.bullpenActions ?? [])
          .filter((a) => a.side === side);
        for (const id of game.fixture.teams[side].pitcherIds.slice(1)) {
          const starts = actions.filter((a) => a.kind === 'started' && a.playerId === id).length;
          const date = w.definitions.schedule.find((s) => s.gameId === game.state.gameId)!.date;
          const load = w.physical.activityLoads[activityKey(id, date)]?.sourceLoads.find(
            (s) => s.sourceKey === JSON.stringify([game.state.gameId, 1, 'preparation']),
          );
          assert.equal(load?.actualCounts ?? 0, starts);
          assert.equal(game.state.bullpen!.teams[side].players[id]!.phase, 'idle');
        }
      }
    }
    const db = new WorldDatabase('bullpen-annual'),
      storage = new DexieWorldStorage(db);
    try {
      await storage.save(w, 1, 'manual', 0);
      assert.deepEqual((await storage.load('manual')).world, w);
    } finally {
      await db.delete();
    }
  },
);
