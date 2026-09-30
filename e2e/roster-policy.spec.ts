import { test, expect } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`固定希望：手動・自動・ベンチ休養・保留理由・復帰 (${width}px)`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
    const editor = page.getByRole('region', { name: '登録・ベンチ管理', exact: true });
    await editor.getByText('入れ替え方針・固定希望を編集', { exact: true }).click();
    const firstPreference = editor.getByRole('combobox', {
      name: '汐見 航の固定希望',
      exact: true,
    });
    const secondPreference = editor.getByRole('combobox', { name: /の固定希望$/ }).nth(1);
    const save = editor.getByRole('button', { name: '方針・固定希望を保存', exact: true });
    const mode = editor.getByRole('combobox', { name: '入れ替えモード', exact: true });

    await firstPreference.selectOption('farmFixed');
    await secondPreference.selectOption('firstFixed');
    await save.click();
    await expect(page.getByRole('status')).toContainText('自動保存');
    await expect(editor).toContainText('一軍 15/31人');
    await expect(page.getByTestId('roster-policy-pending')).toContainText('差：1人');
    await expect(page.getByTestId('roster-policy-pending')).toContainText('手動');

    await mode.selectOption('auto');
    await save.click();
    await expect(editor).toContainText('一軍 14/31人');
    await expect(page.getByTestId('roster-policy-pending')).toContainText('差：0人');
    await editor.getByText('一軍登録・当日のベンチを編集', { exact: true }).click();
    const secondRegistered = editor.getByRole('checkbox', { name: /の一軍登録$/ }).nth(1);
    const secondBench = editor.getByRole('checkbox', { name: /のベンチ入り$/ }).nth(1);
    await expect(secondRegistered).toBeChecked();
    await expect(secondRegistered).toBeDisabled();
    await secondBench.uncheck();
    await editor.getByRole('button', { name: '今日のベンチを指定して保存', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('自動保存');
    await expect(secondRegistered).toBeChecked();
    await expect(secondBench).not.toBeChecked();

    await firstPreference.selectOption('firstFixed');
    await save.click();
    await expect(page.getByTestId('roster-policy-pending')).toContainText('2026-10-04');
    await expect(editor).toContainText('一軍 14/31人');
    await page.reload();
    await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
    await page.getByRole('button', { name: '自動保存を読み込む', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('読み込みました');
    await editor.getByText('入れ替え方針・固定希望を編集', { exact: true }).click();
    await editor.getByText('一軍登録・当日のベンチを編集', { exact: true }).click();
    await expect(mode).toHaveValue('auto');
    await expect(firstPreference).toHaveValue('firstFixed');
    await expect(secondBench).not.toBeChecked();
    await expect(page.getByTestId('roster-policy-pending')).toContainText('2026-10-04');
    await page.screenshot({ path: `test-results/roster-policy-${width}.png`, fullPage: true });
    await editor
      .locator('details')
      .first()
      .screenshot({ path: `test-results/roster-policy-editor-${width}.png` });

    await page.getByRole('button', { name: '1日を自動進行', exact: true }).click();
    await expect(page.getByTestId('world-date')).toHaveText('2026-09-25', { timeout: 30000 });
    await expect(editor).toContainText('一軍 14/31人');
    await expect(secondBench).toBeChecked();
    await expect(firstPreference).toHaveValue('firstFixed');
    await mode.selectOption('manual');
    await save.click();
    await expect(secondRegistered).toBeEnabled();
    await expect(editor).toContainText('一軍 14/31人');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  });
}
