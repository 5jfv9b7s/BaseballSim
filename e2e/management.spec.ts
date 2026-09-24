import { test, expect } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`球団運営：担当選択・打順・ローテ・代役・再読込・開始後の編集禁止 (${width}px)`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const original = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (message: unknown, options?: unknown) {
        const data = message as { kind?: string; localWorldId?: string };
        if (data.kind === 'advance' && data.localWorldId === 'v02-local') {
          setTimeout(() => original.call(this, message, options as StructuredSerializeOptions), 35);
        } else original.call(this, message, options as StructuredSerializeOptions);
      };
    });
    await page.goto('/');
    await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
    await page.getByText('新規日程・担当球団と試作の範囲', { exact: true }).click();
    await page
      .getByRole('combobox', { name: '新規プレイの担当球団', exact: true })
      .selectOption('aonagi-first');
    await page.getByRole('button', { name: '新しい日程を準備', exact: true }).click();
    const club = page.getByRole('region', { name: '球団運営', exact: true });
    await expect(club.getByRole('heading', { level: 2 })).toHaveText('担当球団：青凪ハーバーズ');
    await club.getByText('打順・守備・投手起用を編集', { exact: true }).click();
    const firstSelection = club.getByRole('combobox', { name: '1番の選手', exact: true });
    const secondSelection = club.getByRole('combobox', { name: '2番の選手', exact: true });
    const firstPlayer = await firstSelection.inputValue();
    const secondPlayer = await secondSelection.inputValue();
    await club.getByRole('button', { name: '1番を下へ', exact: true }).click();
    await expect(firstSelection).toHaveValue(secondPlayer);
    await expect(secondSelection).toHaveValue(firstPlayer);
    const firstPosition = await club.getByLabel('1番の守備位置', { exact: true }).inputValue();
    const secondPosition = await club.getByLabel('2番の守備位置', { exact: true }).inputValue();
    await club.getByLabel('1番の守備位置', { exact: true }).selectOption(secondPosition);
    const save = club.getByRole('button', { name: '編成を確定して自動保存', exact: true });
    await expect(save).toBeDisabled();
    await club.getByLabel('2番の守備位置', { exact: true }).selectOption(firstPosition);
    await club.getByRole('combobox', { name: '使用する先発枠', exact: true }).selectOption('2');
    await save.click();
    await expect(page.getByRole('status')).toContainText('編成を確定し、自動保存しました');
    const replacement = await club
      .getByRole('combobox', { name: '今日の先発指定', exact: true })
      .locator('option')
      .last()
      .getAttribute('value');
    const replacementName = await club
      .getByRole('combobox', { name: '今日の先発指定', exact: true })
      .locator('option')
      .last()
      .innerText();
    await club
      .getByRole('combobox', { name: '今日の先発指定', exact: true })
      .selectOption(replacement!);
    await club.getByRole('button', { name: '当日先発を確定して自動保存', exact: true }).click();
    await expect(club.getByTestId('today-starter')).toContainText(replacementName);
    await page.reload();
    await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
    await page.getByRole('button', { name: '自動保存を読み込む', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('保存した世界を読み込みました');
    await expect(club.getByRole('heading', { level: 2 })).toHaveText('担当球団：青凪ハーバーズ');
    await club.getByText('打順・守備・投手起用を編集', { exact: true }).click();
    await expect(firstSelection).toHaveValue(secondPlayer);
    await expect(club.getByRole('combobox', { name: '使用する先発枠', exact: true })).toHaveValue(
      '2',
    );
    await expect(club.getByTestId('today-starter')).toContainText(replacementName);
    await page.screenshot({ path: `test-results/management-${width}.png`, fullPage: true });
    const run = page.getByRole('button', { name: '1日を自動進行', exact: true });
    await run.click();
    await expect(page.getByRole('region', { name: '日次進行', exact: true })).toContainText(
      '進行中',
    );
    await page.getByRole('button', { name: '日次進行を一時停止', exact: true }).click();
    await expect(run).toBeEnabled();
    await expect(save).toBeDisabled();
    await expect(club.getByTestId('today-starter')).toContainText('試合開始時に確定済み');
    await page.getByRole('button', { name: '世界を手動保存', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('世界全体を手動保存');
    await run.click();
    await expect(page.getByTestId('world-date')).toHaveText('2026-09-25', { timeout: 20000 });
    await expect(club).toContainText('次のローテーション：2枠目');
    await expect(save).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  });
}
