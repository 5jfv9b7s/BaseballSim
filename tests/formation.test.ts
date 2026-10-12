import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBullpenWorld, createWorld } from '../src/world/engine.ts';
import { applyFormation } from '../src/world/formation.ts';
import { createFormationDraft, formationChanged } from '../src/world/formation-draft.ts';
import { WorldController, type WorldCommand } from '../src/world/controller.ts';
import { DexieWorldStorage, WorldDatabase } from '../src/world/dexie-storage.ts';
import { emptyWorldSlots } from '../src/world/storage.ts';
import type { WorldRecord } from '../src/world/types.ts';

function setup() {
  let saved: WorldRecord | null = null;
  let writes = 0;
  let fail = false;
  const controller = new WorldController({
    listSlots: async () => emptyWorldSlots(),
    load: async () => {
      throw new Error('未使用');
    },
    save: async (world) => {
      writes++;
      if (fail) throw new Error('保存失敗の検体');
      saved = structuredClone(world);
      return emptyWorldSlots();
    },
  });
  const draft = createFormationDraft(controller.query())!;
  const command = (id: string): Extract<WorldCommand, { kind: 'setFormation' }> => ({
    ...draft,
    kind: 'setFormation',
    commandId: id,
    localWorldId: 'v02-local',
    expectedStateRevision: controller.query().revision,
  });
  return {
    controller,
    draft,
    command,
    saved: () => saved!,
    writes: () => writes,
    fail: (value: boolean) => {
      fail = value;
    },
  };
}
function swapRegistration(s: ReturnType<typeof setup>) {
  const view = s.controller.query();
  const squad = view.definitions.squads.find((r) => r.squadId === s.draft.squadId)!;
  const first = squad.team.pitcherIds.find((id) => s.draft.firstPlayerIds!.includes(id))!;
  const farm = squad.team.pitcherIds.find((id) => !s.draft.firstPlayerIds!.includes(id))!;
  assert.ok(first && farm);
  s.draft.firstPlayerIds = s.draft.firstPlayerIds!.filter((id) => id !== first).concat(farm);
  return { first, farm };
}

test('編成案：タブ共通の最終状態だけを比較し、登録を戻した場合は履歴も保存も増やさない', async () => {
  const s = setup();
  const original = createFormationDraft(s.controller.query())!;
  const id = s.draft.firstPlayerIds!.shift()!;
  s.draft.firstPlayerIds!.push(id);
  assert.equal(formationChanged(original, s.draft), false);
  const before = s.controller.query();
  await s.controller.dispatch(s.command('noop'));
  assert.equal(s.writes(), 0);
  assert.deepEqual(s.controller.query().registration, before.registration);
  assert.deepEqual(s.controller.query().management, before.management);
  assert.throws(() => applyFormation(createWorld(), 'old', s.draft), /対応していません/);
});

test('編成確定：登録とオーダーを一度で保存し、保存失敗・再送・保存復元で部分適用しない', async () => {
  const s = setup();
  const before = s.controller.query();
  const { first, farm } = swapRegistration(s);
  [s.draft.lineup.battingOrder[0], s.draft.lineup.battingOrder[1]] = [
    s.draft.lineup.battingOrder[1]!,
    s.draft.lineup.battingOrder[0]!,
  ];
  s.draft.lineup.battingOrder.forEach((row, index) => {
    row.slotNo = index + 1;
  });
  const cmd = s.command('formation-atomic');
  s.fail(true);
  await assert.rejects(s.controller.dispatch(cmd), /保存失敗/);
  assert.deepEqual(s.controller.query().management, before.management);
  assert.deepEqual(s.controller.query().registration, before.registration);
  assert.equal(s.controller.query().revision, before.revision);
  s.fail(false);
  const changed = await s.controller.dispatch(cmd);
  assert.equal(s.writes(), 2);
  assert.equal(changed.management!.actions.length, before.management!.actions.length + 2);
  assert.equal(
    changed.registration!.registrations.length,
    before.registration!.registrations.length,
  );
  const saved = s.saved();
  assert.ok('registration' in saved);
  assert.equal(
    saved.registration.registrations.length,
    createBullpenWorld().registration.registrations.length + 2,
  );
  const row = changed.registration!.registrations.find(
    (r) => r.playerId === first && r.until === null,
  )!;
  assert.equal(row.category, 'farm');
  assert.ok(row.nextFirstEligibleOn! > changed.currentDate);
  assert.equal(
    changed.registration!.registrations.find((r) => r.playerId === farm && r.until === null)!
      .category,
    'first',
  );
  assert.deepEqual(await s.controller.dispatch(cmd), changed);
  assert.equal(s.writes(), 2);
  await assert.rejects(
    s.controller.dispatch({ ...cmd, pitchers: { ...cmd.pitchers, nextSlotNo: 6 } }),
    /同じ指示ID/,
  );
  const db = new WorldDatabase('formation-atomic-test');
  try {
    const storage = new DexieWorldStorage(db);
    await storage.save(s.saved(), changed.revision, 'manual', 0);
    const loaded = await storage.load('manual');
    assert.deepEqual(loaded.world, s.saved());
  } finally {
    db.close();
    await db.delete();
  }
  const retryDraft = createFormationDraft(changed)!;
  retryDraft.firstPlayerIds = retryDraft.firstPlayerIds!.filter((id) => id !== farm).concat(first);
  await assert.rejects(
    s.controller.dispatch({
      ...retryDraft,
      kind: 'setFormation',
      commandId: 'too-early',
      localWorldId: 'v02-local',
      expectedStateRevision: changed.revision,
    }),
    /再登録可能日/,
  );
  assert.deepEqual(s.controller.query().registration, changed.registration);
});

test('編成検証：後段の不正、人数違反、他球団、古い状態を拒否して既存データを保持する', async () => {
  const s = setup();
  const before = s.controller.query();
  swapRegistration(s);
  s.draft.pitchers.rotationSlots = [];
  await assert.rejects(s.controller.dispatch(s.command('invalid-plan')), /ローテーション人数/);
  assert.equal(s.writes(), 0);
  assert.deepEqual(s.controller.query().registration, before.registration);
  const fresh = createFormationDraft(before)!;
  await assert.rejects(
    s.controller.dispatch({ ...s.command('invalid-count'), ...fresh, firstPlayerIds: [] }),
    /野手|人数|名簿/,
  );
  await assert.rejects(
    s.controller.dispatch({
      ...s.command('other'),
      ...fresh,
      squadId: before.definitions.squads[1]!.squadId,
    }),
    /担当球団/,
  );
  await assert.rejects(
    s.controller.dispatch({ ...s.command('stale'), ...fresh, expectedStateRevision: 99 }),
    /古い世界/,
  );
  assert.deepEqual(s.controller.query(), before);
  const world = createBullpenWorld();
  const frozen = structuredClone(world);
  assert.equal(applyFormation(world, 'unchanged', fresh), world);
  assert.deepEqual(world, frozen);
});
