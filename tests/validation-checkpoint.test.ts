import test from 'node:test';
import assert from 'node:assert/strict';
import { createBullpenWorld, advanceWorld, completeDay, worldPhase } from '../src/world/engine.ts';
import { applyManagement } from '../src/world/management.ts';
import { validateWorld, WorldValidator } from '../src/world/validation.ts';
import { canonicalJson } from '../src/storage/codec.ts';
import type { WorldRecord, ManagementAction } from '../src/world/types.ts';

function day(world: WorldRecord): WorldRecord {
  while (worldPhase(world) === 'playing') world = advanceWorld(world, 25);
  return completeDay(world, world.currentDate);
}
function copyCore(world: WorldRecord): WorldRecord {
  const { games, ...core } = world;
  return { ...structuredClone(core), games: { ...games } } as WorldRecord;
}

test('日次検証：連続保存・無試合日・終了時を全再実行と同じ状態として検査する', () => {
  const validator: WorldValidator = new WorldValidator();
  let world: WorldRecord = createBullpenWorld();
  while (worldPhase(world) !== 'scheduleComplete') {
    world = day(world);
    const before = canonicalJson(world);
    validator.validate(world);
    validator.validate(world);
    validateWorld(structuredClone(world));
    assert.equal(canonicalJson(world), before);
  }
});

test('日次検証：同じ終了試合でも成績・身体・調子・日付・cursor・余分な試合の改変を拒否する', () => {
  const validator: WorldValidator = new WorldValidator();
  const first = day(createBullpenWorld());
  validator.validate(first);
  const world = day(first);
  validator.validate(world);
  const variants = Array.from({ length: 8 }, () => copyCore(world));
  variants[0]!.currentDate = '2026-09-28';
  variants[1]!.dayPlan.cursor++;
  variants[2]!.completedDates[0] = '2026-09-23';
  variants[3]!.games.extra = Object.values(world.games)[0]!;
  delete variants[4]!.games[Object.keys(world.games)[0]!];
  // 正当な別日の状態を混ぜても、試合オブジェクトの一致だけでは採用しない。
  Object.assign(variants[5]!, { stats: structuredClone(first.stats) });
  if ('physical' in first)
    Object.assign(variants[6]!, { physical: structuredClone(first.physical) });
  if ('condition' in first)
    Object.assign(variants[7]!, { condition: structuredClone(first.condition) });
  for (const changed of variants) {
    assert.throws(() => validator.validate(changed));
    validator.validate(world); // 失敗した候補で検証済み状態を汚染しない。
  }
});

test('日次検証：開始定義・seed・担当球団の変更では履歴を飛ばさない', () => {
  const validator: WorldValidator = new WorldValidator();
  const world = day(createBullpenWorld());
  validator.validate(world);
  const definitions = copyCore(world);
  definitions.definitions.squads[0]!.team.name += '変更';
  assert.throws(() => validator.validate(definitions));
  assert.throws(() => validator.validate({ ...world, seed: world.seed + 1 }));
  const controlled = copyCore(world);
  if ('management' in controlled) controlled.management.controlledSquadId = 'invalid-squad';
  assert.throws(() => validator.validate(controlled));
  validator.validate(world);
});

test('日次検証：外部から変更された世界coreと、複製した試合の改変を拒否する', () => {
  const validator: WorldValidator = new WorldValidator();
  const world = day(createBullpenWorld());
  const original = canonicalJson(world);
  validator.validate(world);
  const date = world.currentDate;
  world.currentDate = '2099-01-01';
  assert.throws(() => validator.validate(world));
  world.currentDate = date;
  validator.validate(world);
  const cloned = structuredClone(world);
  Object.values(cloned.games)[0]!.state.rng.drawCount++;
  assert.throws(() => validator.validate(cloned));
  validator.validate(world);
  assert.equal(canonicalJson(world), original);
});

test('日次検証：途中試合は毎回再現し、過去保存へ戻ってからの再進行も成立する', () => {
  const validator: WorldValidator = new WorldValidator();
  const initial = createBullpenWorld();
  const first = day(initial);
  validator.validate(first);
  const partial = advanceWorld(first, 1);
  validator.validate(partial);
  const broken = copyCore(partial);
  const active = broken.dayPlan.gameIds[broken.dayPlan.cursor]!;
  broken.games[active] = structuredClone(partial.games[active]!);
  broken.games[active]!.state.rng.drawCount++;
  assert.throws(() => validator.validate(broken));
  validator.validate(advanceWorld(partial, 25));
  validator.validate(initial);
  validator.validate(day(initial));
});

test('日次検証：現在日の編成指示を再適用し、完了日内の編成履歴の改変を拒否する', () => {
  const validator: WorldValidator = new WorldValidator();
  let world: WorldRecord = createBullpenWorld();
  const squadId = world.management.controlledSquadId;
  const action: Extract<ManagementAction, { kind: 'setClubPlan' }> = {
    kind: 'setClubPlan',
    squadId,
    lineup: structuredClone(world.management.idealLineups[squadId]!),
    pitchers: structuredClone(world.management.pitcherUsagePlans[squadId]!),
  };
  validator.validate(world);
  world = applyManagement(world, 'checkpoint-plan', action);
  validator.validate(world);
  world = day(world);
  validator.validate(world);
  const changed = copyCore(world);
  if ('management' in changed) changed.management.actions[0]!.sequence++;
  assert.throws(() => validator.validate(changed));
  validator.validate(world);
});
