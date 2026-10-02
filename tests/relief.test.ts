import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createReliefDefinitions } from '../src/data/world/relief.ts';
import { createFielderRestDefinitions } from '../src/data/world/fielder-rest.ts';
import {
  createReliefWorld,
  createFielderRestWorld,
  createScheduledGame,
  advanceWorld,
  completeDay,
  worldPhase,
} from '../src/world/engine.ts';
import { advanceGameEvent } from '../src/game/engine.ts';
import { GAME_MODEL } from '../src/game/model.ts';
import { reliefMatches, selectReliever } from '../src/game/relief.ts';
import { reliefConfig } from '../config/relief.ts';
import { applyManagement } from '../src/world/management.ts';
import { registrationPreview } from '../src/world/registration.ts';
import { validateWorld, WorldValidator } from '../src/world/validation.ts';
import { WorldDatabase, DexieWorldStorage } from '../src/world/dexie-storage.ts';
import { WorldController } from '../src/world/controller.ts';
import type { ReliefWorld } from '../src/world/relief.ts';
import type { ReliefRoleRule } from '../src/game/relief-types.ts';
import type { WorldRecord } from '../src/world/types.ts';
import type { GameRecord } from '../src/game/types.ts';

const squadId = 'hoshihara-first';
const p1 = 'player-a-10',
  p2 = 'player-a-11',
  p3 = 'player-a-12';
const rule = (
  playerId: string,
  role: ReliefRoleRule['role'] = 'relief',
  priority = 1,
): ReliefRoleRule => ({
  playerId,
  role,
  priority,
  conditions: structuredClone(reliefConfig.templates[role]),
});
function setup() {
  const w = createReliefWorld();
  return structuredClone(createScheduledGame(w, w.dayPlan.gameIds[0]!));
}
function ready(game: GameRecord) {
  game.state.half = 'bottom';
  game.state.inning = 9;
  game.state.score = { away: 3, home: 1 };
  game.state.pitcherPitchCounts[p1] = GAME_MODEL.starterPitchLimit;
}
function finish<T extends WorldRecord>(w: T, count = 25): T {
  let next: WorldRecord = w;
  while (worldPhase(next) === 'playing') next = advanceWorld(next, count);
  assert.equal(worldPhase(next), 'readyToComplete');
  return next as T;
}
function day<T extends WorldRecord>(w: T): T {
  return completeDay(finish(w), w.currentDate) as T;
}
function skipping(calendar: 'short' | 'annual' = 'short') {
  const defs = createReliefDefinitions(calendar);
  const blocked = rule(p2);
  blocked.conditions.minScoreDifference = 999;
  defs.reliefPolicyInputs!.find((p) => p.squadId === squadId)!.reliefRoles = [blocked, rule(p3)];
  return createReliefWorld(20260924, undefined, defs);
}

test('救援入力：8チーム・全投手の独立設定、条件/順位/重複/旧版混入を検査', () => {
  const defs = createReliefDefinitions();
  const world = createReliefWorld(1, undefined, defs);
  assert.equal(defs.reliefPolicyInputs!.length, 8);
  defs.reliefPolicyInputs![0]!.reliefRoles[0]!.priority = 99;
  assert.equal(world.reliefControl.teamPolicies[squadId]!.reliefRoles[0]!.priority, 1);
  assert.equal(defs.reliefPolicyInputs![1]!.reliefRoles[0]!.priority, 1);
  for (const change of [
    (d: typeof defs) => {
      d.reliefPolicyInputs!.pop();
    },
    (d: typeof defs) => {
      d.reliefPolicyInputs![0]!.reliefRoles.push(d.reliefPolicyInputs![0]!.reliefRoles[0]!);
    },
    (d: typeof defs) => {
      d.reliefPolicyInputs![0]!.reliefRoles[0]!.priority = 0;
    },
    (d: typeof defs) => {
      d.reliefPolicyInputs![0]!.reliefRoles[0]!.playerId = 'player-a-01';
    },
    (d: typeof defs) => {
      d.reliefPolicyInputs![0]!.reliefRoles[0]!.conditions.scoreStates = [];
    },
    (d: typeof defs) => {
      d.reliefPolicyInputs![0]!.reliefRoles[0]!.conditions.endInning = 0;
    },
    (d: typeof defs) => {
      d.reliefPolicyInputs![0]!.reliefRoles[0]!.conditions.minScoreDifference = NaN;
    },
    (d: typeof defs) => {
      d.reliefConfig!.roleOrder = ['relief', 'relief', 'setup', 'closer'];
    },
  ]) {
    const d = createReliefDefinitions();
    change(d);
    assert.throws(() => createReliefWorld(1, undefined, d));
  }
  const old = createFielderRestDefinitions();
  old.reliefConfig = reliefConfig;
  assert.throws(() => createFielderRestWorld(1, undefined, old), /旧定義/);
});

