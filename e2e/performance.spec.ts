import { test, expect } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`試合時能力：原能力との比較・開始時固定・前日と二軍・保存復帰 (${width}px)`, async ({
    page,
  }) => {
    test.setTimeout(150000);
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
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
    const panel = page.getByRole('region', { name: '試合時の能力', exact: true });
    const open = () => panel.getByText('試合前の状態と能力補正を確認', { exact: true }).click();
    await open();
    await expect(panel.getByTestId('performance-status')).toContainText('試合前の見込み');
    const contact = panel.getByTestId('effective-batting.contactVsRight');
    const base = await contact.getByTestId('base').innerText();
    const effective = await contact.getByTestId('effective').innerText();
    expect(Number(effective)).toBeLessThan(Number(base));
    await expect(panel.getByTestId('factor-contact')).toContainText('99.0%');
    const before = await panel.getByTestId('performance-state').innerText();
    const run = page.getByRole('button', { name: '1日を自動進行', exact: true });
    await run.click();
    await page.getByRole('button', { name: '日次進行を一時停止', exact: true }).click();
    await expect(run).toBeEnabled();
    await expect(panel.getByTestId('performance-status')).toContainText('試合開始時の値で確定');
    expect(await panel.getByTestId('performance-state').innerText()).toBe(before);
    await expect(contact.getByTestId('effective')).toHaveText(effective);
    await run.click();
    await expect(page.getByTestId('world-date')).toHaveText('2026-09-25', { timeout: 60000 });
    await expect(contact.getByTestId('base')).toHaveText(base);
    await panel
      .getByRole('combobox', { name: '補正を確認する日', exact: true })
      .selectOption('previous');
    await expect(contact.getByTestId('effective')).toHaveText(effective);
    expect(await panel.getByTestId('performance-state').innerText()).toBe(before);
    await panel
      .getByRole('combobox', { name: '補正を確認するチーム', exact: true })
      .selectOption('hoshihara-farm');
    await expect(panel.getByTestId('performance-status')).toContainText('試合開始時の値で確定');
    await panel
      .getByRole('combobox', { name: '補正を確認するチーム', exact: true })
      .selectOption('hoshihara-first');
    await panel
      .getByRole('combobox', { name: '補正を確認する選手', exact: true })
      .selectOption('player-a-10');
    await expect(panel.getByTestId('factor-control')).toBeVisible();
    await expect(
      panel.getByRole('rowheader', { name: 'ストレート：制球', exact: true }),
    ).toBeVisible();
    await panel.screenshot({ path: `test-results/performance-${width}.png` });
    await page.reload();
    await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
    await page.getByRole('button', { name: '自動保存を読み込む', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('保存した世界を読み込みました');
    await open();
    await panel
      .getByRole('combobox', { name: '補正を確認する日', exact: true })
      .selectOption('previous');
    await expect(contact.getByTestId('effective')).toHaveText(effective);
    await expect(contact.getByTestId('base')).toHaveText(base);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  });
}
