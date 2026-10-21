import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrainingPlanDefinitions } from '../src/data/world/training-plans.ts';
import { DEFAULT_TRAINING, PLAYER_TRAINING_OVERRIDES } from '../src/data/training/index.ts';
import {
  createTrainingPlanWorld,
  createPlayerDevelopmentWorld,
  advanceWorld,
  completeDay,
  worldPhase,
  validateDefinitions,
} from '../src/world/engine.ts';
import { validateWorld } from '../src/world/validation.ts';
import { applyManagement } from '../src/world/management.ts';
import {
  trainingView,
  trainingSettings,
  trainingTargetOptions,
  trainingTargetAbilities,
  createTrainingDraft,
  trainingChanges,
  commonTrainingRef,
} from '../src/world/training.ts';
import { WorldDatabase, DexieWorldStorage } from '../src/world/dexie-storage.ts';
import { exportStoredPlay } from '../src/world/backup-storage.ts';
import { decodeBackup } from '../src/world/backup-package.ts';
import { WorldController } from '../src/world/controller.ts';
import type { WorldRecord, ManagementAction } from '../src/world/types.ts';
import type { TrainingSettings } from '../src/world/training-types.ts';

function control(world: WorldRecord) {
  assert.ok('management' in world && world.management.version === 'club-management-v2');
  return world.management.training;
}
function action(
  world: WorldRecord,
  settings: TrainingSettings = {
    target: { kind: 'group', groupId: 'contact' },
    intensity: 'hard',
    autoAdjustForFatigue: false,
  },
): Extract<ManagementAction, { kind: 'setTrainingPlans' }> {
  return {
    kind: 'setTrainingPlans',
    squadId: 'hoshihara-first',
    updates: world.definitions.squads[0]!.players.slice(0, 2).map((p) => ({
      playerId: p.playerId,
      settings: structuredClone(settings),
    })),
  };
}
function finishDay(world: WorldRecord): WorldRecord {
  while (worldPhase(world) === 'playing') world = advanceWorld(world, 25);
  return completeDay(world, world.currentDate);
}
function projection(world: WorldRecord) {
  assert.ok('management' in world);
  const { definitions: _definitions, management, ...state } = world;
  const { version: _version, ...managed } = management;
  if ('training' in managed) delete (managed as Partial<typeof managed>).training;
  return {
    ...state,
    management: {
      ...managed,
      actions: managed.actions.filter((entry) => entry.action.kind !== 'setTrainingPlans'),
    },
  };
}

test('練習入力：短期・年間の全120人へ対象辞書と固定初期指定を複製し旧v19は維持', () => {
  for (const calendar of ['short', 'annual'] as const) {
    const definitions = createTrainingPlanDefinitions(calendar);
    const world = createTrainingPlanWorld(3, undefined, definitions);
    validateWorld(world);
    assert.equal(definitions.version, 'world-definitions-v20');
    assert.equal(world.version, 'world-prototype-v15');
    assert.equal(control(world).version, 'training-plans-v1');
    assert.equal(Object.keys(control(world).plans).length, 120);
    assert.equal(definitions.trainingPlans!.players.length, 120);
    for (const plan of Object.values(control(world).plans)) {
      assert.deepEqual(trainingSettings(plan), DEFAULT_TRAINING);
      assert.equal(plan.planKind, 'normal');
      assert.equal(plan.effectiveFrom, definitions.startDate);
      assert.equal(plan.effectiveUntil, null);
    }
    const firstId = definitions.squads[0]!.players[0]!.playerId;
    const view = trainingView(world)!;
    assert.equal(Object.keys(view.plans).length, 30);
    view.plans[firstId]!.intensity = 'rest';
    assert.equal(control(world).plans[firstId]!.intensity, 'normal');
    const old = createPlayerDevelopmentWorld(3);
    assert.equal(old.management.version, 'club-management-v1');
    assert.equal(trainingView(old), null);
    assert.equal(old.definitions.trainingPlans, undefined);
  }
  assert.throws(() =>
    createTrainingPlanWorld(1, undefined, createPlayerDevelopmentWorld().definitions),
  );
});

test('練習参照：共通個別/群・9位置・本人の持ち球を展開し、表示操作で状態を変えない', () => {
  const world = createTrainingPlanWorld();
  const before = structuredClone(world);
  const definitions = world.definitions;
  const playerId = definitions.squads[0]!.players[0]!.playerId;
  const group = trainingTargetAbilities(definitions, playerId, {
    kind: 'group',
    groupId: 'contact',
  });
  assert.deepEqual(
    group.map((a) => a.abilityRef),
    [commonTrainingRef('batting.contactVsRight'), commonTrainingRef('batting.contactVsLeft')],
  );
  assert.equal(
    trainingTargetAbilities(definitions, playerId, {
      kind: 'ability',
      abilityRef: commonTrainingRef('batting.contactVsRight'),
    }).length,
    1,
  );
  assert.equal(
    trainingTargetAbilities(definitions, playerId, {
      kind: 'ability',
      abilityRef: { scope: 'position', positionCode: 'SS', code: 'familiarity' },
    })[0]!.valueMilli,
    definitions.playerDevelopment!.players.find((p) => p.playerId === playerId)!.positionSkills.SS
      .familiarity.valueMilli,
  );
  const pitch = definitions.squads[0]!.pitches[0]!;
  assert.deepEqual(
    trainingTargetAbilities(definitions, pitch.playerId, {
      kind: 'ability',
      abilityRef: { scope: 'pitch', pitchId: pitch.pitchId, code: 'control' },
    })[0]!.valueMilli,
    pitch.control.valueMilli,
  );
  for (const option of trainingTargetOptions(definitions, pitch.playerId))
    trainingTargetAbilities(definitions, pitch.playerId, option.target);
  assert.deepEqual(world, before);
});

