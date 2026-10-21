import { commonTrainingRef } from '../src/world/training.ts';
import { createHash } from 'node:crypto';
import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { seasonGrowthReport } from '../src/world/season-growth.ts';
import { growthBasis, growthAbilityKey } from '../src/world/growth-basis.ts';
import { createDailyTrainingWorld, createTrainingPlanWorld } from '../src/world/engine.ts';
import { WorldController } from '../src/world/controller.ts';
import { emptyWorldSlots } from '../src/world/storage.ts';
import { validateWorld } from '../src/world/validation.ts';
import { DexieWorldStorage, WorldDatabase } from '../src/world/dexie-storage.ts';
import { exportStoredPlay } from '../src/world/backup-storage.ts';
import { decodeBackup } from '../src/world/backup-package.ts';
import { canonicalJson, sha256 } from '../src/storage/codec.ts';

type Current = ReturnType<typeof createDailyTrainingWorld>;
const bytes = readFileSync(
  new URL('./fixtures/world-v16-training-baseline.json.gz', import.meta.url),
);
const frozen = () => JSON.parse(gunzipSync(bytes).toString('utf8')) as Current;

function independentlyCompare(world: Current, through: string) {
  const initial = Object.fromEntries(
    world.definitions.squads.flatMap((s) =>
      s.players.map((p) => [
        p.playerId,
        Object.fromEntries(
          growthBasis(world.definitions, p.playerId).map((a) => [a.key, a.valueMilli]),
        ),
      ]),
    ),
  );
  const final = structuredClone(initial);
  // 表示処理とは逆に、基準値から対象日までの実履歴を順方向に適用する。
  for (const date of Object.keys(world.growth.state.days)
    .sort()
    .filter((date) => date <= through))
    for (const change of world.growth.state.days[date]!.changes)
      final[change.playerId]![growthAbilityKey(change.abilityRef)] = change.afterValue;
  return Object.keys(initial).map((id) => {
    const deltas = Object.keys(initial[id]!).map(
      (key) => Math.floor(final[id]![key]! / 1000) - Math.floor(initial[id]![key]! / 1000),
    );
    return {
      id,
      increase: deltas.reduce((sum, n) => sum + Math.max(0, n), 0),
      decrease: deltas.reduce((sum, n) => sum + Math.min(0, n), 0),
    };
  });
}

test('0.38.0固定保存：変更前の4日10試合・全状態ハッシュと保存モデルを維持する', async () => {
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    '22d53d484ca207e21865177def075c5598f4c9711e37f260d75e5175cae18daa',
  );
  const world = frozen();
  assert.equal(
    await sha256(canonicalJson(world)),
    '64218a64ca155e8ed9f1b0d64bc72550fb711800504dad2924a920adf9a6e8ce',
  );
  validateWorld(world);
  assert.equal(world.version, 'world-prototype-v16');
  assert.equal(world.currentDate, '2026-09-28');
  assert.equal(world.completedDates.length, 4);
  assert.equal(Object.keys(world.games).length, 10);
  const report = seasonGrowthReport(world, 'firstRegular')!;
  assert.equal(report.completedTrainingDays, 4);
  assert.equal(report.rows.length, 120);
  assert.equal(new Set(report.rows.map((row) => row.playerId)).size, 120);
  for (const expected of independentlyCompare(world, report.through)) {
    const row = report.rows.find((row) => row.playerId === expected.id)!;
    assert.equal(row.increase, expected.increase);
    assert.equal(row.decrease, expected.decrease);
    assert.equal(row.net, expected.increase + expected.decrease);
  }
});

test('年間成長：表示整数の端点差・小数のみの変化・固定特性の除外を守る', () => {
  // 集計境界の検体。試合再現性は変更前固定保存で別途検査する。
  const world = frozen();
  const player = world.definitions.squads[0]!.players[0]!;
  player.batting.contactVsRight.valueMilli = 59900;
  player.batting.contactVsLeft.valueMilli = 60100;
  player.powerVsRight.valueMilli = 40001;
  const basis = growthBasis(world.definitions, player.playerId);
  const values = Object.fromEntries(basis.map((a) => [a.key, a.valueMilli]));
  for (const [code, value] of [
    ['batting.contactVsRight', 60200],
    ['batting.contactVsLeft', 60800],
    ['batting.powerVsRight', 39999],
  ] as const) {
    const a = basis.find((a) => a.key === growthAbilityKey(commonTrainingRef(code)))!;
    values[a.key] = value;
  }
  world.growth.state.players[player.playerId]!.values = values;
  const row = seasonGrowthReport(world, 'firstRegular')!.rows.find(
    (r) => r.playerId === player.playerId,
  )!;
  assert.deepEqual([row.increase, row.decrease, row.net], [1, -1, 0]);
  assert.equal(row.changes.length, 3);
  assert.deepEqual(
    row.changes.map((c) => c.delta),
    [1, 0, -1],
  );
  assert.ok(
    row.changes.every(
      (c) => !['talent', 'ambition', 'aptitude', 'velocity', 'energy'].includes(c.abilityRef.code),
    ),
  );
});

