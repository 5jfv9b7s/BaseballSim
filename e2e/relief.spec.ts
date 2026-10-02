import { test, expect } from '@playwright/test';
for (const width of [1280, 390]) {
  test(
    '救援条件：役割・入力検査・保存復帰・編成独立・登板理由 (' + width + 'px)',
    async ({ page }) => {
      test.setTimeout(180000);
      await page.setViewportSize({ width, height: 960 });
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.addInitScript(() => {
        const original = Worker.prototype.postMessage;
        Worker.prototype.postMessage = function (message: unknown, options?: unknown) {
          const d = message as { kind?: string; localWorldId?: string };
          if (d.kind === 'advance' && d.localWorldId === 'v02-local')
            setTimeout(
              () => original.call(this, message, options as StructuredSerializeOptions),
              35,
            );
          else original.call(this, message, options as StructuredSerializeOptions);
        };
      });
      await page.goto('/');
      await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
      const panel = page.getByRole('region', { name: '救援の役割・登板条件', exact: true });
      const open = () => panel.getByText('救援条件と登板判断を確認・編集', { exact: true }).click();
      await open();
      const save = panel.getByRole('button', { name: '救援条件を確定して保存', exact: true });
      await panel
        .getByRole('combobox', { name: '条件を編集する投手', exact: true })
        .selectOption('player-a-11');
      await panel.getByRole('checkbox', { name: '通常救援を割り当てる', exact: true }).uncheck();
      await panel.getByRole('checkbox', { name: '抑えを割り当てる', exact: true }).check();
      const closer = panel.getByRole('group', { name: '抑えの登板条件', exact: true });
      const start = closer.getByRole('spinbutton', { name: '開始回', exact: true });
      await expect(start).toHaveValue('9');
      await start.fill('13');
      await expect(save).toBeDisabled();
      await expect(panel.getByRole('alert')).toBeVisible();
      await start.fill('9');
      await expect(save).toBeEnabled();
      await closer.getByRole('spinbutton', { name: '同役割内の優先順位', exact: true }).fill('2');
      await save.click();
      await expect(panel).toContainText('保存済み方針版：2');
      await page.reload();
      await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
      await page.getByRole('button', { name: '自動保存を読み込む', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('読み込みました');
      await open();
      await expect(
        panel.getByRole('checkbox', { name: '通常救援を割り当てる', exact: true }),
      ).not.toBeChecked();
      await expect(
        closer.getByRole('spinbutton', { name: '同役割内の優先順位', exact: true }),
      ).toHaveValue('2');
      const editor = page.getByRole('region', { name: '球団運営', exact: true });
      await editor.getByText('打順・守備・投手起用を編集', { exact: true }).click();
      await editor.getByRole('button', { name: '編成を確定して自動保存', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('自動保存');
      await expect(
        panel.getByRole('checkbox', { name: '抑えを割り当てる', exact: true }),
      ).toBeChecked();
      const run = page.getByRole('button', { name: '1日を自動進行', exact: true });
      await run.click();
      await page.getByRole('button', { name: '日次進行を一時停止', exact: true }).click();
      await expect(run).toBeEnabled();
      await expect(start).toBeDisabled();
      await run.click();
      await expect(page.getByTestId('world-date')).toHaveText('2026-09-25', { timeout: 90000 });
      expect(await panel.getByTestId('relief-decision').count()).toBeGreaterThan(0);
      await panel.getByTestId('relief-decision').first().locator('summary').click();
      await expect(panel.getByTestId('relief-decision').first()).toContainText('点差');
      await panel.screenshot({ path: 'test-results/relief-' + width + '.png' });
      await page.reload();
      await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
      await page.getByRole('button', { name: '自動保存を読み込む', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('読み込みました');
      await open();
      expect(await panel.getByTestId('relief-decision').count()).toBeGreaterThan(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(errors).toEqual([]);
    },
  );
}