test('登板条件：開始/終了回・正負の点差・同点・複数状況・nullの境界', () => {
  const closer = reliefConfig.templates.closer;
  assert.equal(reliefMatches(closer, 8, 1), false);
  assert.equal(reliefMatches(closer, 9, 1), true);
  assert.equal(reliefMatches(closer, 12, 3), true);
  assert.equal(reliefMatches(closer, 13, 3), false);
  assert.equal(reliefMatches(closer, 9, 0), false);
  assert.equal(reliefMatches(closer, 9, 4), false);
  const trailing = {
    ...closer,
    scoreStates: ['trailing'] as const,
    minScoreDifference: -3,
    maxScoreDifference: -1,
  };
  assert(reliefMatches({ ...trailing, scoreStates: [...trailing.scoreStates] }, 9, -2));
  assert(reliefMatches(reliefConfig.templates.relief, 1, -500));
  assert(reliefMatches(reliefConfig.templates.setup, 7, 0));
});

test('救援優先：休養→役割→同役割順位→候補順、表示/判定は無乱数', () => {
  const game = setup();
  ready(game);
  const policy = game.fixture.reliefPolicy!.teams.away;
  policy.reliefRoles = [rule(p2), rule(p3, 'closer')];
  const before = structuredClone(game.state);
  assert.equal(selectReliever(game.state, game.fixture, 'away').selectedId, p3);
  policy.restPriority[p3] = 1;
  assert.equal(selectReliever(game.state, game.fixture, 'away').selectedId, p2);
  policy.restPriority[p3] = 0;
  policy.reliefRoles = [rule(p2, 'relief', 5), rule(p3, 'relief', 1)];
  assert.equal(selectReliever(game.state, game.fixture, 'away').selectedId, p3);
  policy.reliefRoles = [rule(p3), rule(p2)]; // 設定配列の並びではなく既存候補順。
  assert.equal(selectReliever(game.state, game.fixture, 'away').selectedId, p2);
  assert.deepEqual(game.state, before);
});

test('複数役割：条件外の抑えから通常救援へ、両方外なら続投理由を残す', () => {
  const game = setup();
  ready(game);
  game.state.inning = 6;
  const policy = game.fixture.reliefPolicy!.teams.away;
  policy.reliefRoles = [rule(p2, 'closer'), rule(p2), rule(p3, 'closer')];
  const selected = selectReliever(game.state, game.fixture, 'away');
  assert.equal(selected.selectedId, p2);
  assert.equal(selected.candidates[0]!.role, 'relief');
  policy.reliefRoles = [rule(p2, 'closer'), rule(p3, 'closer')];
  const none = selectReliever(game.state, game.fixture, 'away');
  assert.equal(none.selectedId, null);
  assert.match(none.reason, /続投/);
});

test('条件付き交代：順番を飛ばす・戻る・再登板禁止・打席途中は交代しない', () => {
  const game = setup();
  ready(game);
  game.fixture.reliefPolicy!.teams.away.reliefRoles = [rule(p2), rule(p3, 'closer')];
  const a = advanceGameEvent(game.state, game.fixture);
  assert.equal(a.event.kind, 'substitution');
  assert.equal(a.state.pitcherIndex.away, 2);
  assert.deepEqual(a.state.usedPitcherIds!.away, [p1, p3]);
  assert.deepEqual(a.state.rng, game.state.rng);
  a.state.pitcherPitchCounts[p3] = GAME_MODEL.relieverPitchLimit;
  const b = advanceGameEvent(a.state, game.fixture);
  assert.equal(b.state.pitcherIndex.away, 1);
  assert.equal(b.event.substitution!.inPlayerId, p2);
  b.state.pitcherPitchCounts[p2] = GAME_MODEL.relieverPitchLimit;
  const c = advanceGameEvent(b.state, game.fixture);
  assert.equal(c.event.kind, 'pitch');
  assert.equal(c.event.reliefDecision!.selectedId, null);
  assert.equal(c.state.usedPitcherIds!.away.length, 3);
  game.state.paPitches = 1;
  assert.equal(advanceGameEvent(game.state, game.fixture).event.kind, 'pitch');
});

