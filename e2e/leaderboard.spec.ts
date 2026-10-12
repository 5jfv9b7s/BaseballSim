import { test, expect } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`個人成績：規定・ソート・球団・一二軍・確定後の復元 (${width}px)`, async ({ page }) => {
    test.setTimeout(150000);
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const original = Worker.prototype.postMessage;
      Reflect.set(window, 'leaderboardCommands', 0);
      Worker.prototype.postMessage = function (message: unknown, options?: unknown) {
        if (message && typeof message === 'object' && 'localWorldId' in message)
          Reflect.set(
            window,
            'leaderboardCommands',
            Reflect.get(window, 'leaderboardCommands') + 1,
          );
        original.call(this, message, options as StructuredSerializeOptions);
      };
    });
    await page.goto('/');
    await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
    const panel = page.getByRole('region', { name: '累計個人成績', exact: true });
    const scope = page.getByRole('combobox', { name: '表示する大会', exact: true });
    const date = page.getByTestId('world-date');
    await panel.getByText('打撃・投手・守備の累計を開く', { exact: true }).click();
    await expect(panel).toContainText('条件に合う成績がありません');
    await page.getByRole('button', { name: '1日を自動進行', exact: true }).click();
    await expect(date).toHaveText('2026-09-25', { timeout: 40000 });
    const table = panel.getByRole('table', { name: '打撃ランキング', exact: true });
    await expect(table).toBeVisible();
    await expect(panel).toContainText('2026-09-25現在・確定試合のみ');
    const commands = await page.evaluate(() => Reflect.get(window, 'leaderboardCommands'));
    const allCount = await table.locator('tbody tr').count();
    await panel.getByRole('combobox', { name: '率の対象', exact: true }).selectOption('qualified');
    expect(await table.locator('tbody tr').count()).toBeLessThanOrEqual(allCount);
    await expect(table).not.toContainText('未到達');
    await panel.getByRole('combobox', { name: '並べ替える指標', exact: true }).selectOption('hits');
    await expect(panel.getByRole('combobox', { name: '率の対象', exact: true })).toBeDisabled();
    expect(await table.locator('tbody tr').count()).toBe(allCount);
    const values = await table
      .locator('tbody tr')
      .evaluateAll((rows) => rows.map((row) => Number(row.children[6]!.textContent)));
    expect(values).toEqual([...values].sort((a, b) => b - a));
    await panel.getByRole('button', { name: '安打で並べ替え', exact: true }).click();
    await expect(
      table.getByRole('columnheader', { name: '安打で並べ替え', exact: true }),
    ).toHaveAttribute('aria-sort', 'ascending');
    const ascending = await table
      .locator('tbody tr')
      .evaluateAll((rows) => rows.map((row) => Number(row.children[6]!.textContent)));
    expect(ascending).toEqual([...ascending].sort((a, b) => a - b));
    const club = panel.getByRole('combobox', { name: '成績の球団', exact: true });
    const own = await club.locator('option').filter({ hasText: '担当球団' }).getAttribute('value');
    await club.selectOption(own!);
    expect(await table.locator('tbody tr').count()).toBeGreaterThan(0);
    expect(await table.locator('tbody tr:not([data-own-club="true"])').count()).toBe(0);
    await scope.selectOption('farmRegular');
    await expect(table).toContainText('二軍');
    await expect(table).toContainText('水野 翔');
    await expect(table).not.toContainText('汐見 航');
    await scope.selectOption('firstRegular');
    await expect(table).toContainText('汐見 航');
    await expect(table).not.toContainText('水野 翔');
    await panel.getByRole('button', { name: '投手', exact: true }).click();
    await expect(panel.getByRole('table', { name: '投手ランキング', exact: true })).toBeVisible();
    await expect(panel.getByRole('combobox', { name: '並び順', exact: true })).toHaveValue(
      'ascending',
    );
    await panel.getByRole('button', { name: '守備', exact: true }).click();
    await panel.getByRole('combobox', { name: '守備位置', exact: true }).selectOption('C');
    const fielding = panel.getByRole('table', { name: '守備ランキング', exact: true });
    await expect(fielding).toContainText('刺殺');
    const positions = await fielding
      .locator('tbody tr')
      .evaluateAll((rows) => rows.map((row) => row.children[2]!.textContent));
    expect(positions.length).toBeGreaterThan(0);
    expect(positions.every((position) => position === 'C')).toBe(true);
    expect(await page.evaluate(() => Reflect.get(window, 'leaderboardCommands'))).toBe(commands);
    await expect(date).toHaveText('2026-09-25');
    await panel.getByRole('button', { name: '打撃', exact: true }).click();
    await panel.getByRole('combobox', { name: '率の対象', exact: true }).selectOption('all');
    await panel.locator('.season-leaderboard').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/leaderboard-controls-${width}.png` });
    const scroll = panel.getByRole('region', { name: '成績表の横スクロール', exact: true });
    const cell = table.locator('tbody th').first();
    const before = await cell.boundingBox();
    await scroll.evaluate((element) => {
      element.scrollLeft = 500;
    });
    const after = await cell.boundingBox();
    expect(Math.abs(before!.x - after!.x)).toBeLessThanOrEqual(1);
    await table.locator('thead').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/leaderboard-table-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'シーズン終了まで進行', exact: true }).click();
    await expect(date).toHaveText('2026-09-28', { timeout: 70000 });
    await expect(panel).toContainText('今季確定（2026-09-27終了）');
    await club.selectOption('');
    const final = await table.innerText();
    await scope.selectOption('farmRegular');
    await expect(panel).toContainText('今季確定（2026-09-26終了）');
    const farmFinal = await table.innerText();
    await page.reload();
    await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
    await page.getByRole('button', { name: '自動保存を読み込む', exact: true }).click();
    await expect(date).toHaveText('2026-09-28', { timeout: 30000 });
    await panel.getByText('打撃・投手・守備の累計を開く', { exact: true }).click();
    await expect(panel).toContainText('今季確定（2026-09-27終了）');
    expect(await table.innerText()).toBe(final);
    await scope.selectOption('farmRegular');
    expect(await table.innerText()).toBe(farmFinal);
    expect(errors).toEqual([]);
  });
}
