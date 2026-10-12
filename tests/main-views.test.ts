import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBullpenWorld,
  createWorld,
  advanceWorld,
  completeDay,
  worldPhase,
} from '../src/world/engine.ts';
import { playerStatuses } from '../src/world/player-status.ts';
import { winBalanceSeries } from '../src/world/win-balance.ts';
import { WorldController, type WorldView } from '../src/world/controller.ts';
import { emptyWorldSlots } from '../src/world/storage.ts';
import { DexieWorldStorage, WorldDatabase } from '../src/world/dexie-storage.ts';
import type { WorldRecord } from '../src/world/types.ts';

async function query(world: WorldRecord) {
  const controller = new WorldController({
    listSlots: async () => emptyWorldSlots(),
    save: async () => {
      throw new Error('閲覧では保存しない');
    },
    load: async () => ({ world: structuredClone(world), slots: emptyWorldSlots() }),
  });
  return controller.dispatch({
    kind: 'load',
    slot: 'manual',
    localWorldId: 'v02-local',
    commandId: 'view-test',
    expectedStateRevision: 0,
  });
}
function finishDay(world: WorldRecord): WorldRecord {
  while (worldPhase(world) === 'playing') world = advanceWorld(world, 25);
  return completeDay(world, world.currentDate);
}

test('選手Query：全球団120人の現在状態だけを返し、欠測と0・現在登録と過去登録を区別する', () => {
  const world = createBullpenWorld(1);
  const id = world.definitions.squads[1]!.players[0]!.playerId;
  world.physical.players[id]!.fatigueMilli = 0;
  const registration = world.registration.registrations.find((row) => row.playerId === id)!;
  world.registration.registrations.unshift({
    ...registration,
    registrationId: 'past',
    category: registration.category === 'first' ? 'farm' : 'first',
    until: { date: world.currentDate, order: 0 },
  });
  const before = structuredClone(world);
  const rows = playerStatuses(world);
  assert.equal(rows.length, 120);
  assert.equal(new Set(rows.map((row) => row.playerId)).size, 120);
  const row = rows.find((row) => row.playerId === id)!;
  assert.equal(row.registration, registration.category);
  assert.equal(row.fatigueMilli, 0);
  assert.equal(typeof row.condition, 'string');
  assert.deepEqual(
    Object.keys(row).sort(),
    ['playerId', 'clubId', 'registration', 'energyMilli', 'fatigueMilli', 'condition'].sort(),
  );
  assert.deepEqual(world, before);
  assert.ok(
    playerStatuses(createWorld()).every(
      (row) =>
        row.registration === null &&
        row.condition === null &&
        row.energyMilli === null &&
        row.fatigueMilli === null,
    ),
  );
});

test('貯金Query：勝敗・引分・未完了・二軍を分離し、月をまたいでも累計を保持する', async () => {
  const view = await query(createBullpenWorld());
  const a = view.definitions.squads[0]!.squadId;
  const b = view.definitions.squads[1]!.squadId;
  // 集計境界用の表示データ。エンジン・保存の検体には使わない。
  view.definitions.startDate = '2026-09-30';
  view.definitions.endDate = '2026-10-03';
  view.currentDate = '2026-10-02';
  const fixture = view.games[0]!;
  const game = (
    date: string,
    away: number,
    home: number,
    status: WorldView['games'][number]['status'] = 'completed',
  ) => ({
    ...fixture,
    gameId: date + '-' + status,
    date,
    awaySquadId: a,
    homeSquadId: b,
    status,
    score: { away, home },
    result: { score: { away, home } } as WorldView['games'][number]['result'],
  });
  view.games = [
    game('2026-09-30', 2, 1),
    game('2026-10-01', 0, 3),
    game('2026-10-01', 4, 4),
    game('2026-10-02', 99, 0, 'playing'),
    game('2026-10-02', 99, 0, 'aborted'),
    game('2026-10-03', 0, 3),
  ];
  const before = structuredClone(view);
  const rows = winBalanceSeries(view, 'firstRegular');
  assert.deepEqual(
    rows[0]!.points.map((row) => row.balance),
    [1, 0, 0],
  );
  assert.deepEqual(
    rows[1]!.points.map((row) => row.balance),
    [-1, 0, 0],
  );
  assert.deepEqual(rows[0]!.points[2], {
    date: '2026-10-02',
    wins: 1,
    losses: 1,
    draws: 1,
    balance: 0,
  });
  assert.ok(
    winBalanceSeries(view, 'farmRegular').every((row) =>
      row.points.every((point) => point.balance === 0),
    ),
  );
  assert.deepEqual(view, before);
  view.currentDate = '2026-10-10';
  assert.equal(winBalanceSeries(view, 'firstRegular')[0]!.points.at(-1)!.date, '2026-10-03');
});

test('貯金Query：実試合・一軍休養日・年度末と保存復元が累計順位に一致する', async () => {
  let world: WorldRecord = createBullpenWorld(1);
  world = finishDay(finishDay(finishDay(world)));
  const view = await query(world);
  for (const scope of ['firstRegular', 'farmRegular'] as const) {
    const rows = winBalanceSeries(view, scope);
    const standings = scope === 'firstRegular' ? view.standings : view.farm!.standings;
    for (const row of rows) {
      const standing = standings.find((item) => item.squadId === row.squadId)!;
      assert.equal(row.points.at(-1)!.balance, standing.wins - standing.losses);
      assert.equal(row.points.at(-1)!.draws, standing.draws);
      if (scope === 'firstRegular')
        assert.equal(
          row.points.find((point) => point.date === '2026-09-26')!.balance,
          row.points.find((point) => point.date === '2026-09-25')!.balance,
        );
    }
  }
  world = finishDay(world);
  const db = new WorldDatabase('main-views-integration');
  try {
    const storage = new DexieWorldStorage(db);
    await storage.save(world, 1, 'manual', 0);
    const controller = new WorldController(storage);
    await controller.initialize();
    const loaded = await controller.dispatch({
      kind: 'load',
      slot: 'manual',
      localWorldId: 'v02-local',
      commandId: 'saved-query',
      expectedStateRevision: 0,
    });
    const before = structuredClone(loaded);
    assert.deepEqual(loaded.playerStatuses, playerStatuses(world));
    for (const scope of ['firstRegular', 'farmRegular'] as const)
      assert.deepEqual(
        winBalanceSeries(loaded, scope),
        winBalanceSeries(await query(world), scope),
      );
    assert.equal(
      winBalanceSeries(loaded, 'firstRegular')[0]!.points.at(-1)!.date,
      world.definitions.endDate,
    );
    loaded.playerStatuses[0]!.energyMilli = -1;
    assert.deepEqual(controller.query(), before);
  } finally {
    db.close();
    await db.delete();
  }
  const legacy = await query(finishDay(createWorld()));
  assert.deepEqual(winBalanceSeries(legacy, 'farmRegular'), []);
  assert.ok(
    winBalanceSeries(legacy, 'firstRegular').some(
      (row) => row.points[0]!.wins + row.points[0]!.losses + row.points[0]!.draws > 0,
    ),
  );
});