test('候補不足：役割なし/条件外は続投、全体の異常上限は維持', () => {
  const game = setup();
  ready(game);
  game.fixture.reliefPolicy!.teams.away.reliefRoles = [];
  const next = advanceGameEvent(game.state, game.fixture);
  assert.equal(next.event.kind, 'pitch');
  assert.match(next.event.reliefDecision!.candidates[0]!.reason, /未設定/);
  game.state.totalPitches = GAME_MODEL.maxGamePitches;
  assert.equal(advanceGameEvent(game.state, game.fixture).state.phase, 'aborted');
});

test('実登板：飛ばした投手は欠場・負荷なし、登板候補/ベンチ/能力補正を維持', () => {
  const world = skipping();
  const gameId = world.dayPlan.gameIds[0]!;
  const start = createScheduledGame(world, gameId);
  assert(start.fixture.teams.away.pitcherIds.includes(p2));
  const a = finish(world, 1),
    b = finish(world, 25);
  assert.deepEqual(a, b);
  const game = a.games[gameId]!;
  assert(game.state.usedPitcherIds!.away.includes(p3));
  assert(!game.state.usedPitcherIds!.away.includes(p2));
  const roster = a.registration.gameRosters[gameId]!.away;
  assert.equal(roster.participants.find((p) => p.playerId === p2)!.appeared, false);
  assert.equal(roster.participants.find((p) => p.playerId === p3)!.appeared, true);
  assert(Object.values(a.restControl.appearances).every((p) => p.playerId !== p2));
  assert(
    Object.values(a.physical.activityLoads)
      .filter((p) => p.playerId === p2)
      .every((p) => p.sourceLoads.every((l) => l.actualCounts === 0)),
  );
  assert(game.performance!.players[p3]);
  assert.deepEqual(world.management, createReliefWorld().management);
  const validator: WorldValidator = new WorldValidator();
  validator.validate(a);
  validator.validate(a);
});

test('既定互換：通常救援の同順位では旧v12と全短期結果・状態・乱数が一致', () => {
  let current = createReliefWorld(9),
    old = createFielderRestWorld(9);
  while (worldPhase(current) !== 'scheduleComplete') {
    current = day(current);
    old = day(old);
  }
  for (const [id, original] of Object.entries(current.games)) {
    const game = structuredClone(original);
    delete game.fixture.reliefPolicy;
    delete game.state.usedPitcherIds;
    for (const event of game.events) delete event.reliefDecision;
    assert.deepEqual(game, old.games[id]);
  }
  assert.deepEqual(current.stats, old.stats);
  assert.deepEqual(current.physical, old.physical);
  assert.deepEqual(current.condition, old.condition);
});

test('救援保存：途中再開・開始時方針固定・登板者/候補理由/条件の改変を拒否', async () => {
  let w: ReliefWorld = skipping();
  const gameId = w.dayPlan.gameIds[0]!;
  while (!w.games[gameId]?.events.some((e) => e.reliefDecision))
    w = advanceWorld(w, 25) as ReliefWorld;
  const db = new WorldDatabase('relief-save'),
    storage = new DexieWorldStorage(db);
  try {
    await storage.save(w, 1, 'manual', 0);
    const loaded = (await storage.load('manual')).world as ReliefWorld;
    assert.deepEqual(loaded, w);
    assert.deepEqual(finish(loaded), finish(w));
    for (const mutate of [
      (c: ReliefWorld) => {
        c.games[gameId]!.state.usedPitcherIds!.away.push(p2);
      },
      (c: ReliefWorld) => {
        c.games[gameId]!.fixture.reliefPolicy!.teams.away.reliefRoles = [];
      },
      (c: ReliefWorld) => {
        c.games[gameId]!.events.find((e) => e.reliefDecision)!.reliefDecision!.reason = 'changed';
      },
    ]) {
      const c = structuredClone(w);
      mutate(c);
      assert.throws(() => validateWorld(c));
    }
    assert.throws(
      () => applyManagement(w, 'late', { kind: 'setReliefPolicy', squadId, reliefRoles: [] }),
      /始める前/,
    );
  } finally {
    await db.delete();
  }
});