test('練習入力の拒否：群の重複/未知/不足、全選手不足、強度/参照/単位/余分な指定を検査', () => {
  const definitions = createTrainingPlanDefinitions();
  const edits: ((d: any) => void)[] = [
    (d) => d.trainingPlans.players.pop(),
    (d) => (d.trainingPlans.players[1].playerId = d.trainingPlans.players[0].playerId),
    (d) => d.trainingPlans.catalog.groups[0].members.push('batting.contactVsRight'),
    (d) => (d.trainingPlans.catalog.groups[0].members = []),
    (d) => (d.trainingPlans.catalog.groups[0].members = ['unknown.value']),
    (d) => (d.trainingPlans.catalog.groups[1].groupId = d.trainingPlans.catalog.groups[0].groupId),
    (d) => (d.trainingPlans.players[0].settings.intensity = 'extreme'),
    (d) => (d.trainingPlans.players[0].settings.autoAdjustForFatigue = 1),
    (d) => (d.trainingPlans.players[0].settings.dailyGain = 1000),
    (d) => (d.trainingPlans.players[0].settings.target = { kind: 'group', groupId: 'unknown' }),
    (d) =>
      (d.trainingPlans.players[0].settings.target = {
        kind: 'ability',
        abilityRef: { scope: 'position', positionCode: 'DH', code: 'familiarity' },
      }),
    (d) =>
      (d.trainingPlans.players[0].settings.target = {
        kind: 'ability',
        abilityRef: { scope: 'pitch', pitchId: d.squads[1].pitches[0].pitchId, code: 'control' },
      }),
    (d) =>
      (d.trainingPlans.players[0].settings.target = {
        kind: 'ability',
        abilityRef: { scope: 'batting', code: 'talent' },
      }),
    (d) => (d.trainingPlans.players[0].settings.target = { kind: 'camp', groupId: 'balanced' }),
  ];
  for (const edit of edits) {
    const broken = structuredClone(definitions);
    edit(broken);
    assert.throws(() => validateDefinitions(broken));
  }
  const old = createPlayerDevelopmentWorld();
  (old.definitions as any).trainingPlans = definitions.trainingPlans;
  assert.throws(() => validateDefinitions(old.definitions));
});

test('一括練習：一二軍を同じ選手IDで変更し、再送/異なる再送・他球団・開始後を検査', () => {
  const world = createTrainingPlanWorld();
  const initial = structuredClone(world);
  const request = action(world);
  const farm = world.registration.registrations.find(
    (row) =>
      row.category === 'farm' &&
      row.until === null &&
      world.definitions.squads[0]!.players.some((p) => p.playerId === row.playerId),
  )!;
  request.updates[1]!.playerId = farm.playerId;
  const changed = applyManagement(world, 'training-bulk', request);
  validateWorld(changed);
  for (const row of request.updates)
    assert.deepEqual(trainingSettings(control(changed).plans[row.playerId]!), row.settings);
  assert.equal(control(changed).revision, 1);
  assert.deepEqual(world, initial);
  assert.equal(applyManagement(changed, 'training-bulk', request), changed);
  assert.throws(() =>
    applyManagement(changed, 'training-bulk', { ...request, updates: request.updates.slice(1) }),
  );
  for (const mutation of [
    (a: typeof request) => (a.updates[1]!.playerId = a.updates[0]!.playerId),
    (a: typeof request) =>
      (a.updates[1]!.playerId = world.definitions.squads[1]!.players[0]!.playerId),
    (a: typeof request) =>
      (a.updates[1]!.settings.target = {
        kind: 'ability',
        abilityRef: {
          scope: 'pitch',
          pitchId: world.definitions.squads[0]!.pitches[0]!.pitchId,
          code: 'control',
        },
      }),
  ]) {
    const broken = structuredClone(request);
    mutation(broken);
    assert.throws(() => applyManagement(world, 'bad-bulk', broken));
    assert.deepEqual(world, initial);
  }
  assert.throws(() => applyManagement(advanceWorld(world, 1), 'started', request));
  assert.throws(() => applyManagement(createPlayerDevelopmentWorld(), 'old', request));
});

