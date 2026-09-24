import { test, expect } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`年間：月別日程・指定日進行・圧縮保存から停止復帰 (${width}px)`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
    await page.getByText('新規日程・担当球団と試作の範囲', { exact: true }).click();
    await page
      .getByRole('combobox', { name: '新規プレイの日程', exact: true })
      .selectOption('annual');
    await page.getByRole('button', { name: '新しい日程を準備', exact: true }).click();
    const date = page.getByTestId('world-date');
    await expect(date).toHaveText('2026-03-27');
    const calendar = page.getByRole('region', { name: '月別カレンダー', exact: true });
    await calendar.getByRole('button', { name: '翌月', exact: true }).click();
    await expect(calendar.locator('input[type="month"]')).toHaveValue('2026-04');
    await calendar.getByRole('button', { name: '現在月', exact: true }).click();
    await expect(calendar.locator('input[type="month"]')).toHaveValue('2026-03');
    const target = page
      .getByRole('region', { name: '日次進行', exact: true })
      .locator('input[type="date"]');
    await target.fill('2026-03-31');
    await page.getByRole('button', { name: '指定日まで進行', exact: true }).click();
    await expect(date).toHaveText('2026-04-01', { timeout: 60000 });
    await expect(
      page.getByRole('button', { name: '日次進行を一時停止', exact: true }),
    ).toBeDisabled();
    const standings = await page.getByRole('region', { name: '順位表', exact: true }).innerText();
    await page.getByRole('button', { name: '世界を手動保存', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('世界全体を手動保存');
    await page.reload();
    await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
    await page.getByRole('button', { name: '手動保存を読み込む', exact: true }).click();
    await expect(date).toHaveText('2026-04-01', { timeout: 30000 });
    expect(await page.getByRole('region', { name: '順位表', exact: true }).innerText()).toBe(
      standings,
    );
    await expect(
      page.getByRole('button', { name: '日次進行を一時停止', exact: true }),
    ).toBeDisabled();
    await expect(calendar.locator('input[type="month"]')).toHaveValue('2026-04');
    await calendar.getByRole('button', { name: '前月', exact: true }).click();
    await calendar.getByRole('button').filter({ hasText: '03-28' }).click();
    await expect(page.getByRole('region', { name: '日別の試合結果', exact: true })).toContainText(
      '2026-03-28',
    );
    await expect(page.getByRole('region', { name: '日別の試合結果', exact: true })).toContainText(
      'この日の試合はありません',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `test-results/season-${width}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}

test('期間進行：短期日程の終了で停止し、直前自動から翌日へ再開できる', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/');
  await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
  await page.getByRole('button', { name: 'シーズン終了まで進行', exact: true }).click();
  await expect(page.getByTestId('world-date')).toHaveText('2026-09-28', { timeout: 40000 });
  await expect(
    page.getByRole('button', { name: 'シーズン終了まで進行', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: '直前の自動保存を読み込む', exact: true }).click();
  await expect(page.getByTestId('world-date')).toHaveText('2026-09-27', { timeout: 15000 });
  await page.getByRole('button', { name: '1週間を進行', exact: true }).click();
  await expect(page.getByTestId('world-date')).toHaveText('2026-09-28', { timeout: 15000 });
});

test('期間進行：日次確定のエラーで停止し、再試行後も勝手に期間進行を再開しない', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.addInitScript(() => {
    const original = Worker.prototype.postMessage;
    let failed = false;
    Worker.prototype.postMessage = function (message: unknown, options?: unknown) {
      const data = message as {
        kind?: string;
        localWorldId?: string;
        expectedStateRevision?: number;
      };
      if (!failed && data.kind === 'completeDay' && data.localWorldId === 'v02-local') {
        failed = true;
        original.call(
          this,
          { ...data, expectedStateRevision: data.expectedStateRevision! - 1 },
          options as StructuredSerializeOptions,
        );
      } else original.call(this, message, options as StructuredSerializeOptions);
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
  await page.getByRole('button', { name: 'シーズン終了まで進行', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('古い世界状態', { timeout: 30000 });
  await expect(page.getByTestId('world-date')).toHaveText('2026-09-24');
  await expect(
    page.getByRole('button', { name: '日次進行を一時停止', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: '日次確定を再試行', exact: true }).click();
  await expect(page.getByTestId('world-date')).toHaveText('2026-09-25', { timeout: 15000 });
  await expect(
    page.getByRole('button', { name: '日次進行を一時停止', exact: true }),
  ).toBeDisabled();
});

test('年間実機：188日・144試合の毎日保存、年度要約と再読込', async ({ page }) => {
  test.setTimeout(600000);
  await page.goto('/');
  await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
  await page.getByText('新規日程・担当球団と試作の範囲', { exact: true }).click();
  await page
    .getByRole('combobox', { name: '新規プレイの日程', exact: true })
    .selectOption('annual');
  await page.getByRole('button', { name: '新しい日程を準備', exact: true }).click();
  await expect(page.getByTestId('world-date')).toHaveText('2026-03-27');
  await page.getByRole('button', { name: 'シーズン終了まで進行', exact: true }).click();
  await expect(page.getByTestId('world-date')).toHaveText('2026-10-01', { timeout: 500000 });
  const summary = page.getByRole('region', { name: 'シーズン終了要約', exact: true });
  await expect(summary).toContainText('全144試合');
  await expect(
    page.getByRole('button', { name: 'シーズン終了まで進行', exact: true }),
  ).toBeDisabled();
  const standings = await page.getByRole('region', { name: '順位表', exact: true }).innerText();
  await page.screenshot({ path: 'test-results/season-complete.png', fullPage: true });
  await page.reload();
  await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
  await page.getByRole('button', { name: '自動保存を読み込む', exact: true }).click();
  await expect(summary).toContainText('全144試合', { timeout: 60000 });
  expect(await page.getByRole('region', { name: '順位表', exact: true }).innerText()).toBe(
    standings,
  );
  await expect(
    page.getByRole('button', { name: '日次進行を一時停止', exact: true }),
  ).toBeDisabled();
});
