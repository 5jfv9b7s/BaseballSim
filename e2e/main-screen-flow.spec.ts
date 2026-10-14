import { test, expect } from '@playwright/test';

test('本画面：新規プレイ・休養日・記録達成試合・年度末', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
  const date = page.getByTestId('main-date');
  await expect(date).toHaveAttribute('datetime', '2026-09-24');
  await nav.getByRole('button', { name: 'システム', exact: true }).click();
  await page.getByRole('button', { name: '新規プレイ', exact: true }).click();
  await page.getByText('新規日程・担当球団と試作の範囲', { exact: true }).click();
  // 現行の個人別球質データではseed=2で9/24の二軍に本塁打がある。
  await page.getByRole('textbox', { name: '世界seed', exact: true }).fill('2');
  await page.getByRole('button', { name: '新しい日程を準備', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('新しい日程を準備しました');
  await nav.getByRole('button', { name: '日程', exact: true }).click();
  const calendar = page.getByRole('region', { name: '月別カレンダー' });
  await calendar.getByRole('button', { name: /^09-26/ }).click();
  await expect(date).toHaveAttribute('datetime', '2026-09-24');
  await page.screenshot({ path: '.tmp/main-screen-qa/calendar.png', fullPage: true });
  await page.getByRole('button', { name: 'この日の試合前まで進める', exact: true }).click();
  await expect(date).toHaveAttribute('datetime', '2026-09-26', { timeout: 45000 });
  await nav.getByRole('button', { name: 'ホーム', exact: true }).click();
  await expect(page.getByRole('region', { name: '今日の対戦' })).toContainText(
    '今日は一軍の試合がありません',
  );
  await nav.getByRole('button', { name: '成績', exact: true }).click();
  await page.getByRole('button', { name: 'メモリアル', exact: true }).click();
  await page
    .getByRole('combobox', { name: '表示する大会', exact: true })
    .selectOption('farmRegular');
  const memorial = page.getByRole('region', { name: 'メモリアル', exact: true });
  const record = memorial.getByRole('button', { name: /記録達成試合を表示/ }).first();
  await expect(record).toBeVisible();
  await record.click();
  await expect(page.getByRole('region', { name: '日別の試合結果' })).toContainText(
    '表示している結果：2026-09-24',
  );
  await expect(page.getByRole('table', { name: '日次のイニング別スコア' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: '表示する大会', exact: true })).toHaveValue(
    'farmRegular',
  );
  await expect(date).toHaveAttribute('datetime', '2026-09-26');
  await page.getByRole('button', { name: '今日の進行', exact: true }).click();
  await expect(page.getByRole('region', { name: '日別の試合結果' })).toContainText(
    '表示している結果：2026-09-26',
  );
  await expect(page.getByRole('region', { name: '日別の試合結果' })).toContainText(
    'この日の試合はありません',
  );
  await page.getByRole('button', { name: 'シーズン終了まで進行', exact: true }).click();
  await expect(date).toHaveAttribute('datetime', '2026-09-28', { timeout: 45000 });
  await nav.getByRole('button', { name: 'ホーム', exact: true }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '3');
  await page.getByRole('button', { name: /^シーズン総括へ/ }).click();
  await expect(page.getByRole('region', { name: 'シーズン終了要約' })).toContainText('全6試合');
  await expect(page.getByRole('button', { name: /表彰・ポストシーズン\s*工事中/ })).toBeDisabled();
  expect(errors).toEqual([]);
});
