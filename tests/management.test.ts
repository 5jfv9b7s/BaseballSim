import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import {
  advanceWorld,
  completeDay,
  createManagedWorld,
  createWorld,
  worldPhase,
} from '../src/world/engine.ts';
import { applyManagement, idealLineup } from '../src/world/management.ts';
import { validateWorld } from '../src/world/validation.ts';
import { DexieWorldStorage, WorldDatabase } from '../src/world/dexie-storage.ts';
import { WorldController } from '../src/world/controller.ts';
import { canonicalJson, sha256 } from '../src/storage/codec.ts';
import type { ManagedWorld, ManagementAction, WorldRecord } from '../src/world/types.ts';

function playDay(world: WorldRecord, count = 25): WorldRecord {
  while (worldPhase(world) === 'playing') world = advanceWorld(world, count);
  assert.equal(worldPhase(world), 'readyToComplete');
  return completeDay(world, world.currentDate);
}

function planAction(world: ManagedWorld): Extract<ManagementAction, { kind: 'setClubPlan' }> {
  const squadId = world.management.controlledSquadId;
  return {
    kind: 'setClubPlan',
    squadId,
    lineup: structuredClone(world.management.idealLineups[squadId]!),
    pitchers: structuredClone(world.management.pitcherUsagePlans[squadId]!),
  };
}

test('球団運営：未編集の新モデルは旧日次モデルの試合結果と全乱数を維持する', () => {
  const legacy = playDay(createWorld());
  const managed = playDay(createManagedWorld());
  assert.deepEqual(managed.games, legacy.games);
  assert.deepEqual(managed.stats, legacy.stats);
  validateWorld(managed);
});

test('球団運営：打順と守備を開始名簿へ反映し、入力を保ち、1/25進行で再現する', () => {
  const initial = createManagedWorld();
  const action = planAction(initial);
  const squad = initial.definitions.squads[0]!;
  const reordered = structuredClone(squad.team);
  [reordered.lineup[0], reordered.lineup[1]] = [reordered.lineup[1]!, reordered.lineup[0]!];
  [reordered.lineup[2]!.position, reordered.lineup[3]!.position] = [
    reordered.lineup[3]!.position,
    reordered.lineup[2]!.position,
  ];
  action.lineup = idealLineup(reordered);
  const world = applyManagement(initial, 'lineup-1', action);
  assert.deepEqual(initial, createManagedWorld());
  assert.deepEqual(world.definitions, initial.definitions);
  const first = advanceWorld(world, 1);
  const game = first.games[first.dayPlan.gameIds[0]!]!;
  assert.equal(game.events[0]!.pitch!.batterId, reordered.lineup[0]!.playerId);
  assert.deepEqual(game.fixture.teams.away.lineup, reordered.lineup);
  assert.throws(() => applyManagement(first, 'late-edit', action), /始める前/);
  const batch = playDay(world, 25);
  assert.deepEqual(playDay(world, 1), batch);
  validateWorld(batch);
});

test('球団運営：実施試合だけローテを進め、休みの日と代役指定で割当を変えない', () => {
  let world: WorldRecord = createManagedWorld();
  const action = planAction(world);
  const squad = world.definitions.squads[0]!;
  const [one, two, relief] = squad.team.pitcherIds as [string, string, string];
  action.pitchers = {
    rotationSlots: [
      { slotNo: 1, playerId: one },
      { slotNo: 2, playerId: two },
    ],
    nextSlotNo: 1,
    reliefRoles: [{ playerId: relief, role: 'relief', priority: 1 }],
  };
  world = applyManagement(world, 'rotation', action);
  world = playDay(world);
  assert.equal((world as ManagedWorld).management.pitcherUsagePlans[squad.squadId]!.nextSlotNo, 2);
  const first = world.games['G2026-0924-01']!;
  assert.deepEqual(first.fixture.teams.away.pitcherIds, [one, relief]);
  assert.equal(
    first.fixture.players.some((player) => player.playerId === two),
    false,
  );
  const baseAssignments = structuredClone(
    (world as ManagedWorld).management.pitcherUsagePlans[squad.squadId]!.rotationSlots,
  );
  world = applyManagement(world, 'spot-starter', {
    kind: 'setGameStarter',
    squadId: squad.squadId,
    gameId: 'G2026-0925-02',
    playerId: relief,
  });
  world = playDay(world);
  assert.equal(world.games['G2026-0925-02']!.fixture.teams.home.pitcherIds[0], relief);
  assert.deepEqual(
    (world as ManagedWorld).management.pitcherUsagePlans[squad.squadId]!.rotationSlots,
    baseAssignments,
  );
  assert.equal((world as ManagedWorld).management.pitcherUsagePlans[squad.squadId]!.nextSlotNo, 1);
  const beforeRest = structuredClone((world as ManagedWorld).management);
  world = playDay(world);
  assert.deepEqual((world as ManagedWorld).management, beforeRest);
  world = playDay(world);
  assert.equal(world.games['G2026-0927-01']!.fixture.teams.away.pitcherIds[0], one);
  validateWorld(world);
});

