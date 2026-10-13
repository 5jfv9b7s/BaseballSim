import { test, expect } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`球種の特性：選手詳細と1球の測定値 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24');
    await page
      .getByRole('navigation', { name: 'メインメニュー', exact: true })
      .getByRole('button', { name: 'チーム', exact: true })
      .click();
    const directory = page.getByRole('region', { name: '選手一覧', exact: true });
    await directory
      .getByRole('combobox', { name: '選手の種類', exact: true })
      .selectOption('pitcher');
    await directory.locator('.player-link').first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('球種の特性（試作）', { exact: true }).click();
    const table = dialog.getByRole('table', { name: '球種の特性', exact: true });
    await expect(table).toContainText('rpm');
    await expect(table).toContainText('mm');
    await expect(dialog).toContainText('係数は未校正');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await table.scrollIntoViewIfNeeded();
    await expect(table).toBeInViewport();
    await dialog.screenshot({ path: `.tmp/pitch-profile-qa/player-${width}.png` });
    await page.goto('/?tools=1');
    const model = page.getByLabel('試合モデル', { exact: true });
    await expect(model).toHaveValue('game-prototype-v11');
    await page.getByRole('button', { name: '1イベント進める', exact: true }).click();
    await expect(page.locator('.pitch-measurement')).toContainText('rpm');
    await expect(page.locator('.pitch-measurement')).toContainText('試作');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `.tmp/pitch-profile-qa/game-${width}.png`, fullPage: true });
    await model.selectOption('game-prototype-v10');
    await page.getByRole('button', { name: '新しい試合を準備', exact: true }).click();
    await page.getByRole('button', { name: '1イベント進める', exact: true }).click();
    await expect(page.locator('.pitch-measurement')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
