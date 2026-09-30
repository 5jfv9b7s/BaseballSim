import { test, expect } from '@playwright/test';

test('年間の再登録待ち：月跨ぎ・保存復帰後も10日境界を守る', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/');
  await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
  await page.getByText('新規日程・担当球団と試作の範囲', { exact: true }).click();
  await page
    .getByRole('combobox', { name: '新規プレイの日程', exact: true })
    .selectOption('annual');
  await page.getByRole('button', { name: '新しい日程を準備', exact: true }).click();
  await expect(page.getByTestId('world-date')).toHaveText('2026-03-27');
  const editor = page.getByRole('region', { name: '登録・ベンチ管理', exact: true });
  await editor.getByText('一軍登録・当日のベンチを編集', { exact: true }).click();
  const first = editor.getByRole('checkbox', { name: '汐見 航の一軍登録', exact: true });
  await first.uncheck();
  await editor.getByRole('button', { name: '登録変更を確定して保存', exact: true }).click();
  await expect(first).toBeDisabled();
  await expect(editor).toContainText('2026-04-06');
  await page
    .getByRole('region', { name: '日次進行', exact: true })
    .locator('input[type="date"]')
    .fill('2026-04-04');
  await page.getByRole('button', { name: '指定日まで進行', exact: true }).click();
  await expect(page.getByTestId('world-date')).toHaveText('2026-04-05', { timeout: 60000 });
  await expect(first).toBeDisabled();
  await page.reload();
  await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
  await page.getByRole('button', { name: '自動保存を読み込む', exact: true }).click();
  await expect(page.getByTestId('world-date')).toHaveText('2026-04-05');
  await editor.getByText('一軍登録・当日のベンチを編集', { exact: true }).click();
  await expect(first).toBeDisabled();
  await page.getByRole('button', { name: '1日を自動進行', exact: true }).click();
  await expect(page.getByTestId('world-date')).toHaveText('2026-04-06');
  await expect(first).toBeEnabled();
  await first.check();
  await editor.getByRole('button', { name: '登録変更を確定して保存', exact: true }).click();
  await expect(editor).toContainText('一軍 15/31人');
  await page
    .getByRole('region', { name: '球団運営', exact: true })
    .getByText('今日のオーダーを確認', { exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: '球団運営', exact: true }).getByRole('listitem').first(),
  ).toContainText('汐見 航');
  await page.getByRole('button', { name: '自動保存を読み込む', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('読み込みました');
  await editor.getByText('一軍登録・当日のベンチを編集', { exact: true }).click();
  await expect(first).toBeChecked();
  await expect(first).toBeEnabled();
});