test('球団運営：当日先発を解除でき、未来試合・他球団・非投手の指定を拒否する', () => {
  const initial = createManagedWorld();
  const squadId = initial.management.controlledSquadId;
  const action: ManagementAction = {
    kind: 'setGameStarter',
    squadId,
    gameId: 'G2026-0924-01',
    playerId: initial.definitions.squads[0]!.team.pitcherIds[1]!,
  };
  const changed = applyManagement(initial, 'override', action);
  const restored = applyManagement(changed, 'clear', { ...action, playerId: null });
  assert.deepEqual(restored.management.starterOverrides, {});
  assert.deepEqual(restored.management.pitcherUsagePlans, initial.management.pitcherUsagePlans);
  for (const invalid of [
    { ...action, gameId: 'G2026-0925-02' },
    { ...action, squadId: initial.definitions.squads[1]!.squadId },
    { ...action, playerId: initial.definitions.squads[0]!.players[0]!.playerId },
  ])
    assert.throws(() => applyManagement(initial, 'bad', invalid));
  assert.strictEqual(applyManagement(changed, 'override', action), changed);
  assert.throws(
    () => applyManagement(changed, 'override', { ...action, playerId: null }),
    /同じ編成指示ID/,
  );
});

test('球団運営：重複打順・不正守備・球団外投手・ローテの欠番と重複を拒否する', () => {
  const world = createManagedWorld();
  const mutations = [
    (action: ReturnType<typeof planAction>) => {
      action.lineup.battingOrder[0]!.playerId = action.lineup.battingOrder[1]!.playerId;
    },
    (action: ReturnType<typeof planAction>) => {
      action.lineup.defense[0]!.positionCode = 'DH' as never;
    },
    (action: ReturnType<typeof planAction>) => {
      action.lineup.defense[0]!.playerId = null;
    },
    (action: ReturnType<typeof planAction>) => {
      action.pitchers.rotationSlots[0]!.slotNo = 2;
    },
    (action: ReturnType<typeof planAction>) => {
      action.pitchers.rotationSlots[0]!.playerId = world.definitions.squads[1]!.team.pitcherIds[0]!;
    },
    (action: ReturnType<typeof planAction>) => {
      action.pitchers.reliefRoles[0]!.playerId = action.pitchers.rotationSlots[0]!.playerId;
    },
    (action: ReturnType<typeof planAction>) => {
      action.pitchers.nextSlotNo = 2;
    },
  ];
  for (const mutate of mutations) {
    const action = planAction(world);
    mutate(action);
    assert.throws(() => applyManagement(world, 'invalid', action));
  }
  assert.deepEqual(world, createManagedWorld());
});

test('球団運営：保存履歴の順序・内容・集計後ローテの改変を検出する', () => {
  const initial = createManagedWorld();
  const action = planAction(initial);
  action.lineup.battingOrder.reverse().forEach((slot, index) => {
    slot.slotNo = index + 1;
  });
  let world: WorldRecord = applyManagement(initial, 'first', action);
  world = playDay(world);
  for (const mutate of [
    (w: ManagedWorld) => {
      w.management.actions[0]!.date = '2026-09-25';
    },
    (w: ManagedWorld) => {
      w.management.actions[0]!.sequence = 2;
    },
    (w: ManagedWorld) => {
      w.management.policyRevisions[w.management.controlledSquadId]!++;
    },
    (w: ManagedWorld) => {
      w.management.pitcherUsagePlans[w.management.controlledSquadId]!.nextSlotNo = 2;
    },
  ]) {
    const changed = structuredClone(world) as ManagedWorld;
    mutate(changed);
    assert.throws(() => validateWorld(changed));
  }
});

