import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DexieWorldStorage, WorldDatabase } from '../src/world/dexie-storage.ts';
import { WorldController, type WorldAction, type WorldCommand } from '../src/world/controller.ts';
import { WorldWorkspace, type WorkspaceResponse } from '../src/world/workspace.ts';
import { createPitchProfileWorld } from '../src/world/engine.ts';

async function database(run: (db: WorldDatabase, workspace: WorldWorkspace) => Promise<void>) {
  const db = new WorldDatabase('new-play-' + crypto.randomUUID());
  try {
    const workspace = new WorldWorkspace(db);
    await workspace.initialize();
    await run(db, workspace);
  } finally {
    await db.delete();
  }
}

function ok(response: WorkspaceResponse) {
  assert.equal(response.ok, true, !response.ok ? response.error : undefined);
  return response;
}

async function command(workspace: WorldWorkspace, action: WorldAction): Promise<WorldCommand> {
  const { view } = ok(await workspace.handle({ kind: 'query' }));
  return {
    ...action,
    commandId: crypto.randomUUID(),
    localWorldId: view.localWorldId,
    expectedStateRevision: view.revision,
  };
}

async function dump(db: WorldDatabase) {
  return {
    worlds: await db.local_worlds.toArray(),
    slots: await db.save_slots.toArray(),
    snapshots: await db.save_snapshots.toArray(),
    blocks: await db.save_blocks.toArray(),
  };
}

test('新規プレイ：初回自動保存後に公開し、同じseedでも独立して復元できる', async () => {
  await database(async (db, workspace) => {
    const first = ok(await workspace.handle(await command(workspace, { kind: 'new', seed: 101 })));
    assert.equal(first.view.unsavedChanges, false);
    assert.equal(first.view.slots.storageRevision, 1);
    assert.ok(first.view.slots.auto);
    assert.equal(first.view.slots.manual, null);
    assert.equal(first.view.slots.previousAuto, null);
    assert.equal(first.createdLocalWorldId, first.view.localWorldId);
    assert.equal(first.plays.length, 1);
    const firstStorage = new DexieWorldStorage(db, first.view.localWorldId);
    const initialWorld = (await firstStorage.load('auto')).world;
    assert.equal(initialWorld.seed, 101);

    ok(await workspace.handle(await command(workspace, { kind: 'save' })));
    const second = ok(await workspace.handle(await command(workspace, { kind: 'new', seed: 101 })));
    assert.notEqual(first.view.localWorldId, second.view.localWorldId);
    assert.equal(first.view.worldId, second.view.worldId);
    assert.equal(second.plays.length, 2);
    const secondStorage = new DexieWorldStorage(db, second.view.localWorldId);
    assert.deepEqual((await secondStorage.load('auto')).world, initialWorld);
    ok(await workspace.handle(await command(workspace, { kind: 'advance', count: 1 })));
    const saved = ok(await workspace.handle(await command(workspace, { kind: 'save' })));
    assert.deepEqual((await firstStorage.load('manual')).world, initialWorld);
    assert.notDeepEqual((await secondStorage.load('manual')).world, initialWorld);

    const reopened = ok(
      await workspace.handle({
        kind: 'openPlay',
        localWorldId: saved.view.localWorldId,
        expectedStateRevision: saved.view.revision,
        targetLocalWorldId: first.view.localWorldId,
        slot: 'auto',
      }),
    );
    assert.equal(reopened.view.localWorldId, first.view.localWorldId);
    assert.deepEqual(reopened.view.games, first.view.games);
    assert.equal(reopened.view.unsavedChanges, false);
  });
});

test('旧プレイ保護：新規作成と履歴回収後も、旧手動・自動・直前の全保存を維持する', async () => {
  await database(async (db, workspace) => {
    const storage = new DexieWorldStorage(db);
    const world = createPitchProfileWorld(201);
    await storage.save(world, 1, 'action', 0);
    await storage.save(world, 2, 'action', 1);
    const oldSlots = await storage.save(world, 3, 'manual', 2);
    const original = await dump(db);
    ok(await workspace.handle(await command(workspace, { kind: 'new', seed: 202 })));
    ok(await workspace.handle(await command(workspace, { kind: 'save' })));
    assert.deepEqual(await storage.listSlots(), oldSlots);
    assert.deepEqual(await db.local_worlds.get('v02-local'), original.worlds[0]);
    for (const slot of ['manual', 'auto', 'previousAuto'] as const) {
      assert.deepEqual((await storage.load(slot)).world, world);
    }
    for (const snapshot of original.snapshots) {
      assert.deepEqual(await db.save_snapshots.get(snapshot.snapshotId), snapshot);
    }
    for (const block of original.blocks) {
      assert.deepEqual(await db.save_blocks.get(block.blockId), block);
    }
  });
});

