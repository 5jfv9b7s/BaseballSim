import assert from 'node:assert/strict';
import test from 'node:test';
import { planTradeChangeSet } from '../src/recruitment/trade-change-set.ts';
import { changeSetFixture } from './helpers/trade-roster-fixture.ts';

test('所属・登録・編成・給与・金銭の両案を全検査後にだけ返す', () => {
  const input = changeSetFixture();
  const before = structuredClone(input);
  const result = planTradeChangeSet(input);
  assert.equal(result.status, 'ready');
  assert.deepEqual(input, before);
  if (result.status !== 'ready') return;
  assert.equal(result.roster.status, 'ready');
  assert.equal(result.finance.status, 'ready');
  assert.equal(result.roster.transactionId, result.finance.transactionId);
  assert.equal(result.roster.playerMoves.length, 2);
  assert.equal(result.finance.salaryReallocations.length, 2);
});

test('会計審査に失敗した場合も、適用用の所属・登録案を外へ返さない', () => {
  const input = changeSetFixture();
  input.finance.budgets[0].openingBalance!.balanceYen = 0;
  const before = structuredClone(input);
  const result = planTradeChangeSet(input);
  assert.equal(result.status, 'blocked');
  if (result.status === 'blocked') assert.equal(result.stage, 'finance');
  assert.equal('roster' in result, false);
  assert.equal('finance' in result, false);
  assert.deepEqual(input, before);
});

test('編成の欠員が残る場合は会計案も適用用データとして返さない', () => {
  const input = changeSetFixture();
  input.roster.squadReplacements = [];
  const before = structuredClone(input);
  const result = planTradeChangeSet(input);
  assert.equal(result.status, 'blocked');
  if (result.status === 'blocked') assert.equal(result.stage, 'roster');
  assert.equal('finance' in result, false);
  assert.deepEqual(input, before);
});
