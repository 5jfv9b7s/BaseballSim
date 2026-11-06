import assert from 'node:assert/strict';
import test from 'node:test';
import { TradeGameSession } from '../src/world/trade-game-session.ts';
import {
  applyTradeGameCommand,
  MAX_GAME_COMMANDS_PER_SAVE,
} from '../src/world/trade-game-commands.ts';
import { validateTradeSavedState } from '../src/world/trade-save-validation.ts';
import { validateTradeSaveTransition } from '../src/world/trade-save-transition.ts';
import { encodeTradeSnapshot, decodeTradeSnapshot } from '../src/world/trade-snapshot-codec.ts';
import { tradeSquadRoster } from '../src/world/trade-squad-roster.ts';
import { commitAcceptedTrade } from '../src/recruitment/trade-commit.ts';
import { createTradeApplicationPort } from '../src/world/trade-application-port.ts';
import {
  gameFixture,
  beginCommand,
  advanceCommand,
  applied,
  memoryStorage,
} from './helpers/trade-game-fixture.ts';

test('開始確定は名簿・現在登録の調子サンプル・指示履歴を一緒に反映し自動保存しない', async () => {
  const f = gameFixture(),
    before = structuredClone(f.initial),
    memory = memoryStorage(f.initial);
  const session = await TradeGameSession.open(memory.storage),
    command = beginCommand(f.initial);
  session.execute(command);
  const view = session.read(),
    world = view.snapshot.state;
  assert.equal(view.snapshot.stateRevision, f.initial.stateRevision + 1);
  assert.equal(view.snapshot.storageRevision, f.initial.storageRevision);
  assert.equal(memory.writes(), 0);
  assert.equal(view.pendingCommands, 1);
  assert.equal(world.games[command.gameId]!.events.length, 0);
  assert.ok(
    Object.values(world.registration.gameRosters[command.gameId]!).every((r) =>
      r.participants.every((p) => !p.appeared),
    ),
  );
  assert.equal(
    world.condition.samples[command.gameId]!.length,
    Object.values(world.registration.gameRosters[command.gameId]!).reduce(
      (sum, r) => sum + tradeSquadRoster(world, r.squadId).registeredPlayerIds.length,
      0,
    ),
  );
  assert.deepEqual(world.growth, f.initial.state.growth);
  assert.deepEqual(world.finance, f.initial.state.finance);
  assert.deepEqual(f.initial, before);
  validateTradeSavedState(view.snapshot);
});

test('一球の原記録・RNG・身体負荷・登板履歴を反映し、控えは出場へ加えない', () => {
  const f = gameFixture(),
    command = beginCommand(f.initial);
  const squad = f.initial.state.initialDefinitions.schedule.find(
    (g) => g.gameId === command.gameId,
  )!.awaySquadId;
  const reserve = tradeSquadRoster(f.initial.state, squad).reserveBatterIds[0]!;
  assert.ok(reserve);
  command.benchIds.away.push(reserve);
  const started = applied(f.initial, command),
    before = structuredClone(started);
  const next = applied(started, advanceCommand(started));
  const game = next.state.games[command.gameId]!,
    pitch = game.events[0]!.pitch!;
  assert.equal(game.state.totalPitches, 1);
  assert.ok(game.state.rng.drawCount > 0);
  assert.equal(next.state.physical.appliedEvents[command.gameId], 1);
  assert.equal(next.state.restControl.appliedEvents[command.gameId], 1);
  assert.equal(
    Object.values(next.state.restControl.appearances).find(
      (r) => r.gameId === command.gameId && r.playerId === pitch.pitcherId,
    )!.pitches,
    1,
  );
  assert.equal(
    next.state.registration.gameRosters[command.gameId]!.away.participants.find(
      (p) => p.playerId === reserve,
    )!.appeared,
    false,
  );
  assert.equal(next.state.currentDate, started.currentDate);
  assert.equal(next.state.dayPlan.cursor, started.state.dayPlan.cursor);
  assert.deepEqual(started, before);
  validateTradeSavedState(next);
});

test('開始と進行の同一再送は履歴を返し、別入力・古い版・別世界を拒否する', () => {
  const f = gameFixture(),
    begin = beginCommand(f.initial),
    started = applied(f.initial, begin);
  const command = advanceCommand(started),
    next = applied(started, command),
    before = structuredClone(next);
  assert.equal(applyTradeGameCommand(next, begin).status, 'replayed');
  assert.equal(applyTradeGameCommand(next, command).status, 'replayed');
  assert.throws(() => applyTradeGameCommand(next, { ...command, eventCount: 2 }), /同じ試合指示ID/);
  assert.throws(
    () => applyTradeGameCommand(next, { ...command, commandId: 'new-stale' }),
    /古い状態/,
  );
  assert.throws(() => applyTradeGameCommand(next, { ...command, worldId: 'other' }), /別プレイ/);
  assert.deepEqual(next, before);
});

