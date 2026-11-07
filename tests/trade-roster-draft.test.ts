import assert from 'node:assert/strict';
import test from 'node:test';
import { tradePlayView } from '../src/world/trade-play-view.ts';
import type { TradeWorkerActive } from '../src/world/trade-worker-protocol.ts';
import {
  createTradeRosterDraft,
  placeDraftBatter,
  swapDraftPositions,
  changeDraftRegistration,
  placeDraftPitcher,
  buildTradeRosterAction,
  sameDraft,
} from '../src/ui/trade-play/trade-roster-draft.ts';
import { gameFixture } from './helpers/trade-game-fixture.ts';
import { reserveBatter } from './helpers/trade-registration-fixture.ts';

function fixture() {
  const f = gameFixture();
  const clubId = f.initial.state.initialDefinitions.squads.find(
    (s) => s.squadId === f.initial.state.management.controlledSquadId,
  )!.team.clubId;
  f.initial.state.rosterControl.policies[clubId]!.changeMode = 'manual';
  const view = tradePlayView({
    snapshot: f.initial,
    pendingCommands: 0,
    saving: false,
    reloadRequired: false,
  });
  const active: TradeWorkerActive = {
    sessionId: 'draft-test-session',
    localWorldId: view.localWorldId,
    worldId: view.worldId,
    stateRevision: view.stateRevision,
    storageRevision: view.storageRevision,
    reloadRequired: false,
  };
  const draft = createTradeRosterDraft(active, view),
    squad = draft.squads.find((s) => s.category === 'first')!;
  return { ...f, view, active, draft, squad };
}

test('スタメン間は打順と守備位置が一緒に移動し、元の案と守備配置を保つ', () => {
  const f = fixture(),
    before = structuredClone(f.draft),
    rows = f.squad.lineup.battingOrder;
  const next = placeDraftBatter(f.draft, f.squad.squadId, 2, rows[0]!.playerId!);
  const plan = next.squads.find((s) => s.squadId === f.squad.squadId)!;
  assert.equal(plan.lineup.battingOrder[1]!.playerId, rows[0]!.playerId);
  assert.equal(plan.lineup.battingOrder[1]!.battingRole, rows[0]!.battingRole);
  assert.equal(plan.lineup.battingOrder[0]!.playerId, rows[1]!.playerId);
  assert.deepEqual(plan.lineup.defense, f.squad.lineup.defense);
  assert.deepEqual(f.draft, before);
});

test('控えからの交代は対象枠の位置を引き継ぎ、元の先発選手は登録を保つ', () => {
  const f = fixture(),
    incoming = reserveBatter(f.initial),
    slot = f.squad.lineup.battingOrder.find((s) => s.battingRole !== 'DH')!;
  const next = placeDraftBatter(f.draft, f.squad.squadId, slot.slotNo, incoming);
  const lineup = next.squads.find((s) => s.squadId === f.squad.squadId)!.lineup;
  assert.equal(lineup.battingOrder[slot.slotNo - 1]!.battingRole, slot.battingRole);
  assert.equal(lineup.defense.find((r) => r.positionCode === slot.battingRole)!.playerId, incoming);
  assert.equal(next.categories[slot.playerId!], 'first');
  assert.ok(!lineup.battingOrder.some((s) => s.playerId === slot.playerId));
});

test('守備位置だけの交換では選手・打順を動かさずDHの守備枠も作らない', () => {
  const f = fixture(),
    dh = f.squad.lineup.battingOrder.find((r) => r.battingRole === 'DH')!,
    other = f.squad.lineup.battingOrder.find((r) => r.battingRole !== 'DH')!;
  const next = swapDraftPositions(f.draft, f.squad.squadId, dh.slotNo, other.slotNo),
    lineup = next.squads.find((s) => s.squadId === f.squad.squadId)!.lineup;
  assert.deepEqual(
    lineup.battingOrder.map((r) => r.playerId),
    f.squad.lineup.battingOrder.map((r) => r.playerId),
  );
  assert.equal(lineup.battingOrder[dh.slotNo - 1]!.battingRole, other.battingRole);
  assert.equal(
    lineup.defense.find((r) => r.positionCode === other.battingRole)!.playerId,
    dh.playerId,
  );
  assert.equal(lineup.defense.find((r) => r.positionCode === 'P')!.playerId, null);
  assert.ok(!lineup.defense.some((r) => String(r.positionCode) === 'DH'));
});

