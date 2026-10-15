import { setProgressDate } from './period-controls.ts';
import { test, expect, type Page } from '@playwright/test';

async function openWorld(page: Page) {
  await page.goto('/?tools=1');
  await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
  await expect(page.getByRole('button', { name: '1日を自動進行', exact: true })).toBeEnabled();
}

async function observeCommands(page: Page, delayAdvance = false) {
  await page.addInitScript((delay) => {
    const original = Worker.prototype.postMessage;
    Reflect.set(window, 'periodCommands', 0);
    Worker.prototype.postMessage = function (message: unknown, options?: unknown) {
      const data = message as { kind?: string; localWorldId?: string };
      if (data.localWorldId)
        Reflect.set(window, 'periodCommands', Reflect.get(window, 'periodCommands') + 1);
      if (delay && data.kind === 'advance' && data.localWorldId) {
        setTimeout(() => original.call(this, message, options as StructuredSerializeOptions), 35);
      } else original.call(this, message, options as StructuredSerializeOptions);
    };
  }, delayAdvance);
}

for (const width of [1280, 390]) {
  test(
    '指定日を含む：日付選択は無操作・当日の二軍まで確定・保存から復帰 (' + width + 'px)',
    async ({ page }) => {
      test.setTimeout(90000);
      await page.setViewportSize({ width, height: 960 });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await observeCommands(page);
      await openWorld(page);
      const calendar = page.getByRole('region', { name: '月別カレンダー', exact: true });
      const daily = page.getByRole('region', { name: '日次進行', exact: true });
      const date = page.getByTestId('world-date');
      const commands = await page.evaluate(() => Reflect.get(window, 'periodCommands'));
      await calendar.getByRole('button', { name: /^09-26/ }).click();
      await expect(calendar.getByRole('button', { name: /^09-26/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(calendar).toContainText('選択日：2026-09-26');
      await expect(date).toHaveText('2026-09-24');
      expect(await page.evaluate(() => Reflect.get(window, 'periodCommands'))).toBe(commands);
      await calendar.getByRole('button', { name: 'この日の終了まで進める', exact: true }).click();
      await expect(date).toHaveText('2026-09-27', { timeout: 40000 });
      await expect(page.getByRole('status')).toContainText(
        '2026-09-26の終了まで進めて停止しました',
      );
      await expect(daily).toContainText('0 / 2 完了');
      await expect(calendar.getByRole('button', { name: /^09-26/ })).toContainText('確定済み');
      await expect(daily.locator('p').filter({ hasText: /・\s*試合前$/ })).toHaveCount(2);
      await expect(
        page.getByRole('button', { name: '日次進行を一時停止', exact: true }),
      ).toBeDisabled();
      await page
        .getByRole('combobox', { name: '表示する大会', exact: true })
        .selectOption('farmRegular');
      await expect(page.getByRole('region', { name: '日別の試合結果', exact: true })).toContainText(
        '2026-09-26',
      );
      const farmStandings = await page
        .getByRole('region', { name: '順位表', exact: true })
        .innerText();
      await page.reload();
      await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
      await page.getByRole('button', { name: '自動保存を読み込む', exact: true }).click();
      await expect(date).toHaveText('2026-09-27', { timeout: 30000 });
      await expect(daily).toContainText('0 / 2 完了');
      await expect(page.getByRole('button', { name: '期間進行を再開', exact: true })).toHaveCount(
        0,
      );
      await page
        .getByRole('combobox', { name: '表示する大会', exact: true })
        .selectOption('farmRegular');
      expect(await page.getByRole('region', { name: '順位表', exact: true }).innerText()).toBe(
        farmStandings,
      );
      await calendar.getByRole('button', { name: /^09-27/ }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await calendar.screenshot({ path: 'test-results/period-calendar-' + width + '.png' });
      await daily.screenshot({ path: 'test-results/period-arrival-' + width + '.png' });
      expect(errors).toEqual([]);
    },
  );
}

test('期間目標：途中停止から同じ目標へ再開し、最終日を含めて完走する', async ({ page }) => {
  test.setTimeout(90000);
  await observeCommands(page, true);
  await openWorld(page);
  const daily = page.getByRole('region', { name: '日次進行', exact: true });
  const date = page.getByTestId('world-date');
  const pause = page.getByRole('button', { name: '日次進行を一時停止', exact: true });
  await setProgressDate(page, '2026-09-27');
  await page.getByRole('button', { name: '指定日の終了まで進行', exact: true }).click();
  await pause.click();
  const resume = page.getByRole('button', { name: '期間進行を再開', exact: true });
  await expect(resume).toBeEnabled();
  await expect(daily).toContainText('一時停止中：2026-09-27の終了まで');
  await expect(date).toHaveText('2026-09-24');
  await resume.click();
  await expect(date).toHaveText('2026-09-28', { timeout: 50000 });
  await expect(pause).toBeDisabled();
  await expect(resume).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'シーズン終了要約', exact: true })).toBeVisible();
});

test('期間目標：過去・範囲外は拒否し、新規プレイで停止目標を持ち越さない', async ({ page }) => {
  test.setTimeout(60000);
  await observeCommands(page, true);
  await openWorld(page);
  const daily = page.getByRole('region', { name: '日次進行', exact: true });
  await setProgressDate(page, '2026-09-24');
  const input = daily.locator('input[type="date"]');
  const advance = page.getByRole('button', { name: '指定日の終了まで進行', exact: true });
  const before = await page.evaluate(() => Reflect.get(window, 'periodCommands'));
  for (const target of ['2026-09-23', '2026-09-28']) {
    await input.fill(target);
    await advance.click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByTestId('world-date')).toHaveText('2026-09-24');
  }
  expect(await page.evaluate(() => Reflect.get(window, 'periodCommands'))).toBe(before);
  await input.fill('2026-09-27');
  await advance.click();
  await page.getByRole('button', { name: '日次進行を一時停止', exact: true }).click();
  await expect(page.getByRole('button', { name: '期間進行を再開', exact: true })).toBeEnabled();
  await page.getByText('新規日程・担当球団と試作の範囲', { exact: true }).click();
  await expect(page.getByRole('button', { name: '新しい日程を準備', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '現在の作業を手動保存', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('世界全体を手動保存', { timeout: 30000 });
  await page.getByRole('button', { name: '新しい日程を準備', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('新しい日程を準備しました');
  await expect(page.getByRole('button', { name: '期間進行を再開', exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: '日次進行を一時停止', exact: true }),
  ).toBeDisabled();
});

test('指定日に今日を選べば、今日だけを処理して翌日の試合前で止まる', async ({ page }) => {
  test.setTimeout(60000);
  await openWorld(page);
  await setProgressDate(page, '2026-09-24');
  await page.getByRole('button', { name: '指定日の終了まで進行', exact: true }).click();
  await expect(page.getByTestId('world-date')).toHaveText('2026-09-25', { timeout: 40000 });
  await expect(page.getByRole('status')).toContainText('2026-09-24の終了まで進めて停止しました');
  await expect(
    page.getByRole('button', { name: '日次進行を一時停止', exact: true }),
  ).toBeDisabled();
  const calendar = page.getByRole('region', { name: '月別カレンダー', exact: true });
  await calendar.getByRole('button', { name: /^09-24/ }).click();
  await expect(
    calendar.getByRole('button', { name: 'この日の終了まで進める', exact: true }),
  ).toHaveCount(0);
});
