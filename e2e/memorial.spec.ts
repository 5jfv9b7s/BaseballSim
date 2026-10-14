import { openOnlyCreatedPlay } from './saved-play.ts';
import { test, expect } from '@playwright/test';

for (const width of [1280, 390]) {
  test('メモリアル：達成試合・大会別記録・保存復帰 (' + width + 'px)', async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const original = Worker.prototype.postMessage;
      Reflect.set(window, 'memorialCommands', 0);
      Worker.prototype.postMessage = function (message: unknown, options?: unknown) {
        if (message && typeof message === 'object' && 'localWorldId' in message)
          Reflect.set(window, 'memorialCommands', Reflect.get(window, 'memorialCommands') + 1);
        original.call(this, message, options as StructuredSerializeOptions);
      };
    });
    await page.goto('/?tools=1');
    await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
    // 通常のUIから、初日に一軍・二軍とも本塁打が出る固定seedを準備する。
    await page.getByText('新規日程・担当球団と試作の範囲', { exact: true }).click();
    await page.getByRole('textbox', { name: '世界seed', exact: true }).fill('2');
    await page.getByRole('button', { name: '新しい日程を準備', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('新しい日程を準備しました');
    const panel = page.getByRole('region', { name: 'メモリアル', exact: true });
    const results = page.getByRole('region', { name: '日別の試合結果', exact: true });
    const scope = page.getByRole('combobox', { name: '表示する大会', exact: true });
    const run = page.getByRole('button', { name: '1日を自動進行', exact: true });
    const date = page.getByTestId('world-date');
    await expect(panel).toContainText('確定試合での本塁打記録はまだありません');
    await page.getByRole('button', { name: '世界を手動保存', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('世界全体を手動保存', { timeout: 30000 });
    await run.click();
    await expect(date).toHaveText('2026-09-25', { timeout: 40000 });
    await expect(panel).toContainText('確定試合 2 / 6');
    const first = await panel.innerText();
    // 固定seedの記録を開き、日付選択と試合選択が一致することを確認する。
    const recordRow = panel.getByRole('row').nth(1);
    await expect(recordRow).toBeVisible();
    const playerName = await recordRow.getByRole('rowheader').innerText();
    await results
      .getByRole('combobox', { name: '結果の日付', exact: true })
      .selectOption('2026-09-27');
    const commands = await page.evaluate(() => Reflect.get(window, 'memorialCommands'));
    await recordRow.getByRole('button').click();
    await expect(results).toBeFocused();
    await expect(results).toContainText('表示している結果：2026-09-24');
    await results.getByText('この試合の個人成績', { exact: true }).click();
    await expect(
      results.getByRole('rowheader', { name: playerName, exact: true }).first(),
    ).toBeVisible();
    expect(await page.evaluate(() => Reflect.get(window, 'memorialCommands'))).toBe(commands);
    await expect(date).toHaveText('2026-09-25');
    await scope.selectOption('farmRegular');
    await expect(panel).toContainText('二軍・今季ここまで');
    await expect(panel).toContainText('確定試合 2 / 4');
    const farm = await panel.innerText();
    await panel.getByRole('button').first().click();
    await expect(
      results.getByRole('combobox', { name: '詳細を表示する試合', exact: true }),
    ).toHaveValue('G2026-farm-0924-01');
    await expect(
      results.getByRole('cell', { name: '星原フォックス 二軍', exact: true }).first(),
    ).toBeVisible();
    await page.getByRole('button', { name: '手動保存を読み込む', exact: true }).click();
    await expect(date).toHaveText('2026-09-24', { timeout: 30000 });
    await expect(panel).toContainText('確定試合での本塁打記録はまだありません');
    await page.reload();
    await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
    await openOnlyCreatedPlay(page, 'auto');
    await expect(date).toHaveText('2026-09-25', { timeout: 30000 });
    expect(await panel.innerText()).toBe(first);
    await scope.selectOption('farmRegular');
    expect(await panel.innerText()).toBe(farm);
    await scope.selectOption('firstRegular');
    await expect(panel.getByRole('row').nth(1)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await panel.screenshot({ path: 'test-results/memorial-' + width + '.png' });
    expect(errors).toEqual([]);
  });
}