test('初回保存失敗：途中の書込失敗で4ストアと現在状態を保持し、同じ指示で再試行できる', async () => {
  await database(async (db, workspace) => {
    ok(await workspace.handle(await command(workspace, { kind: 'save' })));
    const request = await command(workspace, { kind: 'new', seed: 301 });
    const before = ok(await workspace.handle({ kind: 'query' }));
    const original = await dump(db);
    const fail = () => {
      throw new Error('テスト用容量不足');
    };
    db.local_worlds.hook('creating', fail);
    const failed = await workspace.handle(request);
    db.local_worlds.hook('creating').unsubscribe(fail);
    assert.equal(failed.ok, false);
    assert.match(!failed.ok ? failed.error : '', /初回保存に失敗/);
    assert.deepEqual(failed.view, before.view);
    assert.deepEqual(await dump(db), original);

    const retry = ok(await workspace.handle(request));
    assert.equal(retry.view.seed, 301);
    assert.equal(retry.view.unsavedChanges, false);
    assert.equal(await db.local_worlds.count(), 2);
    assert.equal(
      (await db.save_slots.where('localWorldId').equals(retry.view.localWorldId).toArray()).length,
      1,
    );
  });
});

test('作成指示再送：進行後・別プレイ切替後・Worker再起動後も重複作成と巻戻しをしない', async () => {
  await database(async (db, workspace) => {
    const request = await command(workspace, { kind: 'new', seed: 401 });
    const created = ok(await workspace.handle(request));
    const progressed = ok(
      await workspace.handle(await command(workspace, { kind: 'advance', count: 1 })),
    );
    assert.deepEqual(ok(await workspace.handle(request)).view, progressed.view);
    ok(await workspace.handle(await command(workspace, { kind: 'save' })));
    const other = ok(await workspace.handle(await command(workspace, { kind: 'new', seed: 402 })));
    const original = await dump(db);
    const replay = ok(await workspace.handle(request));
    assert.equal(replay.createdLocalWorldId, created.view.localWorldId);
    assert.deepEqual(replay.view, other.view);

    const restarted = new WorldWorkspace(db);
    await restarted.initialize();
    const before = ok(await restarted.handle({ kind: 'query' }));
    const after = ok(await restarted.handle(request));
    assert.equal(after.createdLocalWorldId, created.view.localWorldId);
    assert.deepEqual(after.view, before.view);
    assert.deepEqual(await dump(db), original);

    const mismatch = await restarted.handle({ ...request, kind: 'new', seed: 403 });
    assert.equal(mismatch.ok, false);
    assert.match(!mismatch.ok ? mismatch.error : '', /同じ新規作成指示ID/);
    assert.deepEqual(await dump(db), original);
  });
});

test('新規作成検証：不正入力と古い状態の指示はDB・現在状態を変更しない', async () => {
  await database(async (db, workspace) => {
    const request = await command(workspace, { kind: 'new', seed: 501 });
    const before = ok(await workspace.handle({ kind: 'query' }));
    const original = await dump(db);
    const invalid = [
      { ...request, commandId: '' },
      { ...request, seed: 0 },
      { ...request, seed: 0x100000000 },
      { ...request, calendar: 'invalid' },
      { ...request, controlledSquadId: 'missing-club' },
      { ...request, localWorldId: 'other' },
      { ...request, expectedStateRevision: before.view.revision + 1 },
    ];
    for (const input of invalid) {
      const result = await workspace.handle(input as WorldCommand);
      assert.equal(result.ok, false, JSON.stringify(input));
      assert.deepEqual(result.view, before.view);
      assert.deepEqual(await dump(db), original);
    }
  });
});

test('未保存進行：新規作成を止め、手動保存した後に再試行できる', async () => {
  await database(async (db, workspace) => {
    const progressed = ok(
      await workspace.handle(await command(workspace, { kind: 'advance', count: 1 })),
    );
    const rejected = await workspace.handle(await command(workspace, { kind: 'new', seed: 601 }));
    assert.equal(rejected.ok, false);
    assert.match(!rejected.ok ? rejected.error : '', /現在の作業を手動保存/);
    assert.deepEqual(rejected.view, progressed.view);
    assert.equal(await db.local_worlds.count(), 0);
    ok(await workspace.handle(await command(workspace, { kind: 'save' })));
    ok(await workspace.handle(await command(workspace, { kind: 'new', seed: 601 })));
    const original = await new DexieWorldStorage(db).load('manual');
    assert.equal(Object.values(original.world.games)[0]?.state.totalPitches, 1);
  });
});

