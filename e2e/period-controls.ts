import type { Page } from '@playwright/test';

export async function setProgressDate(page: Page, date: string) {
  const input = page.getByLabel('進める最終日（当日を含む）', { exact: true });
  if (!(await input.isVisible())) {
    await page.getByText('日付を入力して進める', { exact: true }).click();
  }
  await input.fill(date);
}
