import assert from 'node:assert/strict';
import test from 'node:test';
import { planTradeMemberships } from '../src/recruitment/trade-memberships.ts';
import type { TradeMembership, TradeMembershipPlan } from '../src/recruitment/trade-memberships.ts';

/** ゲームへ配布しない、所属履歴の試験専用データ。 */
function plan(): TradeMembershipPlan {
  const initial = (playerId: string, clubId: string): TradeMembership => ({
    membershipId: `test-initial-${playerId}`,
    playerId,
    clubId,
    from: { date: '2026-02-01', order: 0 },
    until: null,
    entryReason: 'initial',
  });
  return {
    transactionId: 'test-transaction',
    effectiveAt: { date: '2026-06-01', order: 3 },
    clubIds: ['test-a', 'test-b'],
    memberships: [
      initial('test-player-1', 'test-a'),
      initial('test-player-2', 'test-b'),
      initial('test-player-3', 'test-a'),
    ],
    moves: [
      { playerId: 'test-player-1', fromClubId: 'test-a', toClubId: 'test-b' },
      { playerId: 'test-player-2', fromClubId: 'test-b', toClubId: 'test-a' },
    ],
  };
}

test('複数選手の所属を一括で計画し、旧所属と関係しない選手を保持する', () => {
  const input = plan();
  const original = structuredClone(input);
  const result = planTradeMemberships(input);
  assert.deepEqual(input, original);
  assert.equal(result.memberships.length, 5);
  assert.deepEqual(result.memberships[0]!.until, input.effectiveAt);
  assert.equal(result.memberships[0]!.clubId, 'test-a');
  assert.strictEqual(result.memberships[2], input.memberships[2]);
  assert.deepEqual(
    result.memberships.filter((m) => m.until === null).map((m) => [m.playerId, m.clubId]),
    [
      ['test-player-3', 'test-a'],
      ['test-player-1', 'test-b'],
      ['test-player-2', 'test-a'],
    ],
  );
  assert.equal(result.playerMoves.length, 2);
  assert.throws(() => planTradeMemberships({ ...input, memberships: result.memberships }));
});

test('選手重複・所属違い・未登録球団・開始以前の移籍で部分適用しない', () => {
  const input = plan();
  const original = structuredClone(input);
  assert.throws(() =>
    planTradeMemberships({ ...input, moves: [input.moves[0]!, input.moves[0]!] }),
  );
  assert.throws(() =>
    planTradeMemberships({ ...input, moves: [{ ...input.moves[0]!, fromClubId: 'test-b' }] }),
  );
  assert.throws(() =>
    planTradeMemberships({ ...input, moves: [{ ...input.moves[0]!, toClubId: 'missing' }] }),
  );
  assert.throws(() =>
    planTradeMemberships({ ...input, effectiveAt: { date: '2026-01-01', order: 0 } }),
  );
  assert.deepEqual(input, original);
});

test('初期所属からの再移籍でも履歴の期間を重ねず、選手IDを維持する', () => {
  const input = plan();
  const first = planTradeMemberships(input);
  const next = planTradeMemberships({
    ...input,
    transactionId: 'test-next',
    effectiveAt: { date: '2026-07-01', order: 1 },
    memberships: first.memberships,
    moves: [{ playerId: 'test-player-1', fromClubId: 'test-b', toClubId: 'test-a' }],
  });
  const history = next.memberships.filter((m) => m.playerId === 'test-player-1');
  assert.equal(history.length, 3);
  assert.deepEqual(
    history.map((m) => m.clubId),
    ['test-a', 'test-b', 'test-a'],
  );
  assert.deepEqual(history[0]!.until, history[1]!.from);
  assert.deepEqual(history[1]!.until, history[2]!.from);
});

test('既存の所属期間が重複した記録から移籍案を作らない', () => {
  const input = plan();
  assert.throws(() =>
    planTradeMemberships({
      ...input,
      memberships: [
        ...input.memberships,
        { ...input.memberships[0]!, membershipId: 'test-overlap' },
      ],
    }),
  );
});
