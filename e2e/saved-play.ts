import { expect, type Page, type Locator } from '@playwright/test';

/** カードを選択するだけ。読込・書出しは各画面の確定ボタンで行う。 */
export async function selectSaveChoice(group: Locator, value: string) {
  await group.locator(`input[type="radio"][value=${JSON.stringify(value)}]`).check();
}

/** 新規作成したプレイが1件だけの検体を、再読み込み後に明示選択する。 */
export async function openOnlyCreatedPlay(page: Page, slot: 'auto' | 'manual') {
  const panel = page.getByRole('region', { name: '世界の保存', exact: true });
  const details = panel.getByText('ファイルのバックアップ・別プレイの復元', { exact: true });
  await details.click();
  const plays = panel.getByRole('group', { name: '保存済みプレイ', exact: true });
  await expect(plays.getByRole('radio')).toHaveCount(1);
  const id = await plays.getByRole('radio').first().getAttribute('value');
  expect(id).toMatch(/^play-/);
  await selectSaveChoice(plays, id!);
  await selectSaveChoice(panel.getByRole('group', { name: '開く保存枠', exact: true }), slot);
  await panel.getByRole('button', { name: '選んだプレイを開く', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('保存した世界を読み込みました', {
    timeout: 180000,
  });
  await details.click();
}
