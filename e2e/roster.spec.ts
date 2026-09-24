import { test, expect } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`控え起用：当日指定・理想案・解除・翌日復帰・再読込 (${width}px)`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
    const editor = page.getByRole('region', { name: '球団運営', exact: true });
    await editor.getByText('打順・守備・投手起用を編集', { exact: true }).click();
    const first = editor.getByRole('combobox', { name: '1番の選手', exact: true });
    const second = editor.getByRole('combobox', { name: '2番の選手', exact: true });
    await expect(first).toHaveValue('player-a-01');
    // 選択済み野手の指定は入替として扱い、同一人物を二重配置しない。
    await first.selectOption('player-a-02');
    await expect(second).toHaveValue('player-a-01');
    await first.selectOption('player-a-01');
    await first.selectOption('player-a-13');
    await editor
      .getByRole('button', { name: 'この打順を今日だけ指定して保存', exact: true })
      .click();
    await expect(page.getByRole('status')).toContainText('自動保存');
    await editor.getByText('今日のオーダーを確認', { exact: true }).click();
    await expect(editor.getByRole('listitem').first()).toContainText('三枝 悠');
    await page.reload();
    await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
    await page.getByRole('button', { name: '自動保存を読み込む', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('読み込みました');
    await editor.getByText('打順・守備・投手起用を編集', { exact: true }).click();
    // 当日指定で理想オーダーが上書きされていない。
    await expect(first).toHaveValue('player-a-01');
    await editor.getByText('今日のオーダーを確認', { exact: true }).click();
    await expect(editor.getByRole('listitem').first()).toContainText('三枝 悠');
    await editor.getByRole('button', { name: '今日の指定を解除', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('自動保存');
    await expect(editor.getByRole('listitem').first()).toContainText('汐見 航');
    // 永続する理想案と今日だけの指定を別々に設定。
    await first.selectOption('player-a-14');
    await editor.getByRole('button', { name: '編成を確定して自動保存', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('自動保存');
    await first.selectOption('player-a-13');
    await editor
      .getByRole('button', { name: 'この打順を今日だけ指定して保存', exact: true })
      .click();
    await expect(page.getByRole('status')).toContainText('自動保存');
    await page.screenshot({ path: `test-results/roster-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: '1日を自動進行', exact: true }).click();
    await expect(page.getByTestId('world-date')).toHaveText('2026-09-25', { timeout: 20000 });
    await expect(first).toHaveValue('player-a-14');
    await expect(editor.getByRole('listitem').first()).toContainText('小峰 圭');
    await expect(
      editor.getByRole('button', { name: '今日の指定を解除', exact: true }),
    ).toBeDisabled();
    await page
      .getByRole('region', { name: '累計個人成績', exact: true })
      .getByText('打撃・投手・守備の累計を開く', { exact: true })
      .click();
    await expect(page.getByRole('region', { name: '累計個人成績', exact: true })).toContainText(
      '三枝',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  });
}
