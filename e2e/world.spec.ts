import { test, expect, type Page } from '@playwright/test';

async function openWorld(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '1日進行（v0.2）', exact: true }).click();
  await expect(page.getByRole('button', { name: '1日を自動進行', exact: true })).toBeEnabled();
}

for (const width of [1280, 390]) {
  test(`v0.2：全試合・順位・累計・翌日保存・試合なしの日 (${width}px)`, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openWorld(page);
    const run = page.getByRole('button', { name: '1日を自動進行', exact: true });
    const date = page.getByTestId('world-date');
    const results = page.getByRole('region', { name: '日別の試合結果', exact: true });
    const table = page.getByRole('region', { name: '順位表', exact: true });
    const autoLoad = page.getByRole('button', { name: '自動保存を読み込む', exact: true });

    await expect(date).toHaveText('2026-09-24');
    await run.click();
    await expect(date).toHaveText('2026-09-25', { timeout: 20000 });
    await expect(page.getByRole('status')).toContainText('2026-09-24の全結果を反映');
    await expect(results).toContainText('表示している結果：2026-09-24');
    await expect(results).toContainText('0 − 2');
    await expect(results).toContainText('2 − 4');
    const firstStandings = await table.innerText();
    await page
      .getByRole('region', { name: '累計個人成績', exact: true })
      .getByText('打撃・投手・守備の累計を開く')
      .click();
    await expect(page.getByRole('region', { name: '累計個人成績', exact: true })).toContainText(
      '安打',
    );
    await expect(page.getByRole('region', { name: '累計個人成績', exact: true })).toContainText(
      '防御率',
    );
    await results.getByText('この試合の個人成績', { exact: true }).click();
    await expect(results).toContainText('刺殺');

    await run.click();
    await expect(date).toHaveText('2026-09-26', { timeout: 20000 });
    const secondStandings = await table.innerText();
    expect(secondStandings).not.toBe(firstStandings);
    await expect(page.getByRole('region', { name: '日次進行', exact: true })).toContainText(
      '今日は試合がありません',
    );
    await run.click();
    await expect(date).toHaveText('2026-09-27', { timeout: 20000 });
    await expect(results).toContainText('表示している結果：2026-09-26');
    await expect(results).toContainText('この日の試合はありません');
    expect(await table.innerText()).toBe(secondStandings);
    await page.reload();
    await page.getByRole('button', { name: '1日進行（v0.2）', exact: true }).click();
    await expect(autoLoad).toBeEnabled();
    await autoLoad.click();
    await expect(date).toHaveText('2026-09-27', { timeout: 20000 });
    expect(await table.innerText()).toBe(secondStandings);
    await page.getByRole('button', { name: '直前の自動保存を読み込む', exact: true }).click();
    await expect(date).toHaveText('2026-09-26', { timeout: 20000 });
    await expect(
      page.getByRole('button', { name: '日次進行を一時停止', exact: true }),
    ).toBeDisabled();
    await autoLoad.click();
    await expect(date).toHaveText('2026-09-27');
    await run.click();
    await expect(date).toHaveText('2026-09-28', { timeout: 20000 });
    await expect(run).toBeDisabled();
    await expect(page.getByRole('region', { name: '日次進行', exact: true })).toContainText(
      '試作日程をすべて完了',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `test-results/world-${width}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}

test('v0.2：一時停止・手動保存・再読み込みから同じ結果へ再開する', async ({ page }) => {
  test.setTimeout(60000);
  // 進行中の境界を確実に操作するため、UIからのadvance送信だけ遅らせる。
  await page.addInitScript(() => {
    const original = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message: unknown, options?: unknown) {
      const data = message as { kind?: string; localWorldId?: string };
      if (data.kind === 'advance' && data.localWorldId === 'v02-local') {
        setTimeout(() => original.call(this, message, options as StructuredSerializeOptions), 35);
      } else original.call(this, message, options as StructuredSerializeOptions);
    };
  });
  await openWorld(page);
  const run = page.getByRole('button', { name: '1日を自動進行', exact: true });
  const pause = page.getByRole('button', { name: '日次進行を一時停止', exact: true });
  const manualSave = page.getByRole('button', { name: '世界を手動保存', exact: true });
  await run.click();
  await expect(page.getByRole('region', { name: '日次進行', exact: true })).toContainText('進行中');
  await pause.click();
  await expect(manualSave).toBeEnabled();
  const progress = await page.getByRole('region', { name: '日次進行', exact: true }).innerText();
  await manualSave.click();
  await expect(page.getByRole('status')).toContainText('世界全体を手動保存');
  await run.click();
  await expect(page.getByTestId('world-date')).toHaveText('2026-09-25', { timeout: 20000 });
  const expected = await page.getByRole('region', { name: '順位表', exact: true }).innerText();
  await page.reload();
  await page.getByRole('button', { name: '1日進行（v0.2）', exact: true }).click();
  await page.getByRole('button', { name: '手動保存を読み込む', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('保存した世界を読み込みました');
  await expect(page.getByTestId('world-date')).toHaveText('2026-09-24');
  await expect(pause).toBeDisabled();
  expect(await page.getByRole('region', { name: '日次進行', exact: true }).innerText()).toContain(
    progress.split('\n').find((line) => line.includes('進行中'))!,
  );
  await run.click();
  await expect(page.getByTestId('world-date')).toHaveText('2026-09-25', { timeout: 20000 });
  expect(await page.getByRole('region', { name: '順位表', exact: true }).innerText()).toBe(
    expected,
  );
});