test('年間成長：二軍終了後の成長を混ぜず、日内の連続変化も最終日まで巻き戻す', () => {
  const world = frozen();
  world.farmSummary!.completedOn = '2026-09-24';
  const report = seasonGrowthReport(world, 'farmRegular')!;
  assert.equal(report.through, '2026-09-24');
  assert.equal(report.completedTrainingDays, 1);
  for (const expected of independentlyCompare(world, report.through)) {
    const row = report.rows.find((row) => row.playerId === expected.id)!;
    assert.deepEqual([row.increase, row.decrease], [expected.increase, expected.decrease]);
  }
  assert.ok(
    report.rows.some(
      (r) =>
        JSON.stringify(r.changes) !==
        JSON.stringify(
          seasonGrowthReport(world, 'firstRegular')!.rows.find((p) => p.playerId === r.playerId)!
            .changes,
        ),
    ),
  );
});

test('年間成長：未終了・旧保存は未記録として返し、0成長を補完しない', () => {
  assert.equal(seasonGrowthReport(createDailyTrainingWorld(), 'firstRegular'), null);
  assert.equal(seasonGrowthReport(createDailyTrainingWorld(), 'farmRegular'), null);
  assert.equal(seasonGrowthReport(createTrainingPlanWorld(), 'firstRegular'), null);
  const world = frozen();
  const initial = Object.fromEntries(
    world.definitions.squads.flatMap((s) =>
      s.players.map((p) => [
        p.playerId,
        Object.fromEntries(
          growthBasis(world.definitions, p.playerId).map((a) => [a.key, a.valueMilli]),
        ),
      ]),
    ),
  );
  for (const [id, values] of Object.entries(initial))
    world.growth.state.players[id]!.values = values;
  assert.ok(
    seasonGrowthReport(world, 'firstRegular')!.rows.every(
      (r) => r.net === 0 && r.changes.length === 0,
    ),
  );
});

test('年間成長：閲覧で正本・乱数を変更せず、応答を編集しても次回表示に混入しない', () => {
  const world = frozen();
  const before = canonicalJson(world);
  const controller = WorldController.fromCommitted(
    {} as never,
    'season-growth-read',
    0,
    world,
    emptyWorldSlots(),
  );
  const first = controller.query();
  assert.equal(
    first.seasonGrowth.firstRegular!.rows.filter(
      (r) => r.clubId === world.definitions.squads[0]!.team.clubId,
    ).length,
    30,
  );
  first.seasonGrowth.firstRegular!.rows[0]!.name = '書換';
  first.seasonGrowth.firstRegular!.rows[0]!.net = 999999;
  const changed = first.seasonGrowth.firstRegular!.rows.find((r) => r.changes.length)!;
  changed.changes[0]!.abilityRef.code = 'control' as never;
  assert.notEqual(controller.query().seasonGrowth.firstRegular!.rows[0]!.name, '書換');
  assert.equal(canonicalJson(world), before);
  assert.equal(canonicalJson(first.seasonGrowth).includes('drawCount'), false);
});

test('年間成長：既存v017の保存・再読込・バックアップから同じ確定レポートを復元する', async () => {
  const world = frozen();
  const expected = seasonGrowthReport(world, 'firstRegular');
  const db = new WorldDatabase('season-growth-save');
  try {
    const storage = new DexieWorldStorage(db);
    await storage.save(world, 1, 'manual', 0);
    const snapshot = (await db.save_snapshots.toArray())[0]!;
    assert.equal(snapshot.versions.saveFormatVersion, 'v017-world-snapshot-v16');
    assert.equal(snapshot.blockRefs.filter((r) => r.kind === 'growthDay').length, 4);
    const loaded = (await storage.load('manual')).world;
    const imported = (
      await decodeBackup(await exportStoredPlay(db, storage.localWorldId, 'manual'))
    ).world;
    for (const restored of [loaded, imported]) {
      assert.deepEqual(restored, world);
      assert.equal('seasonGrowth' in restored, false);
      assert.deepEqual(seasonGrowthReport(restored, 'firstRegular'), expected);
    }
  } finally {
    db.close();
    await db.delete();
  }
});
