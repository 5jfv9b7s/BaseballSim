import { test, expect } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`調子：欠場も含む試合前比較・5/10試合・日次保存復帰 (${width}px)`, async ({ page }) => {
    test.setTimeout(150000);
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
    const panel = page.getByRole('region', { name: '選手の調子', exact: true });
    const open = () => panel.getByText('全選手の調子と変化を確認', { exact: true }).click();
    await open();
    const row = panel.getByTestId('condition-player-a-01');
    const reserve = panel.getByTestId('condition-player-a-13');
    await expect(row.getByTestId('stage')).toHaveText('普通');
    await expect(row.getByTestId('sample-count')).toHaveText('0／5試合');
    await expect(row.getByTestId('delta')).toHaveText('—');
    const run = page.getByRole('button', { name: '1日を自動進行', exact: true });
    await run.click();
    await expect(page.getByTestId('world-date')).toHaveText('2026-09-25', { timeout: 60000 });
    await expect(row.getByTestId('sample-count')).toHaveText('1／5試合');
    await expect(reserve.getByTestId('sample-count')).toHaveText('1／5試合');
    await expect(row.getByTestId('delta')).toHaveText('—');
    await run.click();
    await expect(page.getByTestId('world-date')).toHaveText('2026-09-26', { timeout: 60000 });
    await expect(row.getByTestId('sample-count')).toHaveText('2／5試合');
    await expect(row.getByTestId('delta')).toHaveText('-0.364');
    const before = await row.innerText();
    await panel
      .getByRole('combobox', { name: '比較するチーム試合数', exact: true })
      .selectOption('ten');
    await expect(row.getByTestId('sample-count')).toHaveText('2／10試合');
    await panel
      .getByRole('combobox', { name: '比較するチーム試合数', exact: true })
      .selectOption('five');
    expect(await row.innerText()).toBe(before);
    await page.reload();
    await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
    await page.getByRole('button', { name: '自動保存を読み込む', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('保存した世界を読み込みました');
    await open();
    expect(await row.innerText()).toBe(before);
    await run.click(); // 一軍休養日は比較件数が増えない。
    await expect(page.getByTestId('world-date')).toHaveText('2026-09-27', { timeout: 60000 });
    await expect(row.getByTestId('sample-count')).toHaveText('2／5試合');
    await expect(row.getByTestId('delta')).toHaveText('-0.364');
    await panel.screenshot({ path: `test-results/condition-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  });
}
