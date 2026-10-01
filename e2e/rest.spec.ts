import { test, expect } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`休養方針：個別継承・優先順・ベンチ外・手動先発・名簿固定・復帰 (${width}px)`, async ({
    page,
  }) => {
    test.setTimeout(150000);
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const original = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (message: unknown, options?: unknown) {
        const data = message as { kind?: string; localWorldId?: string };
        if (data.kind === 'advance' && data.localWorldId === 'v02-local')
          setTimeout(() => original.call(this, message, options as StructuredSerializeOptions), 35);
        else original.call(this, message, options as StructuredSerializeOptions);
      };
    });
    await page.goto('/');
    await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
    const panel = page.getByRole('region', { name: '投手の休養方針', exact: true });
    const preview = panel.getByRole('region', { name: '今日の一軍投手', exact: true });
    const row = preview.getByTestId('rest-player-a-11');
    const save = panel.getByRole('button', { name: '休養方針を確定して保存', exact: true });
    await panel.getByText('休養条件と今日の起用を確認・編集', { exact: true }).click();
    await panel
      .getByRole('group', { name: '一軍の既定条件', exact: true })
      .getByRole('combobox')
      .selectOption('none');
    await save.click();
    await expect(save).toBeDisabled();
    await panel
      .getByRole('combobox', { name: '個別設定する投手', exact: true })
      .selectOption('player-a-11');
    await panel
      .getByRole('combobox', { name: '個別条件の使い方', exact: true })
      .selectOption('custom');
    const custom = panel.getByRole('group', { name: '投手個別の条件', exact: true });
    await custom.getByRole('combobox').selectOption('benchRest');
    await custom.getByRole('spinbutton', { name: '疲労以上', exact: true }).fill('0');
    await save.click();
    await expect(row).toContainText('ベンチ外');
    await custom.getByRole('combobox').selectOption('preferRest');
    await save.click();
    await expect(row).toContainText('ベンチ内・休養優先');
    await custom.getByRole('combobox').selectOption('benchRest');
    await save.click();
    await expect(row).toContainText('ベンチ外');
    const club = page.getByRole('region', { name: '球団運営', exact: true });
    await club.getByText('打順・守備・投手起用を編集', { exact: true }).click();
    await club
      .getByRole('combobox', { name: '今日の先発指定', exact: true })
      .selectOption('player-a-11');
    await club.getByRole('button', { name: '当日先発を確定して自動保存', exact: true }).click();
    await expect(row).toContainText('当日の手動先発指定を優先');
    await page.reload();
    await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
    await page.getByRole('button', { name: '自動保存を読み込む', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('保存した世界を読み込みました');
    await panel.getByText('休養条件と今日の起用を確認・編集', { exact: true }).click();
    await expect(row).toContainText('当日の手動先発指定を優先');
    const before = await preview.innerText();
    const run = page.getByRole('button', { name: '1日を自動進行', exact: true });
    await run.click();
    await expect(
      page.getByRole('button', { name: '日次進行を一時停止', exact: true }),
    ).toBeEnabled();
    await page.getByRole('button', { name: '日次進行を一時停止', exact: true }).click();
    await expect(run).toBeEnabled();
    await expect(
      panel.getByRole('group', { name: '一軍の既定条件', exact: true }).getByRole('combobox'),
    ).toBeDisabled();
    expect(await preview.innerText()).toBe(before);
    await run.click();
    await expect(page.getByTestId('world-date')).toHaveText('2026-09-25', { timeout: 60000 });
    await expect(row).toContainText('ベンチ外');
    await expect(row).toContainText('2026-09-24');
    await expect(row).not.toContainText('手動先発');
    await preview.screenshot({ path: `test-results/rest-preview-${width}.png` });
    await panel.screenshot({ path: `test-results/rest-policy-${width}.png` });
    await panel
      .getByRole('combobox', { name: '個別設定する投手', exact: true })
      .selectOption('player-a-11');
    await panel
      .getByRole('combobox', { name: '個別条件の使い方', exact: true })
      .selectOption('inherit');
    await save.click();
    await expect(row).toContainText('通常救援');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  });
}
