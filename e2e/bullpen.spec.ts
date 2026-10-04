import { test, expect } from '@playwright/test';

for (const width of [1280, 390]) {
  test('ブルペン：一軍・二軍の準備履歴と保存復帰 (' + width + 'px)', async ({ page }) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
    const panel = page.getByRole('region', { name: 'ブルペン準備', exact: true });
    const open = () => panel.getByText('準備状態と経過を確認', { exact: true }).click();
    await open();
    await expect(panel).toContainText('20球前');
    await expect(panel).toContainText('8球で準備完了');
    await expect(panel).toContainText('試合開始後');
    await page.getByRole('button', { name: '1日を自動進行', exact: true }).click();
    await expect(page.getByTestId('world-date')).toHaveText('2026-09-25', { timeout: 90000 });
    for (const squad of ['一軍', '二軍']) {
      const team = panel.getByRole('region', {
        name: '2026-09-24・' + squad + 'のブルペン',
        exact: true,
      });
      await expect(team).toContainText('準備開始');
      await expect(team).toContainText('準備完了');
      await expect(team).toContainText('登板済み');
    }
    const history = await panel.getByTestId('bullpen-history').allTextContents();
    expect(history.length).toBeGreaterThan(0);
    await panel.screenshot({ path: 'test-results/bullpen-' + width + '.png' });
    await page.reload();
    await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
    await page.getByRole('button', { name: '自動保存を読み込む', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('読み込みました');
    await open();
    expect(await panel.getByTestId('bullpen-history').allTextContents()).toEqual(history);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  });
}
