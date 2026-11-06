import assert from 'node:assert/strict';
import test from 'node:test';
import { applyWorldTrade } from '../src/world/trade-application.ts';
import { tradeSquadRoster } from '../src/world/trade-squad-roster.ts';
import { prepareTradeMatch, type TradeMatchRequest } from '../src/world/trade-match.ts';
import { growthAbilityKey } from '../src/world/growth-basis.ts';
import { stepRecord } from '../src/game/engine.ts';
import type { TeamSide } from '../src/game/types.ts';
import { performanceFixture } from '../src/game/performance.ts';
import { applicationFixture } from './helpers/trade-application-fixture.ts';

function fixture(kind: 'batter' | 'pitcher' = 'batter', category: 'first' | 'farm' = 'first') {
  const source = applicationFixture(kind, category);
  const applied = applyWorldTrade(source.world, source.request);
  assert.equal(applied.status, 'ready');
  if (applied.status !== 'ready') throw new Error('試合準備用の移籍候補なし');
  const world = applied.world;
  // 各ケースで休養方針を明示する。通常の初期方針・自動判断への依存を避ける。
  for (const policy of Object.values(world.restControl.teamPolicies))
    policy.teamRestPolicy.action = 'none';
  for (const policy of Object.values(world.fielderRest.teamPolicies)) policy.rules.enabled = false;
  const squads = [source.ownSquadId, source.partnerSquadId];
  const scheduled = world.initialDefinitions.schedule.find(
    (g) =>
      g.date === world.currentDate &&
      squads.includes(g.awaySquadId) &&
      squads.includes(g.homeSquadId),
  );
  assert.ok(scheduled, '対象の一二軍の当日日程が必要');
  const bench = (id: string) => {
    const roster = tradeSquadRoster(world, id);
    const starter = roster.pitchers.rotationSlots[roster.pitchers.nextSlotNo! - 1]!.playerId!;
    return [
      ...new Set([
        ...roster.lineup.map((s) => s.playerId),
        starter,
        ...roster.pitchers.reliefRoles.map((r) => r.playerId),
      ]),
    ];
  };
  const request: TradeMatchRequest = {
    gameId: scheduled.gameId,
    benchIds: {
      away: bench(scheduled.awaySquadId),
      home: bench(scheduled.homeSquadId),
    },
  };
  const ownSide: TeamSide = scheduled.awaySquadId === source.ownSquadId ? 'away' : 'home';
  return { ...source, tradeRequest: source.request, world, request, scheduled, ownSide };
}

const prepare = (f: ReturnType<typeof fixture>) => prepareTradeMatch(f.world, f.request);

function pendingPitch(f: ReturnType<typeof fixture>) {
  const id = f.request.benchIds[f.ownSide].find(
    (id) => f.world.playerFacts.find((p) => p.playerId === id)!.canPitch,
  )!;
  const catalog = f.world.initialDefinitions.squads.find((s) =>
    s.pitches.some((p) => p.playerId === id),
  )!;
  const original = catalog.pitches.find((p) => p.playerId === id)!;
  const pitch = structuredClone(original);
  pitch.pitchId = 'test-pending-' + original.pitchId;
  pitch.acquisitionProgressMilli = 90000;
  catalog.pitches.push(pitch);
  f.world.growth.state.acquisition[pitch.pitchId] = { progressMilli: 99999, acquiredOn: null };
  const values = f.world.growth.state.players[id]!.values;
  for (const code of ['control', 'repeatability'] as const)
    values[growthAbilityKey({ scope: 'pitch', pitchId: pitch.pitchId, code })] =
      original[code].valueMilli;
  return pitch;
}

