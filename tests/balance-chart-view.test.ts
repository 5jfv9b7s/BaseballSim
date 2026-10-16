import assert from 'node:assert/strict';
import test from 'node:test';
import { recentBalanceWindow } from '../src/ui/balance-chart-view.ts';
import type { BalanceSeries } from '../src/world/win-balance.ts';

function fixture(start: string, days: number): BalanceSeries[] {
  return [1, -1].map((sign, index) => ({
    squadId: `squad-${index}`,
    clubId: `club-${index}`,
    name: `表示検査用${index}`,
    points: Array.from({ length: days }, (_, day) => ({
      date: new Date(Date.parse(start + 'T00:00:00Z') + day * 86400000).toISOString().slice(0, 10),
      wins: sign > 0 ? 20 + day : 3,
      losses: sign < 0 ? 20 + day : 3,
      draws: 2,
      balance: sign * (17 + day),
    })),
  }));
}

test('貯金の表示範囲：月・年をまたいで最新30日を切り出し、当季累計と入力を保持', () => {
  const series = fixture('2026-12-10', 40);
  const before = structuredClone(series);
  const window = recentBalanceWindow(series);
  assert.equal(window.positions.length, 30);
  assert.equal(window.positions[0]!.date, '2026-12-20');
  assert.equal(window.positions.at(-1)!.date, '2027-01-18');
  assert.equal(window.positions[0]!.x, 90);
  assert.equal(window.positions.at(-1)!.x, 690);
  assert.equal(window.rows[0]!.points[0]!.balance, 27);
  assert.equal(window.rows[1]!.points.at(-1)!.balance, -56);
  assert.deepEqual(series, before);
});

test('貯金の表示範囲：閏日の月境界でも1日ずつ流れ、同じ日の座標が左へ移る', () => {
  const before = recentBalanceWindow(fixture('2028-02-01', 30));
  const after = recentBalanceWindow(fixture('2028-02-01', 31));
  assert.equal(before.positions.at(-1)!.date, '2028-03-01');
  assert.equal(after.positions[0]!.date, '2028-02-02');
  assert.equal(after.positions.at(-1)!.date, '2028-03-02');
  assert.equal(after.positions.at(-1)!.x, 690);
  assert.ok(after.positions.find((point) => point.date === '2028-03-01')!.x < 690);
  assert.equal(after.positions.filter((point) => point.date === '2028-02-29').length, 1);
  const steps = after.positions.slice(1).map((point, i) => point.x - after.positions[i]!.x);
  assert.ok(steps.every((step) => Math.abs(step - 600 / 29) < 1e-9));
});

test('貯金の表示範囲：0日・1日・30日未満を扱い、架空の日付や0点を補完しない', () => {
  assert.deepEqual(recentBalanceWindow([]), { rows: [], positions: [], ticks: [] });
  assert.equal(recentBalanceWindow(fixture('2026-09-24', 0)).positions.length, 0);
  const single = recentBalanceWindow(fixture('2026-09-24', 1));
  assert.deepEqual(single.positions, [{ date: '2026-09-24', x: 690, hitLeft: 90, hitWidth: 600 }]);
  assert.equal(single.ticks.length, 1);
  const short = recentBalanceWindow(fixture('2026-09-29', 3));
  assert.deepEqual(
    short.positions.map(({ date, x }) => [date, x]),
    [
      ['2026-09-29', 90],
      ['2026-09-30', 390],
      ['2026-10-01', 690],
    ],
  );
  assert.deepEqual(
    short.ticks.map((tick) => tick.date),
    ['2026-09-29', '2026-09-30', '2026-10-01'],
  );
});

test('貯金の表示操作：端の日も選べる連続した領域で、範囲外にはみ出さない', () => {
  for (const days of [1, 2, 3, 30, 40]) {
    const { positions } = recentBalanceWindow(fixture('2026-09-01', days));
    assert.equal(positions[0]!.hitLeft, 90);
    for (let i = 0; i < positions.length; i++) {
      const point = positions[i]!;
      assert.ok(point.hitWidth > 0);
      assert.ok(point.hitLeft <= point.x && point.x <= point.hitLeft + point.hitWidth);
      const next = positions[i + 1];
      assert.equal(point.hitLeft + point.hitWidth, next ? next.hitLeft : 690);
    }
  }
});