test('球団運営保存：途中保存と行動自動保存を復元し、旧世界とも枠を共有できる', async () => {
  const db = new WorldDatabase('management-save-' + crypto.randomUUID());
  const storage = new DexieWorldStorage(db);
  try {
    const initial = createManagedWorld();
    const changed = applyManagement(initial, 'plan', planAction(initial));
    await storage.save(changed, 1, 'action', 0);
    const partial = advanceWorld(changed, 13);
    await storage.save(partial, 2, 'manual', 1);
    assert.deepEqual((await storage.load('manual')).world, partial);
    assert.deepEqual(playDay((await storage.load('manual')).world, 1), playDay(partial, 25));
    assert.deepEqual((await storage.load('auto')).world, changed);
    await storage.save(playDay(partial), 3, 'auto', 2);
    assert.deepEqual((await storage.load('previousAuto')).world, changed);
    const legacy = createWorld();
    await storage.save(legacy, 4, 'manual', 3);
    assert.deepEqual((await storage.load('manual')).world, legacy);
    assert.equal((await storage.load('auto')).world.version, 'world-prototype-v2');
    await assert.rejects(storage.save(partial, 5, 'action', 4), /試合開始前/);
  } finally {
    await db.delete();
  }
});

test('球団運営Controller：編成保存失敗は正本と履歴を保ち、再試行・再送で二重反映しない', async () => {
  const db = new WorldDatabase('management-controller-' + crypto.randomUUID());
  const storage = new DexieWorldStorage(db);
  const controller = new WorldController(storage);
  try {
    const before = await controller.initialize();
    const initial = createManagedWorld();
    const action = planAction(initial);
    const command = {
      ...action,
      commandId: 'save-plan',
      localWorldId: 'v02-local' as const,
      expectedStateRevision: before.revision,
    };
    const fail = () => {
      throw new Error('quota failure');
    };
    db.save_snapshots.hook('creating', fail);
    await assert.rejects(controller.dispatch(command), /quota failure/);
    db.save_snapshots.hook('creating').unsubscribe(fail);
    assert.deepEqual(controller.query().management, before.management);
    assert.equal(controller.query().revision, before.revision);
    const after = await controller.dispatch(command);
    assert.equal(after.management!.actions.length, 1);
    assert.equal(after.unsavedChanges, false);
    assert.deepEqual(await controller.dispatch(command), after);
    assert.equal((await storage.listSlots()).storageRevision, 1);
    await assert.rejects(controller.dispatch({ ...command, commandId: 'stale' }), /古い世界/);
  } finally {
    await db.delete();
  }
});

test('球団運営互換性：55c8b7eの実v0.2保存を読み込み、当時の全記録ハッシュを維持する', async () => {
  const fixture = JSON.parse(
    gunzipSync(readFileSync(new URL('./fixtures/world-v1-save.json.gz', import.meta.url))).toString(
      'utf8',
    ),
  );
  const db = new WorldDatabase('management-legacy-' + crypto.randomUUID());
  const storage = new DexieWorldStorage(db);
  try {
    for (const table of db.tables) {
      const rows = fixture.tables[table.name].map((row: Record<string, unknown>) =>
        table.name === 'save_blocks'
          ? { ...row, payloadBytes: new Uint8Array(row.payloadBytes as number[]) }
          : row,
      );
      await table.bulkPut(rows);
    }
    const saved = await storage.load('auto');
    assert.equal(saved.world.version, 'world-prototype-v1');
    assert.equal(await sha256(canonicalJson(saved.world)), fixture.digest);
    const manual = await storage.load('manual');
    assert.equal(Object.values(manual.world.games)[0]!.events.length, 13);
    assert.equal(await sha256(canonicalJson(playDay(manual.world))), fixture.digest);
    const controller = new WorldController(storage);
    const view = await controller.initialize();
    const loaded = await controller.dispatch({
      kind: 'load',
      slot: 'auto',
      commandId: 'legacy-load',
      expectedStateRevision: view.revision,
      localWorldId: 'v02-local',
    });
    assert.equal(loaded.management, null);
    assert.equal(loaded.canEditManagement, false);
  } finally {
    await db.delete();
  }
});
