import { test, expect } from '@playwright/test';

for (const viewport of [
  { width: 1280, height: 960 },
  { width: 390, height: 844 },
]) {
  test(`投球・再現・表示のみ・不正seed・停止 (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await page.getByRole('button', { name: '1球の検証', exact: true }).click();
    const advance = page.getByRole('button', { name: '1球進める' });
    const reset = page.getByRole('button', { name: '設定を適用してやり直す' });
    await expect(advance).toBeEnabled();
    await advance.click();
    await expect(page.locator('.result')).toContainText('空振り');
    await expect(page.locator('.result')).toContainText('146.59 km/h');
    await page.getByText('計算の検証データを見る', { exact: true }).click();
    const first = JSON.parse(await page.locator('pre').innerText());
    await page.getByText('計算の検証データを見る', { exact: true }).click();
    await page.getByText('計算の検証データを見る', { exact: true }).click();
    expect(JSON.parse(await page.locator('pre').innerText())).toEqual(first);
    await reset.click();
    await expect(page.getByText('まだ投球はありません。')).toBeVisible();
    await advance.click();
    // Workerの応答が画面に反映されるまで待ってから、再現結果を読む。
    await expect(page.locator('.result')).toContainText('空振り');
    const replay = JSON.parse(await page.locator('pre').innerText());
    expect(replay.event.pitch).toEqual(first.event.pitch);
    expect(replay.state.rng).toEqual(first.state.rng);
    await page.getByLabel('乱数seed').fill('0');
    await reset.click();
    await expect(page.getByRole('alert')).toContainText('1～4294967295');
    expect(JSON.parse(await page.locator('pre').innerText())).toEqual(replay);
    await page.getByLabel('乱数seed').fill('20260923');
    await page.getByLabel('開始ストライク').selectOption('2');
    await reset.click();
    await expect(advance).toBeEnabled();
    // 2ストライク補正で球種が変わり得るため、未解決分岐まで順に進める。
    for (let i = 0; i < 30; i++) {
      await advance.click();
      await expect(reset).toBeEnabled();
      if (await page.getByRole('status').count()) break;
    }
    await expect(page.getByRole('status')).toContainText('停止');
    await expect(advance).toBeDisabled();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.getByText('計算の検証データを見る', { exact: true }).click();
    await page.screenshot({ path: `test-results/pitch-${viewport.width}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}
