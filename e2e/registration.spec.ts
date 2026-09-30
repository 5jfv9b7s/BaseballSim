import { test, expect } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`登録とベンチ：抹消・代役・保存復帰・翌日 (${width}px)`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
    const editor = page.getByRole('region', { name: '登録・ベンチ管理', exact: true });
    const club = page.getByRole('region', { name: '球団運営', exact: true });
    await editor.getByText('一軍登録・当日のベンチを編集', { exact: true }).click();
    const first = editor.getByRole('checkbox', { name: '汐見 航の一軍登録', exact: true });
    await first.uncheck();
    await editor.getByRole('button', { name: '登録変更を確定して保存', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('自動保存');
    await expect(first).not.toBeChecked();
    await expect(first).toBeDisabled();
    await expect(editor).toContainText('2026-10-04');
    await expect(editor).toContainText('一軍 14/31人');
    await club.getByText('今日のオーダーを確認', { exact: true }).click();
    await expect(club.getByRole('listitem').first()).toContainText('三枝 悠');
    const bench = editor.getByRole('checkbox', { name: /のベンチ入り$/ }).nth(1);
    await bench.uncheck();
    await editor.getByRole('button', { name: '今日のベンチを指定して保存', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('自動保存');
    await expect(club.getByRole('listitem').nth(1)).toContainText('小峰 圭');
    await page.reload();
    await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
    await page.getByRole('button', { name: '自動保存を読み込む', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('読み込みました');
    await editor.getByText('一軍登録・当日のベンチを編集', { exact: true }).click();
    await expect(first).not.toBeChecked();
    await expect(bench).not.toBeChecked();
    await expect(editor.getByRole('checkbox', { name: /の一軍登録$/ }).nth(1)).toBeChecked();
    await page.screenshot({ path: `test-results/registration-${width}.png`, fullPage: true });
    await editor.getByRole('button', { name: 'ベンチ指定を解除', exact: true }).click();
    await expect(bench).toBeChecked();
    await bench.uncheck();
    await editor.getByRole('button', { name: '今日のベンチを指定して保存', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('自動保存');
    await page.getByRole('button', { name: '1日を自動進行', exact: true }).click();
    await expect(page.getByTestId('world-date')).toHaveText('2026-09-25', { timeout: 30000 });
    await expect(first).not.toBeChecked();
    await expect(first).toBeDisabled();
    await expect(bench).toBeChecked();
    await expect(
      editor.getByRole('button', { name: 'ベンチ指定を解除', exact: true }),
    ).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  });
}