test('移籍適用後の試合開始は獲得した選手の現在所属・個人状態を使う', async () => {
  const f = gameFixture();
  const result = await commitAcceptedTrade(
    f.command,
    createTradeApplicationPort(memoryStorage(f.initial).storage),
  );
  assert.equal(result.status, 'committed');
  if (result.status !== 'committed') return;
  const begun = applied(result.snapshot, beginCommand(result.snapshot));
  const incoming = f.request.moves[1]!;
  const game = Object.values(begun.state.games)[0]!;
  assert.ok(
    game.fixture.clubs
      .find((c) => c.clubId === incoming.toClubId)!
      .playerIds.includes(incoming.playerId),
  );
  assert.deepEqual(begun.state.physical, result.snapshot.state.physical);
});

test('明示した手動保存後の再開は同じRNGから次球を生成し、再送を二重適用しない', async () => {
  const f = gameFixture(),
    memory = memoryStorage(f.initial),
    session = await TradeGameSession.open(memory.storage);
  const begin = beginCommand(f.initial);
  session.execute(begin);
  const advance = advanceCommand(session.read().snapshot);
  session.execute(advance);
  const expectedBefore = session.read().snapshot;
  assert.equal(await session.saveManual(), 'saved');
  assert.equal(memory.writes(), 1);
  assert.equal(await session.saveManual(), 'unchanged');
  const reopened = await TradeGameSession.open(memory.storage);
  assert.equal(reopened.execute(advance).status, 'replayed');
  const stored = reopened.read().snapshot;
  assert.equal(stored.storageRevision, expectedBefore.storageRevision + 1);
  assert.deepEqual(stored.state, expectedBefore.state);
  const command = advanceCommand(stored, 'after-reopen');
  const expected = applied(expectedBefore, {
    ...command,
    expectedStateRevision: expectedBefore.stateRevision,
  });
  reopened.execute(command);
  assert.deepEqual(
    reopened.read().snapshot.state.games[begin.gameId],
    expected.state.games[begin.gameId],
  );
});

test('候補v2の手動保存は試合履歴を復元し、候補v1には項目を追加しない', async () => {
  const f = gameFixture(),
    begun = applied(f.initial, beginCommand(f.initial));
  const old = await encodeTradeSnapshot(f.initial, null);
  assert.equal(old.snapshot.versions.saveFormatVersion, 'trade-application-snapshot-v1');
  assert.ok(!Object.hasOwn(await decodeTradeSnapshot(old.snapshot, old.blocks), 'gameReceipts'));
  const encoded = await encodeTradeSnapshot(begun, null, 'manual');
  assert.equal(encoded.snapshot.versions.saveFormatVersion, 'trade-application-snapshot-v2');
  assert.equal(encoded.snapshot.saveKind, 'manual');
  assert.deepEqual(await decodeTradeSnapshot(encoded.snapshot, encoded.blocks), begun);
});

test('不正イベント区間・異なる現在値の保存案は指示再計算で止める', async () => {
  const f = gameFixture(),
    begun = applied(f.initial, beginCommand(f.initial));
  const candidate = structuredClone(begun);
  candidate.storageRevision++;
  assert.equal(await validateTradeSaveTransition(f.initial, candidate), 'gameManual');
  const broken = structuredClone(candidate);
  broken.gameReceipts![0]!.nextEventSeq = 3;
  assert.throws(() => validateTradeSavedState(broken), /開始指示/);
  const id = Object.keys(candidate.state.physical.players)[0]!;
  candidate.state.physical.players[id]!.energyMilli = 1;
  await assert.rejects(validateTradeSaveTransition(f.initial, candidate), /再計算/);
});

test('日次cursor以外・開始済み・古いイベント番号・不正件数を進めない', () => {
  const f = gameFixture(),
    begin = beginCommand(f.initial),
    begun = applied(f.initial, begin);
  assert.throws(
    () =>
      applyTradeGameCommand(begun, {
        ...begin,
        commandId: 'second-begin',
        expectedStateRevision: begun.stateRevision,
      }),
    /開始済み/,
  );
  const advance = advanceCommand(begun);
  assert.throws(
    () => applyTradeGameCommand(begun, { ...advance, expectedNextEventSeq: 2 }),
    /古いイベント/,
  );
  assert.throws(() => applyTradeGameCommand(begun, { ...advance, eventCount: 26 }), /進行イベント/);
  const other = f.initial.state.dayPlan.gameIds[1]!;
  assert.throws(() => applyTradeGameCommand(f.initial, { ...begin, gameId: other }), /次の試合/);
});