test('移籍後の試合準備は決定的で世界・指示・個人RNGを変更しない', () => {
  const f = fixture(),
    before = structuredClone(f.world),
    request = structuredClone(f.request);
  const first = prepare(f),
    second = prepare(f);
  assert.deepEqual(first, second);
  assert.deepEqual(f.world, before);
  assert.deepEqual(f.request, request);
  assert.equal(first.modelVersion, 'trade-match-preparation-v1');
  assert.equal(first.game.state.simulationVersion, 'game-prototype-v11');
  assert.equal(first.game.state.rng.streamId, f.request.gameId + ':attempt:1');
  assert.equal(first.game.state.rng.drawCount, 0);
  assert.equal(first.game.events.length, 0);
  assert.ok(Object.values(first.rosters).every((r) => r.participants.every((p) => !p.appeared)));
});

test('移籍先の試合で成長後の基本能力と身体・調子を使い、恒久能力へ補正を書き戻さない', () => {
  const f = fixture(),
    id = f.tradeRequest.moves[1]!.playerId;
  const key = growthAbilityKey({ scope: 'batting', code: 'contactVsRight' });
  f.world.growth.state.players[id]!.values[key] = 1000;
  f.world.physical.players[id]!.energyMilli = 100000;
  f.world.physical.players[id]!.fatigueMilli = 0;
  f.world.condition.players[id]!.conditionMilli = 50000;
  const before = structuredClone(f.world);
  const result = prepare(f),
    game = result.game;
  assert.equal(
    game.fixture.players.find((p) => p.playerId === id)!.batting.contactVsRight.valueMilli,
    1000,
  );
  assert.ok(
    game.fixture.clubs
      .find((c) => c.clubId === f.tradeRequest.moves[1]!.toClubId)!
      .playerIds.includes(id),
  );
  assert.ok(
    !game.fixture.clubs
      .find((c) => c.clubId === f.tradeRequest.moves[1]!.fromClubId)!
      .playerIds.includes(id),
  );
  assert.deepEqual(game.performance!.players[id], {
    conditionMilli: 50000,
    energyMilli: 100000,
    fatigueMilli: 0,
  });
  performanceFixture(game);
  assert.deepEqual(f.world, before);
});

test('移籍した投手の不変pitchId・個人投球情報・成長後制球を試合へ渡す', () => {
  const f = fixture('pitcher'),
    id = f.tradeRequest.moves[1]!.playerId;
  const pitch = f.world.initialDefinitions.squads
    .flatMap((s) => s.pitches)
    .find((p) => p.playerId === id)!;
  f.world.growth.state.players[id]!.values[
    growthAbilityKey({ scope: 'pitch', pitchId: pitch.pitchId, code: 'control' })
  ] = 1234;
  const game = prepare(f).game;
  assert.ok(game.fixture.teams[f.ownSide].pitcherIds.includes(id));
  const current = game.fixture.pitches.find((p) => p.pitchId === pitch.pitchId)!;
  assert.equal(current.playerId, id);
  assert.equal(current.control.valueMilli, 1234);
  assert.deepEqual(current.velocity, pitch.velocity);
  assert.deepEqual(current.delivery, pitch.delivery);
});

test('二軍でも現在の登録・所属と同じ試合モデルを使う', () => {
  const f = fixture('batter', 'farm'),
    result = prepare(f);
  const roster = tradeSquadRoster(f.world, f.ownSquadId);
  assert.equal(roster.category, 'farm');
  assert.ok(
    result.game.fixture.teams[f.ownSide].lineup.some(
      (p) => p.playerId === f.tradeRequest.moves[1]!.playerId,
    ),
  );
  assert.equal(result.rosters[f.ownSide].squadId, f.ownSquadId);
  assert.equal(result.game.state.simulationVersion, 'game-prototype-v11');
});

test('99.999%の持ち球を使用可能へ丸めず、習得完了の翌日だけ100%を渡す', () => {
  const f = fixture('pitcher'),
    pitch = pendingPitch(f);
  assert.equal(
    prepare(f).game.fixture.pitches.find((p) => p.pitchId === pitch.pitchId)!
      .acquisitionProgressMilli,
    99999,
  );
  const progress = f.world.growth.state.acquisition[pitch.pitchId]!;
  progress.progressMilli = 100000;
  progress.acquiredOn = f.world.currentDate;
  assert.throws(() => prepare(f), /翌日/);
  progress.acquiredOn = new Date(Date.parse(f.world.currentDate) - 86400000)
    .toISOString()
    .slice(0, 10);
  assert.equal(
    prepare(f).game.fixture.pitches.find((p) => p.pitchId === pitch.pitchId)!
      .acquisitionProgressMilli,
    100000,
  );
});

