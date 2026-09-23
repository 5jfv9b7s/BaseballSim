import { test, expect } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`1試合の進行・保存・再読込・前保存・再現 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    const run = page.getByRole('button', { name: '1試合を自動進行', exact: true });
    const save = page.getByRole('button', { name: '試合結果を保存', exact: true });
    const load = page.getByRole('button', { name: '保存した試合を読み込む', exact: true });
    const previous = page.getByRole('button', { name: '前の保存を読み込む', exact: true });
    const reset = page.getByRole('button', { name: '新しい試合を準備', exact: true });
    await expect(run).toBeEnabled();
    await expect(save).toBeDisabled();
    await expect(load).toBeDisabled();
    await run.click();
    await expect(save).toBeEnabled({ timeout: 20000 });
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/勝利|引き分け/);
    const score = await page.getByRole('region', { name: 'イニング別スコア' }).innerText();
    const statistics = await page.getByRole('region', { name: '試合成績' }).innerText();
    await save.click();
    await expect(page.getByRole('status')).toContainText('保存しました');
    await page.getByLabel('試合seed', { exact: true }).fill('20260924');
    await reset.click();
    await expect(run).toBeEnabled();
    await run.click();
    await expect(save).toBeEnabled({ timeout: 20000 });
    await save.click();
    await expect(page.getByRole('status')).toContainText('保存しました');
    const secondStatistics = await page.getByRole('region', { name: '試合成績' }).innerText();
    await page.reload();
    await expect(load).toBeEnabled();
    await load.click();
    await expect(page.getByRole('status')).toContainText('読み込みました');
    expect(await page.getByRole('region', { name: '試合成績' }).innerText()).toBe(secondStatistics);
    await previous.click();
    await expect(page.getByRole('region', { name: '試合成績' })).toHaveText(statistics, {
      useInnerText: true,
    });
    expect(await page.getByRole('region', { name: 'イニング別スコア' }).innerText()).toBe(score);
    await page.getByLabel('試合seed', { exact: true }).fill('20260923');
    await reset.click();
    await expect(run).toBeEnabled();
    await run.click();
    await expect(save).toBeEnabled({ timeout: 20000 });
    expect(await page.getByRole('region', { name: '試合成績' }).innerText()).toBe(statistics);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `test-results/game-${width}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}

test('無効seedは試合を変更せず、画面切替は進行状態を保持する', async ({ page }) => {
  await page.goto('/');
  const reset = page.getByRole('button', { name: '新しい試合を準備', exact: true });
  const step = page.getByRole('button', { name: '1イベント進める', exact: true });
  await expect(step).toBeEnabled();
  await step.click();
  await expect(page.locator('.game-progress')).toHaveText('1球を処理');
  await page.getByLabel('試合seed', { exact: true }).fill('0');
  await reset.click();
  await expect(page.getByRole('alert')).toContainText('1～4294967295');
  await page.getByRole('button', { name: '1球の検証', exact: true }).click();
  await page.getByRole('button', { name: '1試合シミュレーション', exact: true }).click();
  await expect(page.locator('.game-progress')).toHaveText('1球を処理');
});