test('旧v12固定保存：変更前ハッシュ・元の版での保存と継続', async () => {
  const bytes = readFileSync(new URL('./fixtures/world-v12-save.json.gz', import.meta.url));
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    'dfec43f80cd8b67cfe3f78f67115211d6500ea57c4525ac1a82d23e8146441dc',
  );
  const old = JSON.parse(gunzipSync(bytes).toString()) as WorldRecord;
  validateWorld(old);
  assert(!('reliefControl' in old));
  const db = new WorldDatabase('relief-old'),
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

test('救援方針：保存失敗/再送、編成変更との独立、他球団の編集禁止', async () => {
  const db = new WorldDatabase('relief-controller'),
    storage = new DexieWorldStorage(db);
  let fail = true;
  const controller = new WorldController({
    listSlots: () => storage.listSlots(),
    load: (s) => storage.load(s),
    save: (...args) => {
      if (fail) throw Error('test quota');
      return storage.save(...args);
    },
  });
  try {
    const before = await controller.initialize();
    const command = {
      kind: 'setReliefPolicy' as const,
      squadId,
      reliefRoles: [rule(p2, 'closer'), rule(p3)],
      commandId: 'roles',
      localWorldId: 'v02-local' as const,
      expectedStateRevision: before.revision,
    };
    await assert.rejects(controller.dispatch(command));
    assert.deepEqual(controller.query().relief, before.relief);
    fail = false;
    const after = await controller.dispatch(command);
    assert.deepEqual(await controller.dispatch(command), after);
    assert.equal(after.relief!.policyRevision, 2);
    const world = (await storage.load('auto')).world as ReliefWorld;
    assert.equal(world.management.actions.length, 1);
    assert.throws(
      () =>
        applyManagement(world, 'other', {
          kind: 'setReliefPolicy',
          squadId: 'aonagi-first',
          reliefRoles: [],
        }),
      /担当/,
    );
    const next = applyManagement(world, 'lineup', {
      kind: 'setClubPlan',
      squadId,
      lineup: world.management.idealLineups[squadId]!,
      pitchers: world.management.pitcherUsagePlans[squadId]!,
    }) as ReliefWorld;
    assert.deepEqual(next.reliefControl, world.reliefControl);
    assert.deepEqual(
      registrationPreview(next)!.roster.playerIds,
      registrationPreview(world)!.roster.playerIds,
    );
  } finally {
    await db.delete();
  }
});

// 年間の再計算を含む整合性試験。実測約13分で10分制限に達したため、性能基準と分ける。
test(
  '年間救援：216試合・188日・実登板一意・終了保存の完全復元',
  { timeout: 1200000 },
  async (t) => {
    const started = performance.now();
    const report = (phase: string) =>
      t.diagnostic(phase + ' / 経過 ' + Math.round(performance.now() - started) + ' ms');
    let w = skipping('annual');
    while (worldPhase(w) !== 'scheduleComplete') w = day(w);
    assert.equal(w.completedDates.length, 188);
    assert.equal(Object.keys(w.games).length, 216);
    assert(Object.values(w.games).some((g) => g.events.some((e) => e.reliefDecision?.selectedId)));
    for (const g of Object.values(w.games))
      for (const side of ['away', 'home'] as const) {
        const ids = g.state.usedPitcherIds![side];
        assert.equal(new Set(ids).size, ids.length);
        assert(ids.every((id) => g.fixture.teams[side].pitcherIds.includes(id)));
      }
    report('216試合・188日と実登板者の検査完了');
    const db = new WorldDatabase('relief-annual'),
      storage = new DexieWorldStorage(db);
    try {
      await storage.save(w, 1, 'manual', 0);
      report('終了状態の保存完了');
      assert.deepEqual((await storage.load('manual')).world, w);
      report('保存復元と全状態の照合完了');
    } finally {
      await db.delete();
    }
  },
);
