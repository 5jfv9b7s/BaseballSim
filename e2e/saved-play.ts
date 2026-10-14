import { expect, type Page } from '@playwright/test';

/** 新規作成したプレイが1件だけの検体を、再読み込み後に明示選択する。 */
export async function openOnlyCreatedPlay(page: Page, slot: 'auto' | 'manual') {
  const panel = page.getByRole('region', { name: '世界の保存', exact: true });
  const details = panel.getByText('ファイルのバックアップ・別プレイの復元', { exact: true });
  await details.click();
  const plays = panel.getByRole('combobox', { name: '保存済みプレイ', exact: true });
  await expect(plays.locator('option')).toHaveCount(2);
  const id = await plays.locator('option').nth(1).getAttribute('value');
  expect(id).toMatch(/^play-/);
  await plays.selectOption(id!);
  await panel.getByRole('combobox', { name: '開く保存枠', exact: true }).selectOption(slot);
  await panel.getByRole('button', { name: '選んだプレイを開く', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('保存した世界を読み込みました', {
    timeout: 180000,
  });
  await details.click();
}