test('保存中は指示と再読込を止め、成功後だけ保存世代を公開する', async () => {
  const f = gameFixture(),
    memory = memoryStorage(f.initial);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const session = await TradeGameSession.open({
    read: () => memory.storage.read(),
    async commit(e, c) {
      await gate;
      await memory.storage.commit(e, c);
    },
  });
  session.execute(beginCommand(f.initial));
  const save = session.saveManual();
  assert.equal(session.read().saving, true);
  assert.throws(() => session.execute(advanceCommand(session.read().snapshot)), /保存中/);
  await assert.rejects(session.reload(), /保存中/);
  release();
  await save;
  assert.equal(session.read().snapshot.storageRevision, f.initial.storageRevision + 1);
});

test('保存後の通信失敗でも自動再試行せず、永続履歴を再読込してから再送を照合する', async () => {
  const f = gameFixture(),
    memory = memoryStorage(f.initial);
  const session = await TradeGameSession.open({
    read: () => memory.storage.read(),
    async commit(e, c) {
      await memory.storage.commit(e, c);
      throw new Error('after-write');
    },
  });
  const command = beginCommand(f.initial);
  session.execute(command);
  await assert.rejects(session.saveManual(), /after-write/);
  assert.equal(session.read().reloadRequired, true);
  assert.throws(() => session.execute(command), /成否不明/);
  await session.reload();
  assert.equal(session.execute(command).status, 'replayed');
  assert.equal(memory.writes(), 1);
});

test('保存前64指示の上限では状態を進めず、手動保存後に継続する', async () => {
  const f = gameFixture(),
    memory = memoryStorage(f.initial),
    session = await TradeGameSession.open(memory.storage);
  for (let i = 0; i < MAX_GAME_COMMANDS_PER_SAVE; i++) {
    const saved = session.read().snapshot,
      gameId = saved.state.dayPlan.gameIds[saved.state.dayPlan.cursor]!;
    session.execute(
      saved.state.games[gameId]
        ? advanceCommand(saved, 'limit-' + i)
        : beginCommand(saved, 'limit-' + i),
    );
  }
  const before = session.read();
  const id = before.snapshot.state.dayPlan.gameIds[before.snapshot.state.dayPlan.cursor]!;
  const command = before.snapshot.state.games[id]
    ? advanceCommand(before.snapshot, 'over-limit')
    : beginCommand(before.snapshot, 'over-limit');
  assert.throws(() => session.execute(command), /手動保存/);
  assert.deepEqual(session.read(), before);
  await session.saveManual();
  session.execute(command);
  assert.equal(session.read().pendingCommands, 1);
});

test('通常終了時だけ成績・寄与・ローテ・cursorを一度更新し、日付は進めない', () => {
  const f = gameFixture(),
    begin = beginCommand(f.initial);
  let saved = applied(f.initial, begin),
    last = advanceCommand(saved, 'finish-0', 25);
  for (let i = 0; i < 400; i++) {
    last = advanceCommand(saved, 'finish-' + i, 25);
    saved = applied(saved, last);
    if (saved.state.games[begin.gameId]!.state.phase === 'gameComplete') break;
    assert.notEqual(saved.state.games[begin.gameId]!.state.phase, 'aborted');
  }
  assert.equal(saved.state.games[begin.gameId]!.state.phase, 'gameComplete');
  assert.ok(saved.state.contributions[begin.gameId]);
  assert.ok(saved.state.statApplicationMarkers[begin.gameId]);
  const scheduled = saved.state.initialDefinitions.schedule.find((g) => g.gameId === begin.gameId)!;
  for (const squadId of [scheduled.awaySquadId, scheduled.homeSquadId]) {
    const prior = f.initial.state.management.pitcherUsagePlans[squadId]!;
    assert.equal(
      saved.state.management.pitcherUsagePlans[squadId]!.nextSlotNo,
      (prior.nextSlotNo! % prior.rotationSlots.length) + 1,
    );
    assert.equal(
      saved.state.stats.teams.find((r) => r.squadId === squadId)!.games,
      f.initial.state.stats.teams.find((r) => r.squadId === squadId)!.games + 1,
    );
  }
  assert.equal(saved.state.dayPlan.cursor, f.initial.state.dayPlan.cursor + 1);
  assert.equal(saved.state.currentDate, f.initial.currentDate);
  const before = structuredClone(saved);
  assert.equal(applyTradeGameCommand(saved, last).status, 'replayed');
  assert.deepEqual(saved, before);
  validateTradeSavedState(saved);
});
