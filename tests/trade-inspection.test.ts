import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectWorldTrade } from '../src/world/trade-inspection.ts';
import { createPitchLearningWorld } from '../src/world/engine.ts';
import { WorldController } from '../src/world/controller.ts';
import { emptyWorldSlots } from '../src/world/storage.ts';
import { WorldWorkspace } from '../src/world/workspace.ts';
import { WorldDatabase } from '../src/world/dexie-storage.ts';

function fixture() {
  const world = structuredClone(createPitchLearningWorld());
  assert.ok('management' in world);
  const own = world.definitions.squads.find(
    (s) => s.squadId === world.management.controlledSquadId,
  )!;
  const partner = world.definitions.squads.find((s) => s.team.clubId !== own.team.clubId)!;
  return {
    world,
    own,
    partner,
    context: { requestId: 'test-inspection', localWorldId: 'test-play', stateRevision: 5 },
    proposal: {
      partnerSquadId: partner.squadId,
      outgoingIds: [own.team.lineup[0]!.playerId],
      incomingIds: [partner.team.lineup[0]!.playerId],
      cashYen: 0,
    },
  };
}

test('正本の登録と編成への影響を読み、世界・乱数・名簿を変更しない', () => {
  const { world, own, context, proposal } = fixture();
  const before = structuredClone(world);
  const report = inspectWorldTrade(world, context, proposal);
  assert.deepEqual(world, before);
  assert.equal(report.status, 'blocked');
  assert.equal(report.players.length, 2);
  assert.ok(report.players.every((p) => p.membershipKnown && p.registration));
  assert.ok(report.players[0]!.roles.some((r) => r.battingSlots.includes(1)));
  assert.deepEqual(
    report.counts?.find((c) => c.clubId === own.team.clubId),
    { clubId: own.team.clubId, before: own.players.length, after: own.players.length },
  );
  for (const code of ['contractsUnavailable', 'budgetUnavailable', 'negotiationUnavailable'])
    assert.ok(report.blockers.some((b) => b.code === code));
});

test('重複・誤所属では人数や個別影響を推測しない', () => {
  const { world, context, proposal } = fixture();
  proposal.outgoingIds.push(proposal.incomingIds[0]!);
  const report = inspectWorldTrade(world, context, proposal);
  assert.equal(report.counts, null);
  assert.deepEqual(report.players, []);
  assert.ok(report.blockers.some((b) => b.code === 'selection'));
});

test('Workerでも金額の小数・負数・安全な整数の範囲外を拒否する', () => {
  const { world, context, proposal } = fixture();
  for (const cashYen of [-1, 0.1, Number.MAX_SAFE_INTEGER + 1, NaN])
    assert.throws(() => inspectWorldTrade(world, context, { ...proposal, cashYen }), /円単位/);
});

test('提示金銭だけの獲得を人数へ反映し、自球団指定は拒否する', () => {
  const { world, own, partner, context, proposal } = fixture();
  proposal.outgoingIds = [];
  proposal.cashYen = 100;
  const report = inspectWorldTrade(world, context, proposal);
  assert.deepEqual(
    report.counts?.map((c) => c.after),
    [own.players.length + 1, partner.players.length - 1],
  );
  proposal.partnerSquadId = own.squadId;
  assert.equal(inspectWorldTrade(world, context, proposal).counts, null);
});

test('試合開始後は個別指定がなくても確定不可と示す', () => {
  const { world, context, proposal } = fixture();
  world.dayPlan.cursor = 1;
  assert.ok(
    inspectWorldTrade(world, context, proposal).blockers.some((b) => b.code === 'dayUnavailable'),
  );
});

test('登録履歴がなければ不明と示し、再登録日は記録どおり保持する', () => {
  const { world, context, proposal } = fixture();
  assert.ok('registration' in world);
  const id = proposal.outgoingIds[0]!;
  const row = world.registration.registrations.find((r) => r.playerId === id && r.until === null)!;
  row.nextFirstEligibleOn = '2026-12-01';
  assert.equal(
    inspectWorldTrade(world, context, proposal).players[0]!.registration?.nextFirstEligibleOn,
    '2026-12-01',
  );
  world.registration.registrations = world.registration.registrations.filter((r) => r !== row);
  const report = inspectWorldTrade(world, context, proposal);
  assert.equal(report.players[0]!.registration, null);
  assert.ok(report.blockers.some((b) => b.code === 'registrationUnavailable'));
});

test('未開始試合の明示指定を示し、過去の指定を影響件数へ加えない', () => {
  const { world, own, context, proposal } = fixture();
  const game = world.definitions.schedule.find(
    (g) =>
      g.date >= world.currentDate &&
      (g.awaySquadId === own.squadId || g.homeSquadId === own.squadId),
  )!;
  world.management.starterOverrides[game.gameId] = proposal.outgoingIds[0]!;
  assert.ok(
    inspectWorldTrade(world, context, proposal).players[0]!.futureGameIds.includes(game.gameId),
  );
  game.date = '2020-01-01';
  assert.equal(
    inspectWorldTrade(world, context, proposal).players[0]!.futureGameIds.includes(game.gameId),
    false,
  );
});

test('Controllerはプレイ・世界・状態版を照合し、確認で保存を呼ばない', () => {
  const { world, context, proposal } = fixture();
  const controller = WorldController.fromCommitted(
    {
      async listSlots() {
        return emptyWorldSlots();
      },
      async save() {
        throw new Error('読取から保存してはならない');
      },
      async load() {
        throw new Error('読取から読込してはならない');
      },
    },
    context.localWorldId,
    context.stateRevision,
    world,
    emptyWorldSlots(),
  );
  const request = {
    ...context,
    expectedStateRevision: context.stateRevision,
    worldId: world.worldId,
    proposal,
  };
  assert.equal(controller.inspectTrade(request).stateRevision, 5);
  for (const patch of [
    { localWorldId: 'other' },
    { worldId: 'other' },
    { expectedStateRevision: 4 },
  ])
    assert.throws(() => controller.inspectTrade({ ...request, ...patch }), /古いプレイ/);
  assert.equal(controller.query().revision, 5);
});

test('Workspaceは確認要求を読取へ振り分け、全保存ストアと状態版を保つ', async () => {
  const db = new WorldDatabase('trade-inspection-' + crypto.randomUUID());
  const workspace = new WorldWorkspace(db);
  try {
    await workspace.initialize();
    const before = (await workspace.handle({ kind: 'query' })).view;
    const own = before.definitions.squads.find(
      (s) => s.squadId === before.management?.controlledSquadId,
    )!;
    const partner = before.definitions.squads.find((s) => s.team.clubId !== own.team.clubId)!;
    const counts = await Promise.all(db.tables.map((t) => t.count()));
    const response = await workspace.handle({
      kind: 'inspectTrade',
      requestId: 'read-only',
      localWorldId: before.localWorldId,
      worldId: before.worldId,
      expectedStateRevision: before.revision,
      proposal: {
        partnerSquadId: partner.squadId,
        outgoingIds: [own.team.lineup[0]!.playerId],
        incomingIds: [partner.team.lineup[0]!.playerId],
        cashYen: 0,
      },
    });
    assert.equal(response.ok, true);
    assert.equal(response.tradeInspection?.requestId, 'read-only');
    assert.deepEqual(response.view, before);
    assert.deepEqual(await Promise.all(db.tables.map((t) => t.count())), counts);
  } finally {
    await db.delete();
  }
});