test('新規確定後の一覧障害：作成成功を維持し、一覧再取得で復帰できる', async () => {
  await database(async (db, workspace) => {
    const request = await command(workspace, { kind: 'new', seed: 701 });
    const original = DexieWorldStorage.prototype.listPlays;
    let result: WorkspaceResponse;
    try {
      DexieWorldStorage.prototype.listPlays = async () => {
        throw new Error('一覧読取障害');
      };
      result = ok(await workspace.handle(request));
    } finally {
      DexieWorldStorage.prototype.listPlays = original;
    }
    assert.match(result.playListError ?? '', /一覧を取得できません/);
    assert.equal(result.view.seed, 701);
    assert.equal(result.view.unsavedChanges, false);
    assert.equal(await db.local_worlds.count(), 1);
    const refreshed = ok(await workspace.handle({ kind: 'query' }));
    assert.equal(refreshed.playListError, undefined);
    assert.equal(refreshed.plays[0]?.localWorldId, result.view.localWorldId);
  });
});

test('新規保存競合：同じ指示IDの同時書込で一方だけ確定し、異なる内容を上書きしない', async () => {
  await database(async (db, first) => {
    const second = new WorldWorkspace(db);
    await second.initialize();
    const request = await command(first, { kind: 'new', seed: 801 });
    const results = await Promise.all([
      first.handle(request),
      second.handle({ ...request, kind: 'new', seed: 802 }),
    ]);
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.equal(await db.local_worlds.count(), 1);
    assert.equal(await db.save_snapshots.count(), 1);
    const winner = results.find((result) => result.ok)!;
    const stored = await new DexieWorldStorage(db, winner.view.localWorldId).load('auto');
    assert.equal(stored.world.seed, winner.view.seed);
    const loser = results.find((result) => !result.ok)!;
    assert.equal(loser.view.revision, 0);
    assert.equal(loser.view.localWorldId, 'v02-local');
  });
});

test('Controller境界：独立保存を通さない直接の新規指示では既存世界を置き換えない', async () => {
  await database(async (db) => {
    const controller = new WorldController(new DexieWorldStorage(db));
    const before = await controller.initialize();
    await assert.rejects(
      controller.dispatch({
        kind: 'new',
        seed: 901,
        commandId: crypto.randomUUID(),
        localWorldId: before.localWorldId,
        expectedStateRevision: before.revision,
      }),
      /未対応/,
    );
    assert.deepEqual(controller.query(), before);
    assert.equal(await db.local_worlds.count(), 0);
  });
});

test('再起動の旧保存保護：未読込の初期表示から保存・進行せず、明示読込後に続行する', async () => {
  await database(async (db, original) => {
    ok(await original.handle(await command(original, { kind: 'advance', count: 1 })));
    ok(await original.handle(await command(original, { kind: 'save' })));
    const before = await dump(db);
    const restarted = new WorldWorkspace(db);
    await restarted.initialize();
    const preview = ok(await restarted.handle({ kind: 'query' }));
    for (const action of [{ kind: 'save' }, { kind: 'advance', count: 1 }] as const) {
      const rejected = await restarted.handle(await command(restarted, action));
      assert.equal(rejected.ok, false);
      assert.match(!rejected.ok ? rejected.error : '', /以前の保存があります/);
      assert.deepEqual(rejected.view, preview.view);
      assert.deepEqual(await dump(db), before);
    }
    const loaded = ok(
      await restarted.handle(await command(restarted, { kind: 'load', slot: 'manual' })),
    );
    assert.equal(loaded.view.games[0]?.totalPitches, 1);
    const advanced = ok(
      await restarted.handle(await command(restarted, { kind: 'advance', count: 1 })),
    );
    assert.equal(advanced.view.games[0]?.totalPitches, 2);
    ok(await restarted.handle(await command(restarted, { kind: 'save' })));
  });
});

test('新規プレイの設定：担当球団と年間日程を初回保存へ保持する', async () => {
  await database(async (db, workspace) => {
    const preview = ok(await workspace.handle({ kind: 'query' }));
    const squadId = preview.view.definitions.squads[1]!.squadId;
    const created = ok(
      await workspace.handle(
        await command(workspace, {
          kind: 'new',
          seed: 1001,
          calendar: 'annual',
          controlledSquadId: squadId,
        }),
      ),
    );
    assert.equal(created.view.currentDate, '2026-03-27');
    assert.equal(created.view.management?.controlledSquadId, squadId);
    const loaded = await new DexieWorldStorage(db, created.view.localWorldId).load('auto');
    assert.equal(loaded.world.definitions.schedule.length, 216);
    assert.equal(loaded.world.currentDate, created.view.currentDate);
    assert.equal(loaded.world.seed, 1001);
    assert.equal(
      'management' in loaded.world && loaded.world.management.controlledSquadId,
      squadId,
    );
  });
});
