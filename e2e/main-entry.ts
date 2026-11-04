import { expect, type Page } from '@playwright/test';

/** 従来の画面検査用：既存の開発入口で未保存世界を表示する。ゲーム指示は送らない。 */
async function showDevelopmentHome(page: Page) {
  await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
  // 開発画面の全パネルを待たずに切り替え、本画面で初回Worker応答を待つ。
  await page.getByRole('button', { name: '本画面へ戻る', exact: true }).click();
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', /\d{4}-\d{2}-\d{2}/, {
    timeout: 30000,
  });
}

export async function openDevelopmentHome(page: Page) {
  await page.goto('/?tools=1');
  await showDevelopmentHome(page);
}

export async function reloadDevelopmentHome(page: Page) {
  await page.reload();
  await showDevelopmentHome(page);
}
