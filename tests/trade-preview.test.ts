import test from 'node:test';
import assert from 'node:assert/strict';
import { createPitchLearningWorld, createWorld } from '../src/world/engine.ts';
import { growthView } from '../src/world/growth-view.ts';
import { growthAbilityKey } from '../src/world/growth-basis.ts';
import { commonTrainingRef } from '../src/world/training.ts';
import {
  emptyTradeDraft,
  previewTrade,
  proposalMoney,
  tradeAbilities,
} from '../src/ui/trade/trade-preview.ts';

function example() {
  const world = createPitchLearningWorld();
  const view = {
    definitions: world.definitions,
    management: world.management,
    growth: structuredClone(growthView(world)),
  };
  const own = view.definitions.squads.find((s) => s.squadId === view.management.controlledSquadId)!;
  const partner = view.definitions.squads.find((s) => s.squadId !== own.squadId)!;
  const draft = {
    ...emptyTradeDraft(),
    partnerId: partner.squadId,
    outgoingIds: own.players.slice(0, 2).map((p) => p.playerId),
    incomingIds: [partner.players[0]!.playerId],
  };
  return { view, own, partner, draft };
}

test('トレード試算：複数選手の所属人数を両球団で保存し、主位置の合計も一人一回で一致する', () => {
  const { view, own, partner, draft } = example();
  const before = JSON.stringify(view);
  const result = previewTrade(view, draft);
  assert.deepEqual(result.errors, []);
  assert.equal(result.ownCounts!.before, own.players.length);
  assert.equal(result.ownCounts!.after, own.players.length - 1);
  assert.equal(result.partnerCounts!.after, partner.players.length + 1);
  for (const counts of [result.ownCounts!, result.partnerCounts!]) {
    assert.equal(
      Object.values(counts.positionsBefore).reduce((a, b) => a + b, 0),
      counts.before,
    );
    assert.equal(
      Object.values(counts.positionsAfter).reduce((a, b) => a + b, 0),
      counts.after,
    );
  }
  assert.equal(
    result.ownCounts!.after + result.partnerCounts!.after,
    own.players.length + partner.players.length,
  );
  assert.equal(JSON.stringify(view), before);
});

test('トレード試算：重複・対象外の選手・自球団相手を拒否し、壊れた入力で人数を作らない', () => {
  const { view, own, partner, draft } = example();
  const cases = [
    { ...draft, outgoingIds: [draft.outgoingIds[0]!, draft.outgoingIds[0]!] },
    { ...draft, incomingIds: [own.players[0]!.playerId] },
    { ...draft, outgoingIds: [partner.players[0]!.playerId] },
    { ...draft, incomingIds: ['missing-player'] },
    { ...draft, partnerId: own.squadId },
  ];
  for (const bad of cases) {
    const result = previewTrade(view, bad);
    assert(result.errors.length > 0);
    assert.equal(result.ownCounts, null);
    assert.equal(result.partnerCounts, null);
  }
});

test('トレード入力：金銭のみと選手交換を区別し、円の不正入力や空の提案を成功扱いしない', () => {
  const { view, draft, own } = example();
  assert.equal(proposalMoney('０１２３'), 123);
  assert.equal(proposalMoney('0'), 0);
  for (const text of ['', '-1', '1.5', '1e3', 'NaN', '1,000', '9007199254740992'])
    assert.equal(proposalMoney(text), null);
  const moneyOnly = previewTrade(view, { ...draft, outgoingIds: [], moneyText: '1000000' });
  assert.deepEqual(moneyOnly.errors, []);
  assert.equal(moneyOnly.ownCounts!.after, own.players.length + 1);
  assert(
    previewTrade(view, { ...draft, outgoingIds: [] }).errors.some((e) => e.includes('出す選手')),
  );
  assert(
    previewTrade(view, { ...draft, incomingIds: [] }).errors.some((e) =>
      e.includes('獲得する選手'),
    ),
  );
  assert(
    previewTrade(view, { ...draft, moneyText: '-1' }).errors.some((e) => e.includes('提示金銭')),
  );
});

test('トレード比較：成長後の現在値と正当な0を使い、初期能力を変更しない', () => {
  const { view, own } = example();
  const id = own.players[0]!.playerId;
  const before = JSON.stringify(view.definitions);
  const key = growthAbilityKey(commonTrainingRef('batting.contactVsRight'));
  view.growth!.current[id]![key] = 0;
  assert.equal(tradeAbilities(view, id)['batting.contactVsRight'], 0);
  assert.equal(JSON.stringify(view.definitions), before);
});

test('トレード旧保存：プロフィールなしを主位置から推測せず、未記録の能力を補完しない', () => {
  const { view } = example();
  const legacy = createWorld();
  const own = legacy.definitions.squads[0]!;
  const partner = legacy.definitions.squads[1]!;
  const oldView = {
    ...view,
    definitions: legacy.definitions,
    growth: null,
    management: { ...view.management, controlledSquadId: own.squadId },
  };
  const result = previewTrade(oldView, {
    ...emptyTradeDraft(),
    partnerId: partner.squadId,
    outgoingIds: [own.players[0]!.playerId],
    incomingIds: [partner.players[0]!.playerId],
  });
  assert.equal(result.ownCounts!.positionsAfter['記録なし'], own.players.length);
  assert.equal(result.ownCounts!.positionsAfter.P, 0);
  assert.equal(tradeAbilities(oldView, own.players[0]!.playerId)['batting.bunting'], undefined);
  assert.equal(previewTrade({ ...oldView, management: null }, emptyTradeDraft()).ownCounts, null);
});