test('登録先変更は旧軍の配置・指定を解除するが、新軍の代役を自動補充しない', () => {
  const f = fixture(),
    playerId = f.squad.pitchers.rotationSlots[0]!.playerId!;
  f.squad.individualRest = [
    ...f.squad.individualRest.filter((r) => r.playerId !== playerId),
    { playerId, mode: 'inherit' },
  ];
  const farm = structuredClone(f.draft.squads.find((s) => s.category === 'farm'));
  const next = changeDraftRegistration(f.draft, playerId, 'farm'),
    first = next.squads.find((s) => s.category === 'first')!;
  assert.equal(next.categories[playerId], 'farm');
  assert.equal(first.pitchers.rotationSlots[0]!.playerId, null);
  assert.ok(!first.individualRest.some((r) => r.playerId === playerId));
  assert.deepEqual(
    next.squads.find((s) => s.category === 'farm'),
    farm,
  );
  assert.equal(f.squad.pitchers.rotationSlots[0]!.playerId, playerId);
});

test('先発と救援を交換しても各投手の個別指定と登録を保持する', () => {
  const f = fixture(),
    oldStarter = f.squad.pitchers.rotationSlots[0]!.playerId!,
    relief = f.squad.pitchers.reliefRoles[0]!.playerId;
  const next = placeDraftPitcher(f.draft, f.squad.squadId, relief, { kind: 'rotation', index: 0 }),
    plan = next.squads.find((s) => s.squadId === f.squad.squadId)!;
  assert.equal(plan.pitchers.rotationSlots[0]!.playerId, relief);
  assert.equal(plan.pitchers.reliefRoles[0]!.playerId, oldStarter);
  assert.deepEqual(plan.individualRest, f.squad.individualRest);
  assert.deepEqual(plan.conditionalRelief, f.squad.conditionalRelief);
  assert.deepEqual(next.categories, f.draft.categories);
});

test('先発を救援末尾へ動かすと先発空席が残り、別軍投手の配置を暗黙登録しない', () => {
  const f = fixture(),
    starter = f.squad.pitchers.rotationSlots[0]!.playerId!;
  const next = placeDraftPitcher(f.draft, f.squad.squadId, starter, {
    kind: 'relief',
    index: f.squad.pitchers.reliefRoles.length,
  });
  const plan = next.squads.find((s) => s.squadId === f.squad.squadId)!;
  assert.equal(plan.pitchers.rotationSlots[0]!.playerId, null);
  assert.equal(plan.pitchers.reliefRoles.at(-1)!.playerId, starter);
  const farm = f.draft.squads.find((s) => s.category === 'farm')!.pitchers.rotationSlots[0]!
    .playerId!;
  assert.throws(
    () => placeDraftPitcher(f.draft, f.squad.squadId, farm, { kind: 'rotation', index: 0 }),
    /登録先/,
  );
});

test('指示は元のプレイ・世界・版・日付・sessionで作り、再開前の案を付け替えない', () => {
  const f = fixture(),
    next = swapDraftPositions(f.draft, f.squad.squadId, 1, 2);
  const action = buildTradeRosterAction(f.active, f.view, next, 'draft-commit-id');
  assert.equal(action.sessionId, f.active.sessionId);
  assert.equal(action.command.expectedStateRevision, f.view.stateRevision);
  assert.equal(action.command.expectedDate, f.view.currentDate);
  assert.equal(action.command.squadReplacements.length, 1);
  assert.deepEqual(action.command.changes, []);
  assert.throws(
    () => buildTradeRosterAction({ ...f.active, sessionId: 'reopened' }, f.view, next, 'new'),
    /作り直し/,
  );
  assert.throws(
    () => createTradeRosterDraft({ ...f.active, stateRevision: f.view.stateRevision + 1 }, f.view),
    /状態版/,
  );
});

test('変更なし・自動モードの直接登録を拒否し、明示リセットで元へ戻せる', () => {
  const f = fixture(),
    moved = changeDraftRegistration(f.draft, reserveBatter(f.initial), 'farm');
  assert.throws(
    () => buildTradeRosterAction(f.active, f.view, f.draft, 'none'),
    /変更がありません/,
  );
  const auto = structuredClone(f.view);
  auto.capabilities.canChangeRegistrations = false;
  assert.throws(() => buildTradeRosterAction(f.active, auto, moved, 'auto'), /手動/);
  assert.equal(sameDraft(f.draft, createTradeRosterDraft(f.active, f.view)), true);
  assert.equal(sameDraft(f.draft, moved), false);
});
