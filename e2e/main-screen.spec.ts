import { test, expect } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`本画面：表示操作・工事中・同一世界の進行と保存 (${width}px)`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const original = Worker.prototype.postMessage;
      Reflect.set(window, 'worldCommands', 0);
      Reflect.set(window, 'worldQueries', 0);
      const OriginalWorker = Worker;
      const worldWorkers = new WeakSet<Worker>();
      Reflect.set(
        window,
        'Worker',
        class extends OriginalWorker {
          constructor(url: string | URL, options?: WorkerOptions) {
            super(url, options);
            if (url.toString().includes('world-worker')) worldWorkers.add(this);
          }
        },
      );
      Worker.prototype.postMessage = function (message: unknown, options?: unknown) {
        if (message && typeof message === 'object') {
          if ('localWorldId' in message)
            Reflect.set(window, 'worldCommands', Reflect.get(window, 'worldCommands') + 1);
          if (worldWorkers.has(this) && 'kind' in message && message.kind === 'query')
            Reflect.set(window, 'worldQueries', Reflect.get(window, 'worldQueries') + 1);
        }
        original.call(this, message, options as StructuredSerializeOptions);
      };
    });
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
    const date = page.getByTestId('main-date');
    await expect(date).toHaveAttribute('datetime', '2026-09-24');
    await expect(nav.getByRole('button')).toHaveCount(6);
    const queryCount = await page.evaluate(() => Reflect.get(window, 'worldQueries'));
    await page.screenshot({ path: `.tmp/main-screen-qa/home-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: '球団収支のカード', exact: true }).click();
    await expect(page.getByRole('button', { name: /収支サマリー\s*工事中/ })).toBeDisabled();
    await page.getByRole('button', { name: '次の情報カード', exact: true }).click();
    await expect(page.getByRole('region', { name: '球団情報カード' })).toContainText(
      '安打ランキング',
    );
    await nav.getByRole('button', { name: '編成', exact: true }).click();
    await expect(page.getByRole('region', { name: '編成の編集', exact: true })).toBeVisible();
    await nav.getByRole('button', { name: 'チーム', exact: true }).click();
    await expect(
      page.getByRole('table', { name: '選手プロフィール一覧' }).locator('tbody tr'),
    ).toHaveCount(30);
    await expect(page.getByRole('button', { name: /育成・練習\s*工事中/ })).toBeDisabled();
    await nav.getByRole('button', { name: '日程', exact: true }).click();
    await expect(page.getByRole('region', { name: '月別カレンダー' })).toBeVisible();
    await nav.getByRole('button', { name: 'ホーム', exact: true }).click();
    expect(await page.evaluate(() => Reflect.get(window, 'worldCommands'))).toBe(0);
    await page.getByRole('button', { name: /^今日の試合へ/ }).click();
    expect(await page.evaluate(() => Reflect.get(window, 'worldCommands'))).toBe(0);
    await page.getByRole('button', { name: '1日を自動進行', exact: true }).click();
    await nav.getByRole('button', { name: 'ホーム', exact: true }).click();
    await expect(page.getByRole('button', { name: '進行を一時停止', exact: true })).toBeVisible();
    await expect(date).toHaveAttribute('datetime', '2026-09-25', { timeout: 45000 });
    await expect(page.getByRole('button', { name: '進行を一時停止', exact: true })).toHaveCount(0);
    await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1');
    await nav.getByRole('button', { name: '成績', exact: true }).click();
    await page.getByRole('button', { name: '個人成績', exact: true }).click();
    await expect(page.getByRole('table', { name: '打撃ランキング' })).toBeVisible();
    await expect(nav).toBeInViewport();
    await page.screenshot({ path: `.tmp/main-screen-qa/stats-${width}.png`, fullPage: true });
    await page
      .getByRole('table', { name: '打撃ランキング' })
      .locator('thead')
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: `.tmp/main-screen-qa/stats-detail-${width}.png` });
    await nav.getByRole('button', { name: 'システム', exact: true }).click();
    await page.getByRole('button', { name: '世界を手動保存', exact: true }).click();
    await expect(
      page.getByRole('button', { name: '手動保存を読み込む', exact: true }),
    ).toBeEnabled();
    await page.getByRole('button', { name: '手動保存を読み込む', exact: true }).click();
    await expect(page.getByRole('button', { name: '世界を手動保存', exact: true })).toBeEnabled({
      timeout: 30000,
    });
    await expect(date).toHaveAttribute('datetime', '2026-09-25');
    await page.getByRole('button', { name: 'シミュレーション開発ツール ↗', exact: true }).click();
    await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
    await expect(page.getByTestId('world-date')).toHaveText('2026-09-25');
    await page.getByRole('button', { name: '本画面へ戻る', exact: true }).click();
    await expect(date).toHaveAttribute('datetime', '2026-09-25', { timeout: 30000 });
    expect(await page.evaluate(() => Reflect.get(window, 'worldQueries'))).toBe(queryCount);
    await nav.getByRole('button', { name: 'ホーム', exact: true }).click();
    await page.reload();
    await expect(page.getByRole('button', { name: 'セーブから再開 →', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'セーブから再開 →', exact: true }).click();
    await page.getByRole('button', { name: '手動保存を読み込む', exact: true }).click();
    await expect(date).toHaveAttribute('datetime', '2026-09-25', { timeout: 30000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  });
}
