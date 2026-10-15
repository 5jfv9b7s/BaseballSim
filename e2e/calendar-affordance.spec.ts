import { expect, test } from '@playwright/test';

for (const width of [390, 320]) {
  test(`カレンダー：曜日・当日・選択日の下部操作と解除 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    await page.goto('/');
    const date = page.getByTestId('main-date');
    await expect(date).toHaveAttribute('datetime', '2026-09-24');
    const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
    await nav.getByRole('button', { name: '日程', exact: true }).click();
    const calendar = page.getByRole('region', { name: '月別カレンダー', exact: true });
    await expect(calendar.locator('.calendar-weekday')).toHaveText([
      '日',
      '月',
      '火',
      '水',
      '木',
      '金',
      '土',
    ]);
    await expect(calendar.getByRole('button', { name: /^09-24/ })).toHaveAttribute(
      'aria-current',
      'date',
    );
    const selected = calendar.getByRole('button', { name: /^09-26/ });
    await selected.click();
    await expect(selected).toHaveAttribute('aria-pressed', 'true');
    await expect(date).toHaveAttribute('datetime', '2026-09-24');
    const panel = calendar.getByLabel('選択日の進行');
    // 9/24〜26は一軍4試合＋二軍4試合。表示中の大会だけに限定しない。
    await expect(panel).toContainText('3日分・残り8試合');
    await expect(
      panel.getByRole('button', { name: 'この日の終了まで進める', exact: true }),
    ).toBeEnabled();
    const panelBox = await panel.boundingBox();
    const navBox = await nav.boundingBox();
    expect(panelBox!.y).toBeGreaterThanOrEqual(0);
    expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(navBox!.y);
    expect((await selected.boundingBox())!.width).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `.tmp/ui-proposal-qa/calendar-${width}.png` });
    await panel.getByRole('button', { name: '日付の選択を解除', exact: true }).click();
    await expect(panel).toHaveAttribute('data-selected', 'false');
    await expect(date).toHaveAttribute('datetime', '2026-09-24');
  });
}