test('未習得球の現在進度が欠けていれば初期値で補わない', () => {
  const f = fixture('pitcher'),
    pitch = pendingPitch(f);
  delete f.world.growth.state.acquisition[pitch.pitchId];
  assert.throws(() => prepare(f), /現在進度/);
});

test('旧球団での登板履歴から移籍後も直近球数と連投を判定する', () => {
  const f = fixture('pitcher'),
    id = f.tradeRequest.moves[1]!.playerId;
  const previousDate = new Date(Date.parse(f.world.currentDate) - 86400000)
    .toISOString()
    .slice(0, 10);
  f.world.restControl.appearances['test-before-transfer'] = {
    gameId: 'test-before-transfer',
    playerId: id,
    squadId: f.partnerSquadId,
    date: previousDate,
    pitches: 60,
    innings: [1, 2],
  };
  f.world.restControl.teamPolicies[f.ownSquadId]!.teamRestPolicy = {
    action: 'preferRest',
    recentDays: 7,
    recentPitches: 50,
    consecutiveDays: null,
    previousDayInnings: null,
    energyMilli: null,
    fatigueMilli: null,
  };
  const row = prepare(f).rosters[f.ownSide].restSnapshot!.decisions.find((d) => d.playerId === id)!;
  assert.equal(row.metrics.recentPitches, 60);
  assert.equal(row.metrics.consecutiveDays, 1);
  assert.equal(row.metrics.lastPitchedOn, previousDate);
  assert.equal(row.requested, 'preferRest');
  assert.ok(row.reasons.includes('直近投球数'));
});

test('野手休養は明示ベンチ内の控えを使い、理想編成・現在能力を変更しない', () => {
  const f = fixture(),
    roster = tradeSquadRoster(f.world, f.ownSquadId);
  const id = roster.lineup[0]!.playerId,
    reserve = roster.reserveBatterIds[0]!;
  assert.ok(reserve, '控え野手が必要');
  f.request.benchIds[f.ownSide].push(reserve);
  for (const playerId of roster.registeredPlayerIds)
    f.world.physical.players[playerId]!.energyMilli = 100000;
  f.world.physical.players[id]!.energyMilli = 0;
  f.world.fielderRest.teamPolicies[f.ownSquadId]!.rules = {
    enabled: true,
    energyMilli: 100,
    fatigueMilli: null,
  };
  const before = structuredClone(f.world),
    result = prepare(f);
  assert.equal(result.game.fixture.teams[f.ownSide].lineup[0]!.playerId, reserve);
  assert.equal(
    result.rosters[f.ownSide].fielderRestSnapshot!.decisions.find((d) => d.playerId === id)!
      .outcome,
    'resting',
  );
  assert.deepEqual(f.world, before);
});

test('保存済み当日打順・先発・ベンチ指定を優先して休養の例外を記録する', () => {
  const f = fixture('pitcher');
  const desired = structuredClone(f.world.management.idealLineups[f.ownSquadId]!);
  desired.battingOrder.reverse();
  desired.battingOrder.forEach((s, i) => (s.slotNo = i + 1));
  f.world.gameLineups[f.request.gameId] = desired;
  const id = f.request.benchIds[f.ownSide].find(
    (id) => f.world.playerFacts.find((p) => p.playerId === id)!.canPitch,
  )!;
  f.world.management.starterOverrides[f.request.gameId] = id;
  f.world.registration.benchOverrides[f.request.gameId] = [...f.request.benchIds[f.ownSide]];
  f.world.restControl.teamPolicies[f.ownSquadId]!.teamRestPolicy = {
    action: 'benchRest',
    recentDays: 7,
    recentPitches: null,
    consecutiveDays: null,
    previousDayInnings: null,
    energyMilli: 100000,
    fatigueMilli: null,
  };
  const result = prepare(f);
  assert.deepEqual(
    result.game.fixture.teams[f.ownSide].lineup.map((p) => p.playerId),
    desired.battingOrder.map((p) => p.playerId),
  );
  assert.equal(result.game.fixture.teams[f.ownSide].pitcherIds[0], id);
  assert.equal(
    result.rosters[f.ownSide].restSnapshot!.decisions.find((d) => d.playerId === id)!.exception,
    '当日の手動先発指定を優先',
  );
});

