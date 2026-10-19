import { test, expect } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`プロフィール：一覧の絞り込み・年齢順・詳細・保存復帰 (${width}px)`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24');
    const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
    await nav.getByRole('button', { name: 'チーム', exact: true }).click();
    const directory = page.getByRole('region', { name: '選手一覧', exact: true });
    const table = directory.getByRole('table', { name: '選手プロフィール一覧' });
    const rows = table.locator('tbody tr');
    await expect(rows).toHaveCount(30);
    await expect(table).not.toContainText('記録なし');
    const order = directory.getByRole('combobox', { name: '選手の並び順', exact: true });
    await order.selectOption('ageAsc');
    const ages = await rows.evaluateAll((items) =>
      items.map((row) => Number(row.children[1]!.textContent!.replace('歳', ''))),
    );
    expect(ages).toEqual([...ages].sort((a, b) => a - b));
    await order.selectOption('ageDesc');
    const descending = await rows.evaluateAll((items) =>
      items.map((row) => Number(row.children[1]!.textContent!.replace('歳', ''))),
    );
    expect(descending).toEqual([...ages].sort((a, b) => b - a));
    await directory.getByRole('combobox', { name: '代表守備位置', exact: true }).selectOption('P');
    await expect(rows).toHaveCount(6);
    await directory.getByRole('combobox', { name: '登録区分', exact: true }).selectOption('first');
    await expect(rows).toHaveCount(3);
    await directory
      .getByRole('combobox', { name: '代表守備位置', exact: true })
      .selectOption('all');
    await directory.getByRole('combobox', { name: '登録区分', exact: true }).selectOption('all');
    await order.selectOption('id');
    const first = rows.first();
    await expect(first).toContainText('38歳');
    const name = await first.locator('.player-link').innerText();
    await page.screenshot({
      path: `.tmp/player-profiles-qa/directory-${width}.png`,
      fullPage: true,
    });
    await first.locator('.player-link').click();
    const detail = page.getByRole('dialog');
    await expect(detail).toHaveAccessibleName(name);
    await detail.getByRole('button', { name: '契約・経歴', exact: true }).click();
    await expect(detail).toContainText('1988-01-01');
    await expect(detail).toContainText('167cm');
    await expect(detail).toContainText('66kg');
    await expect(detail).toContainText('日本・東京都');
    await expect(detail).toContainText('契約・年俸・所属履歴・背番号は工事中');
    await detail.screenshot({ path: `.tmp/player-profiles-qa/detail-${width}.png` });
    await page.keyboard.press('Escape');
    await expect(first.locator('.player-link')).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await nav.getByRole('button', { name: 'システム', exact: true }).click();
    await page.getByRole('button', { name: '世界を手動保存', exact: true }).click();
    await expect(page.getByRole('button', { name: '手動保存を読み込む', exact: true })).toBeEnabled(
      { timeout: 30000 },
    );
    await page.reload();
    await page.getByRole('button', { name: 'セーブから再開 →', exact: true }).click();
    await page.getByRole('button', { name: '手動保存を読み込む', exact: true }).click();
    await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24');
    await nav.getByRole('button', { name: 'チーム', exact: true }).click();
    await directory.getByRole('combobox', { name: '選手の並び順', exact: true }).selectOption('id');
    await expect(rows.first()).toContainText('38歳');
    expect(errors).toEqual([]);
  });
}