test('練習設定の持続：翌日の変更日付・部分編集・初期入力編集と開始済み保存の独立', () => {
  const world = createTrainingPlanWorld();
  const initial = createTrainingDraft(trainingView(world)!.plans);
  const draft = structuredClone(initial);
  const id = Object.keys(draft)[0]!;
  draft[id]!.intensity = 'rest';
  assert.equal(trainingChanges(initial, draft).length, 1);
  assert.deepEqual(draft[id]!.target, initial[id]!.target);
  assert.equal(draft[id]!.autoAdjustForFatigue, initial[id]!.autoAdjustForFatigue);
  const tomorrow = finishDay(world);
  const changed = applyManagement(tomorrow, 'next-day-training', {
    kind: 'setTrainingPlans',
    squadId: 'hoshihara-first',
    updates: trainingChanges(initial, draft),
  });
  assert.equal(control(changed).plans[id]!.effectiveFrom, tomorrow.currentDate);
  assert.equal(
    control(changed).plans[Object.keys(draft)[1]!]!.effectiveFrom,
    world.definitions.startDate,
  );
  const snapshot = structuredClone(changed);
  try {
    PLAYER_TRAINING_OVERRIDES[id] = draft[id]!;
    assert.equal(control(createTrainingPlanWorld()).plans[id]!.intensity, 'rest');
    assert.deepEqual(changed, snapshot);
  } finally {
    delete PLAYER_TRAINING_OVERRIDES[id];
  }
  validateWorld(changed);
});

test('練習と再現性：強度/自動調整/対象を変更しても旧v19と全短期試合・身体・乱数・年度要約が一致', () => {
  let current: WorldRecord = createTrainingPlanWorld(72);
  let old: WorldRecord = createPlayerDevelopmentWorld(72);
  current = applyManagement(current, 'scope-only', action(current));
  while (worldPhase(current) !== 'scheduleComplete') {
    current = finishDay(current);
    old = finishDay(old);
    const actual = projection(current),
      expected = projection(old);
    assert.deepEqual(actual, expected);
  }
  validateWorld(current);
  assert.throws(() => applyManagement(current, 'after-season', action(current)));
});

test('練習の保存・バックアップ：指定と辞書/日付/履歴を復元し、改変・旧保存への後付けを拒否', async () => {
  const db = new WorldDatabase('training-backup');
  try {
    const storage = new DexieWorldStorage(db);
    const world = finishDay(
      applyManagement(
        createTrainingPlanWorld(15),
        'saved-plan',
        action(createTrainingPlanWorld(15)),
      ),
    );
    const before = structuredClone(world);
    await storage.save(world, 1, 'manual', 0);
    assert.deepEqual((await storage.load('manual')).world, before);
    assert.deepEqual(
      (await decodeBackup(await exportStoredPlay(db, storage.localWorldId, 'manual'))).world,
      before,
    );
    const changed = structuredClone(world);
    control(changed).plans[Object.keys(control(changed).plans)[0]!]!.intensity = 'rest';
    assert.throws(() => validateWorld(changed));
    const old = createPlayerDevelopmentWorld(15);
    await storage.save(old, 2, 'manual', 1);
    const restored = (await storage.load('manual')).world;
    assert.deepEqual(restored, old);
    assert.equal(trainingView(restored), null);
    assert.ok('management' in restored);
    (restored.management as any).training = control(world);
    assert.throws(() => validateWorld(restored));
  } finally {
    db.close();
    await db.delete();
  }
});

test('練習の保存失敗：一括変更/履歴を公開せず同じ指示で再試行し、一度だけ確定する', async () => {
  const db = new WorldDatabase('training-failure');
  try {
    const storage = new DexieWorldStorage(db);
    const world = createTrainingPlanWorld();
    const slots = await storage.save(world, 1, 'manual', 0);
    const controller = WorldController.fromCommitted(
      storage,
      storage.localWorldId,
      1,
      world,
      slots,
    );
    const before = controller.query();
    const command = {
      ...action(world),
      commandId: 'retry-training',
      localWorldId: before.localWorldId,
      expectedStateRevision: before.revision,
    };
    const save = storage.save.bind(storage);
    storage.save = async () => {
      throw new Error('保存失敗の試験');
    };
    await assert.rejects(controller.dispatch(command));
    const failed = controller.query();
    assert.deepEqual(failed.training, before.training);
    assert.deepEqual(failed.management, before.management);
    assert.equal(failed.revision, before.revision);
    assert.deepEqual((await storage.load('manual')).world, world);
    storage.save = save;
    const changed = await controller.dispatch(command);
    assert.equal(changed.training!.revision, 1);
    assert.equal(
      changed.management!.actions.filter((a) => a.action.kind === 'setTrainingPlans').length,
      1,
    );
    assert.deepEqual(await controller.dispatch(command), changed);
    const saved = (await storage.load('auto')).world;
    assert.ok('management' in saved);
    assert.equal(saved.management.version, 'club-management-v2');
  } finally {
    db.close();
    await db.delete();
  }
});
