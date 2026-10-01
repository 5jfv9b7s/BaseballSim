import { test, expect } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`体力・疲労：一二軍の負荷・休養・日次回復・保存再開 (${width}px)`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
    const panel = page.getByRole('region', { name: '体力・疲労', exact: true });
    await panel.getByText('全選手の体力・負荷を確認', { exact: true }).click();
    await expect(panel).toContainText('所属30人');
    const pitcher = panel.getByTestId('physical-player-a-10');
    const reserve = panel.getByTestId('physical-player-a-13');
    const farm = panel.getByTestId('physical-player-a-16');
    await expect(pitcher.getByTestId('energy')).toHaveText('100.0');
    await page.getByRole('button', { name: '1日を自動進行', exact: true }).click();
    await expect(page.getByTestId('world-date')).toHaveText('2026-09-25', { timeout: 45000 });
    await expect(pitcher.getByTestId('pitching')).toHaveText('0');
    await panel
      .getByRole('combobox', { name: '負荷を表示する日', exact: true })
      .selectOption('previous');
    expect(Number(await pitcher.getByTestId('pitching').innerText())).toBeGreaterThan(0);
    await expect(pitcher.getByTestId('preparation')).toHaveText('1');
    expect(Number(await pitcher.getByTestId('energy').innerText())).toBeLessThan(100);
    expect(Number(await pitcher.getByTestId('fatigue').innerText())).toBeGreaterThan(0);
    await expect(reserve).toContainText('休養');
    await expect(reserve.getByTestId('batting')).toHaveText('0');
    await expect(reserve.getByTestId('energy')).toHaveText('100.0');
    expect(Number(await farm.getByTestId('batting').innerText())).toBeGreaterThan(0);
    const before = await panel.getByRole('table').innerText();
    await panel.screenshot({ path: `test-results/physical-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.reload();
    await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
    await page.getByRole('button', { name: '自動保存を読み込む', exact: true }).click();
    await expect(page.getByTestId('world-date')).toHaveText('2026-09-25', { timeout: 30000 });
    await panel.getByText('全選手の体力・負荷を確認', { exact: true }).click();
    await panel
      .getByRole('combobox', { name: '負荷を表示する日', exact: true })
      .selectOption('previous');
    expect(await panel.getByRole('table').innerText()).toBe(before);
    expect(errors).toEqual([]);
  });
}
