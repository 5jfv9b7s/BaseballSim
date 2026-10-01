import { test, expect } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`二軍：大会切替・登録移動・独立成績・休養日進行・保存復帰 (${width}px)`, async ({
    page,
  }) => {
    test.setTimeout(150000);
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
    const scope = page.getByRole('combobox', { name: '表示する大会', exact: true });
    const run = page.getByRole('button', { name: '1日を自動進行', exact: true });
    const date = page.getByTestId('world-date');
    const table = page.getByRole('region', { name: '順位表', exact: true });
    const stats = page.getByRole('region', { name: '累計個人成績', exact: true });
    const farm = page.getByRole('region', { name: '二軍の起用', exact: true });
    const registration = page.getByRole('region', { name: '登録・ベンチ管理', exact: true });
    const calendar = page.getByRole('region', { name: '月別カレンダー', exact: true });
    await expect(page.getByRole('region', { name: '日次進行', exact: true })).toContainText(
      '0 / 4',
    );
    await scope.selectOption('farmRegular');
    await expect(calendar.getByRole('button', { name: /^09-26/ })).toContainText(
      '星原フォックス 二軍',
    );
    await farm.getByText('今日の二軍オーダーを確認', { exact: true }).click();
    await expect(farm.getByRole('listitem').first()).toContainText('水野 翔');
    await run.click();
    await expect(date).toHaveText('2026-09-25', { timeout: 40000 });
    await expect(table).toContainText('星原フォックス 二軍');
    const farmStandings = await table.innerText();
    await stats.getByText('打撃・投手・守備の累計を開く', { exact: true }).click();
    await expect(stats).toContainText('水野 翔');
    await expect(stats).not.toContainText('汐見 航');
    await scope.selectOption('firstRegular');
    await expect(stats).toContainText('汐見 航');
    await expect(stats).not.toContainText('水野 翔');
    await registration.getByText('一軍登録・当日のベンチを編集', { exact: true }).click();
    await registration.getByRole('checkbox', { name: '汐見 航の一軍登録', exact: true }).uncheck();
    await registration.getByRole('checkbox', { name: '水野 翔の一軍登録', exact: true }).check();
    await registration.getByRole('button', { name: '登録変更を確定して保存', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('自動保存');
    await run.click();
    await expect(date).toHaveText('2026-09-26', { timeout: 40000 });
    const firstStandings = await table.innerText();
    await expect(calendar.getByRole('button', { name: /^09-26/ })).toContainText('試合なし');
    await farm.getByText('今日の二軍オーダーを確認', { exact: true }).click();
    await expect(farm.getByRole('listitem').first()).toContainText('汐見 航');
    await scope.selectOption('farmRegular');
    expect(await table.innerText()).toBe(farmStandings);
    await run.click();
    await expect(date).toHaveText('2026-09-27', { timeout: 40000 });
    await expect(page.getByRole('region', { name: 'シーズン終了要約', exact: true })).toContainText(
      '全4試合',
    );
    await expect(stats).toContainText('汐見 航');
    expect(await table.innerText()).not.toBe(farmStandings);
    const completedFarm = await table.innerText();
    await table.screenshot({ path: `test-results/farm-standings-${width}.png` });
    await scope.selectOption('firstRegular');
    expect(await table.innerText()).toBe(firstStandings);
    await expect(page.getByRole('region', { name: 'シーズン終了要約', exact: true })).toHaveCount(
      0,
    );
    await page.reload();
    await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
    await page.getByRole('button', { name: '自動保存を読み込む', exact: true }).click();
    await expect(date).toHaveText('2026-09-27', { timeout: 30000 });
    await scope.selectOption('farmRegular');
    expect(await table.innerText()).toBe(completedFarm);
    await expect(page.getByRole('region', { name: 'シーズン終了要約', exact: true })).toContainText(
      '二軍シーズン終了',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  });
}
