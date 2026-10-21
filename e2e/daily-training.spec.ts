import { test, expect, type Page } from '@playwright/test';
import type { WorldView } from '../src/world/controller.ts';
import { growthComparison } from '../src/world/growth-view.ts';
import { growthAbilityKey } from '../src/world/growth-basis.ts';
import { commonTrainingRef } from '../src/world/training.ts';

test.setTimeout(150000);
async function observe(page: Page, legacy = false) {
  await page.addInitScript((legacy) => {
    const NativeWorker = Worker;
    Reflect.set(window, 'growthCommands', []);
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes('world-worker'))
          this.addEventListener('message', (event) => {
            if (!event.data?.view) return;
            // 旧版の表示だけを投影。旧保存の実際の復元はNodeで確認する。
            if (legacy) {
              event.data.view.growth = null;
              event.data.view.definitions.version = 'world-definitions-v20';
              event.data.view.modelVersion = 'world-prototype-v15';
            }
            Reflect.set(window, 'growthView', event.data.view);
          });
      }
      override postMessage(message: any, options?: Transferable[] | StructuredSerializeOptions) {
        if (message?.localWorldId)
          Reflect.get(window, 'growthCommands').push(structuredClone(message));
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
  }, legacy);
  await page.goto('/');
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24', {
    timeout: 30000,
  });
}
const read = (page: Page) =>
  page.evaluate(() => Reflect.get(window, 'growthView')) as Promise<WorldView>;
const count = (page: Page) =>
  page.evaluate(() => Reflect.get(window, 'growthCommands').length) as Promise<number>;
const menu = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'メインメニュー', exact: true })
    .getByRole('button', { name, exact: true })
    .click();
async function training(page: Page) {
  await menu(page, 'チーム');
  await page
    .getByRole('navigation', { name: 'サブメニュー', exact: true })
    .getByRole('button', { name: '育成・練習', exact: true })
    .click();
}

for (const width of [1280, 390, 320])
  test(`通常練習：日次の実績・現在能力・表示不変と保存復帰 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await observe(page);
    await training(page);
    await expect(page.getByRole('region', { name: '成長履歴', exact: true })).toContainText(
      'まだ日次の練習実績がありません',
    );
    expect(await count(page)).toBe(0);
    await menu(page, 'ホーム');
    await page.getByRole('button', { name: /^今日の試合へ/ }).click();
    await page.getByRole('button', { name: '1日を自動進行', exact: true }).click();
    await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-25', {
      timeout: 60000,
    });
    const after = await read(page);
    expect(after.growth!.dates).toEqual(['2026-09-24']);
    expect(after.growth!.latest!.outcomes).toHaveLength(120);
    const g = after.growth!;
    const player = after.definitions.squads[0]!.players.find((p) =>
      Object.keys(g.current[p.playerId]!).some(
        (k) => g.current[p.playerId]![k] !== g.periods.season.start[p.playerId]![k],
      ),
    )!;
    expect(player).toBeTruthy();
    const id = player.playerId;
    const name = `${player.familyName} ${player.givenName}`;
    await training(page);
    const panel = page.getByRole('region', { name: '育成・練習設定', exact: true });
    await panel.getByRole('button', { name, exact: true }).click();
    const growth = panel.getByRole('region', { name: '成長履歴', exact: true });
    const comparison = growthComparison(
      after.definitions,
      id,
      g.periods.season.start[id]!,
      g.current[id]!,
    );
    const totals = growth.getByRole('definition');
    const signed = (v: number) => (v > 0 ? `+${v}` : String(v));
    await expect(totals).toHaveText([
      signed(comparison.increase),
      String(comparison.decrease),
      signed(comparison.net),
    ]);
    const beforeCommands = await count(page);
    await growth.getByRole('combobox', { name: '集計期間', exact: true }).selectOption('lastDay');
    await growth.getByText(/^能力別の変化（/).click();
    const changes = growth.getByRole('table', { name: '能力別の成長', exact: true });
    await expect(changes.locator('tbody tr')).toHaveCount(
      comparison.rows.filter((r) => r.beforeValue !== r.afterValue).length,
    );
    await growth.getByText(/^直近の練習結果（/).click();
    await expect(growth).toContainText('2026-09-24');
    await expect(growth).toContainText('体力消費');
    await expect(growth.getByRole('img')).toHaveAccessibleName(/日別の能力変化/);
    await growth.scrollIntoViewIfNeeded();
    await growth.screenshot({ path: `.tmp/growth-qa/history-${width}.png` });
    expect(await count(page)).toBe(beforeCommands);
    expect(await read(page)).toEqual(after);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await panel.getByRole('button', { name: '選手詳細を開く', exact: true }).click();
    const detail = page.getByRole('dialog');
    const key = growthAbilityKey(commonTrainingRef('batting.contactVsRight'));
    await expect(detail.getByRole('meter', { name: '対右ミート', exact: true })).toHaveAttribute(
      'value',
      String(g.current[id]![key]! / 1000),
    );
    await detail.getByRole('button', { name: '状態・成長', exact: true }).click();
    await expect(
      detail.getByRole('region', { name: '成長履歴', exact: true }).getByRole('definition'),
    ).toHaveText([
      signed(comparison.increase),
      String(comparison.decrease),
      signed(comparison.net),
    ]);
    await detail.screenshot({ path: `.tmp/growth-qa/detail-${width}.png` });
    await page.keyboard.press('Escape');
    expect(await count(page)).toBe(beforeCommands);
    if (width === 1280) {
      await menu(page, 'システム');
      await page.getByRole('button', { name: '世界を手動保存', exact: true }).click();
      await expect(
        page.getByRole('button', { name: '手動保存を読み込む', exact: true }),
      ).toBeEnabled({ timeout: 30000 });
      await page.reload();
      await page.getByRole('button', { name: 'セーブから再開 →', exact: true }).click();
      await page.getByRole('button', { name: '手動保存を読み込む', exact: true }).click();
      await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-25', {
        timeout: 30000,
      });
      expect((await read(page)).growth).toEqual(g);
      await training(page);
      await panel.getByRole('button', { name, exact: true }).click();
      await expect(growth).toContainText('2026-09-24');
    }
    expect(errors).toEqual([]);
  });

test('通常練習：旧v20相当の表示では成長履歴や自動調整を有効扱いしない', async ({ page }) => {
  await observe(page, true);
  await training(page);
  const panel = page.getByRole('region', { name: '育成・練習設定', exact: true });
  await expect(panel).toContainText('この保存は練習の指定・保存まで');
  await expect(panel).toContainText('日次成長の記録がありません');
  await expect(
    panel.getByRole('combobox', { name: '疲労による自動調整', exact: true }),
  ).toContainText('判定準備中');
  expect(await count(page)).toBe(0);
});
