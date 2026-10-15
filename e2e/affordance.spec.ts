import { expect, test } from '@playwright/test';

for (const width of [1280, 390, 320]) {
  test(`操作案内：キーボード・保存と再開・進行しない閲覧 (${width}px)`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      Reflect.set(window, 'worldCommands', 0);
      const original = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (message: unknown, options?: unknown) {
        if (message && typeof message === 'object' && 'localWorldId' in message) {
          Reflect.set(window, 'worldCommands', Reflect.get(window, 'worldCommands') + 1);
        }
        original.call(this, message, options as StructuredSerializeOptions);
      };
    });
    await page.goto('/');
    const date = page.getByTestId('main-date');
    await expect(date).toHaveAttribute('datetime', '2026-09-24');
    const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
    const saveLink = page.getByRole('button', { name: 'セーブ画面を開く', exact: true });
    await saveLink.focus();
    await expect(saveLink).toBeFocused();
    expect(await saveLink.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
    await page.screenshot({ path: `.tmp/affordance-qa/home-${width}.png`, fullPage: true });
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'セーブ・再開', exact: true })).toBeFocused();

    const panel = page.getByRole('region', { name: '世界の保存', exact: true });
    const resume = panel.getByRole('region', { name: '保存したプレイを再開', exact: true });
    const open = resume.getByRole('button', { name: '選んだプレイを開く', exact: true });
    await expect(resume).toBeVisible();
    await expect(open).toBeDisabled();
    await expect(open).toHaveAccessibleDescription(/保存したプレイはまだありません/);
    await expect(
      panel.getByRole('button', { name: '手動保存を読み込む', exact: true }),
    ).toHaveAccessibleDescription(/保存がないため、まだ読み込めません/);
    expect(await page.evaluate(() => Reflect.get(window, 'worldCommands'))).toBe(0);

    const save = panel.getByRole('button', { name: '世界を手動保存', exact: true });
    await save.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toContainText('世界全体を手動保存', { timeout: 30000 });
    await expect(page.getByText('現在の作業状態は保存済みです。', { exact: true })).toBeVisible();
    await expect(page.locator('.save-badge')).toHaveText('保存済み');
    await expect(open).toBeDisabled();
    await expect(open).toHaveAccessibleDescription(/プレイと保存枠を選ぶと/);
    const afterSave = await page.evaluate(() => Reflect.get(window, 'worldCommands'));
    await resume
      .getByRole('combobox', { name: '保存済みプレイ', exact: true })
      .selectOption('v02-local');
    await expect(open).toBeEnabled();
    expect(await page.evaluate(() => Reflect.get(window, 'worldCommands'))).toBe(afterSave);
    await page.screenshot({ path: `.tmp/affordance-qa/save-${width}.png`, fullPage: true });
    const disclosure = panel.getByText('ファイルのバックアップ・別プレイの復元', { exact: true });
    await disclosure.focus();
    await page.keyboard.press('Enter');
    const importButton = panel.getByRole('button', { name: '別プレイとして取り込む', exact: true });
    await expect(importButton).toBeDisabled();
    await expect(importButton).toHaveAccessibleDescription(/先に .bssave ファイルを選択/);
    await page.screenshot({ path: `.tmp/affordance-qa/backup-${width}.png`, fullPage: true });
    await page.keyboard.press('Enter');
    await expect(importButton).toBeHidden();

    await nav.getByRole('button', { name: '日程', exact: true }).click();
    await expect(nav.getByRole('button', { name: '日程', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await page.getByRole('button', { name: '今日の進行', exact: true }).click();
    const day = page.getByRole('region', { name: '今日を進める', exact: true });
    await expect(
      day.getByRole('button', { name: '1日を自動進行', exact: true }),
    ).toHaveAccessibleDescription(/全試合を終え、日次確定と自動保存/);
    await expect(
      day.getByRole('button', { name: '日次進行を一時停止', exact: true }),
    ).toBeDisabled();
    await expect(day).toContainText('一時停止は、自動進行を始めると使えます。');
    await page.getByLabel('到着する日（試合前）', { exact: true }).fill('2026-09-26');
    await expect(date).toHaveAttribute('datetime', '2026-09-24');
    expect(await page.evaluate(() => Reflect.get(window, 'worldCommands'))).toBe(afterSave);
    await page.screenshot({ path: `.tmp/affordance-qa/progress-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );

    // 再読込後もバックアップ欄を開かずに、明示的に保存したプレイへ戻れる。
    await page.reload();
    await page.getByRole('button', { name: 'セーブから再開 →', exact: true }).click();
    await expect(save).toBeDisabled();
    await expect(save).toHaveAccessibleDescription(/以前の保存があります/);
    await resume
      .getByRole('combobox', { name: '保存済みプレイ', exact: true })
      .selectOption('v02-local');
    await open.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toContainText('保存した世界を読み込みました', {
      timeout: 30000,
    });
    await expect(save).toBeEnabled();
    await expect(date).toHaveAttribute('datetime', '2026-09-24');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  });
}
