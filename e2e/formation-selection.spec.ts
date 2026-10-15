import { expect, test } from '@playwright/test';

for (const width of [1280, 390, 320]) {
  test(`選ぶ・置く：キーボード、守備交換、空き枠修正と退出保存 (${width}px)`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24');
    const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
    await expect(nav.locator('.menu-icon[aria-hidden="true"]')).toHaveCount(6);
    await page.screenshot({ path: `.tmp/ui-proposal-qa/home-${width}.png`, fullPage: true });
    await nav.getByRole('button', { name: '編成', exact: true }).click();
    const editor = page.getByRole('region', { name: '編成の編集', exact: true });
    const slots = editor.locator('.formation-slot');
    const firstId = await slots.nth(0).locator('select').first().inputValue();
    const secondId = await slots.nth(1).locator('select').first().inputValue();
    const firstRole = await slots.nth(0).locator('select').nth(1).inputValue();
    await expect(slots.nth(0).locator('select').first()).toBeHidden();
    if (width < 600) {
      const firstBox = await slots.nth(0).boundingBox();
      const infoBox = await editor
        .getByRole('complementary', { name: '選択選手情報' })
        .boundingBox();
      expect(infoBox!.y).toBeGreaterThan(firstBox!.y + firstBox!.height);
    }
    await page.screenshot({ path: `.tmp/ui-proposal-qa/formation-${width}.png`, fullPage: true });

    await slots.nth(0).locator('.formation-select').focus();
    await page.keyboard.press('Enter');
    const secondTarget = editor.getByRole('button', { name: '2番へ配置', exact: true });
    await expect(secondTarget).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(editor.getByRole('button', { name: '3番へ配置', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect(slots.nth(0).locator('select').first()).toHaveValue(secondId);
    await expect(slots.nth(1).locator('select').first()).toHaveValue(firstId);
    const bar = editor.getByRole('region', { name: '選択選手の操作', exact: true });
    const barBox = await bar.boundingBox();
    const navBox = await nav.boundingBox();
    expect(barBox!.y + barBox!.height).toBeLessThanOrEqual(navBox!.y);
    await bar.getByRole('button', { name: '守備を交換', exact: true }).click();
    await editor.getByRole('button', { name: '1番と守備を交換', exact: true }).click();
    await expect(slots.nth(0).locator('select').nth(1)).toHaveValue(firstRole);
    await bar.getByRole('button', { name: '移す', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(editor.locator('[data-placement-target]')).toHaveCount(0);
    await expect(slots.nth(1).locator('select').first()).toHaveValue(firstId);

    await bar.getByRole('button', { name: '選択選手を二軍へ', exact: true }).click();
    await expect(editor.getByLabel('編成の修正箇所')).toContainText('空き枠 1件');
    await editor.getByRole('button', { name: '2番の空き枠へ移動', exact: true }).click();
    await expect(slots.nth(1)).toBeFocused();
    await bar.getByRole('button', { name: '移す', exact: true }).click();
    await editor.getByRole('button', { name: '2番へ配置', exact: true }).click();
    await expect(editor.getByLabel('編成の修正箇所')).toHaveCount(0);
    await bar.getByRole('button', { name: '詳細を開く', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `.tmp/ui-proposal-qa/selection-${width}.png`, fullPage: false });
    await nav.getByRole('button', { name: 'ホーム', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'クラブハウス', exact: true })).toBeVisible();
    await expect(page.locator('.save-badge')).toHaveText('保存済み');
    await nav.getByRole('button', { name: '編成', exact: true }).click();
    await expect(slots.nth(1).locator('select').first()).toHaveValue(firstId);
    expect(errors).toEqual([]);
  });
}

test('投手の選ぶ・置く：役割の移動と取消をドラッグなしで操作する', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 960 });
  await page.goto('/');
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24');
  await page
    .getByRole('navigation', { name: 'メインメニュー', exact: true })
    .getByRole('button', { name: '編成', exact: true })
    .click();
  const editor = page.getByRole('region', { name: '編成の編集', exact: true });
  await editor.getByRole('button', { name: '投手オーダー', exact: true }).click();
  const rotation = editor.getByRole('region', { name: '先発ローテーション', exact: true });
  const original = await rotation.locator('.formation-select').first().innerText();
  await rotation.locator('.formation-select').first().click();
  const bar = editor.getByRole('region', { name: '選択選手の操作', exact: true });
  await bar.getByRole('button', { name: '移す', exact: true }).click();
  await editor.getByRole('button', { name: '抑えの最後へ配置', exact: true }).click();
  await expect(
    editor.getByRole('region', { name: '抑え', exact: true }).locator('.formation-select'),
  ).toContainText([original]);
  await bar.getByRole('button', { name: '移す', exact: true }).click();
  await editor.getByRole('button', { name: '先発の最後へ配置', exact: true }).click();
  await expect(rotation.locator('.formation-select')).toContainText([original]);
  await editor.getByRole('button', { name: '変更を戻す', exact: true }).click();
  await expect(editor).toContainText('変更はありません。');
});