test('重複・所属外・保存済み指定と違うベンチを受け付けない', () => {
  const f = fixture(),
    bench = f.request.benchIds[f.ownSide],
    before = [...bench];
  bench.push(bench[0]!);
  assert.throws(() => prepare(f), /重複/);
  f.request.benchIds[f.ownSide] = [...before, 'unknown-player'];
  assert.throws(() => prepare(f), /ベンチ/);
  f.request.benchIds[f.ownSide] = before;
  f.world.registration.benchOverrides[f.request.gameId] = before.slice(1);
  assert.throws(() => prepare(f), /保存済み/);
});

test('日付・日次計画・開始済み試合が不正なら再準備しない', () => {
  const f = fixture(),
    initial = prepare(f);
  const saved = structuredClone(f.world);
  f.world.dayPlan.gameIds = [];
  assert.throws(() => prepare(f), /未処理/);
  f.world = structuredClone(saved);
  f.world.dayPlan.date = '2026-01-01';
  assert.throws(() => prepare(f), /当日/);
  f.world = structuredClone(saved);
  f.world.games[f.request.gameId] = initial.game;
  assert.throws(() => prepare(f), /開始済み/);
  assert.deepEqual(f.world.games[f.request.gameId], initial.game);
});

test('現在能力・身体・調子の欠損や古い基準日を0・初期値へ補完しない', () => {
  const f = fixture(),
    id = f.request.benchIds[f.ownSide][0]!,
    saved = structuredClone(f.world);
  const key = growthAbilityKey({ scope: 'batting', code: 'contactVsRight' });
  delete f.world.growth.state.players[id]!.values[key];
  assert.throws(() => prepare(f), /現在値/);
  f.world = structuredClone(saved);
  delete f.world.physical.players[id];
  assert.throws(() => prepare(f), /欠け/);
  f.world = structuredClone(saved);
  f.world.condition.players[id]!.lastUpdatedOn = '2026-01-01';
  assert.throws(() => prepare(f), /基準日/);
  f.world = structuredClone(saved);
  f.world.physical.players[id]!.fatigueMilli = 100001;
  assert.throws(() => prepare(f), /現在疲労/);
});

test('使用可能な持ち球のない登板候補では架空の球種を追加しない', () => {
  const f = fixture('pitcher'),
    id = f.tradeRequest.moves[1]!.playerId;
  for (const pitch of f.world.initialDefinitions.squads
    .flatMap((s) => s.pitches)
    .filter((p) => p.playerId === id)) {
    pitch.acquisitionProgressMilli = 0;
    f.world.growth.state.acquisition[pitch.pitchId] = { progressMilli: 0, acquiredOn: null };
  }
  assert.throws(() => prepare(f), /習得/);
});

test('準備した入力を共通の1球エンジンへ渡せ、世界・別の準備結果から分離する', () => {
  const f = fixture(),
    before = structuredClone(f.world),
    result = prepare(f),
    separate = prepare(f);
  stepRecord(result.game);
  assert.equal(result.game.events[0]!.gameId, f.request.gameId);
  assert.equal(result.game.events[0]!.kind, 'pitch');
  assert.equal(result.game.state.totalPitches, 1);
  assert.ok(result.game.state.rng.drawCount > 0);
  assert.equal(separate.game.events.length, 0);
  result.rosters[f.ownSide].playerIds.length = 0;
  assert.ok(separate.rosters[f.ownSide].playerIds.length > 0);
  assert.deepEqual(f.world, before);
});

// このファイルの試験はユーザー指定により追加のみ。今回の作業では実行しない。
