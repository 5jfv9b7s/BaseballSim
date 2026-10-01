import { test, expect } from '@playwright/test';

for (const width of [1280, 390]) {
  test(
    '野手休養：条件編集・不足理由・手動優先・保存復帰・開始時固定 (' + width + 'px)',
    async ({ page }) => {
      test.setTimeout(120000);
      await page.setViewportSize({ width, height: 960 });
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.addInitScript(() => {
        const original = Worker.prototype.postMessage;
        Worker.prototype.postMessage = function (message: unknown, options?: unknown) {
          const data = message as { kind?: string; localWorldId?: string };
          if (data.kind === 'advance' && data.localWorldId === 'v02-local')
            setTimeout(
              () => original.call(this, message, options as StructuredSerializeOptions),
              35,
            );
          else original.call(this, message, options as StructuredSerializeOptions);
        };
      });
      await page.goto('/');
      await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
      const panel = page.getByRole('region', { name: '野手の休養方針', exact: true });
      const open = () =>
        panel.getByText('野手の休養条件と当日オーダーを確認・編集', { exact: true }).click();
      await open();
      const row = panel.getByTestId('fielder-rest-player-a-01');
      const fatigue = panel.getByRole('spinbutton', { name: '野手の疲労以上', exact: true });
      const save = panel.getByRole('button', { name: '野手の休養方針を確定して保存', exact: true });
      await expect(row).toContainText('休養条件なし');
      await fatigue.fill('0');
      await expect(row).toContainText('休養条件なし'); // 下書きは判定を変更しない。
      await save.click();
      await expect(panel).toContainText('保存済み方針版：2');
      await expect(row).toContainText('控えが不足');
      await expect(row.getByTestId('outcome')).toHaveText('スタメン');
      const editor = page.getByRole('region', { name: '球団運営', exact: true });
      await editor.getByText('打順・守備・投手起用を編集', { exact: true }).click();
      await editor
        .getByRole('button', { name: 'この打順を今日だけ指定して保存', exact: true })
        .click();
      await expect(row).toContainText('当日の手動オーダーを優先');
      await editor.getByRole('button', { name: '今日の指定を解除', exact: true }).click();
      await expect(row).toContainText('控えが不足');
      await page.reload();
      await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
      await page.getByRole('button', { name: '自動保存を読み込む', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('読み込みました');
      await open();
      await expect(fatigue).toHaveValue('0');
      await expect(row).toContainText('控えが不足');
      const before = await row.innerText();
      const run = page.getByRole('button', { name: '1日を自動進行', exact: true });
      await run.click();
      await page.getByRole('button', { name: '日次進行を一時停止', exact: true }).click();
      await expect(run).toBeEnabled();
      await expect(fatigue).toBeDisabled();
      expect(await row.innerText()).toBe(before);
      await panel.screenshot({ path: 'test-results/fielder-rest-' + width + '.png' });
      await run.click();
      await expect(page.getByTestId('world-date')).toHaveText('2026-09-25', { timeout: 60000 });
      await expect(fatigue).toBeEnabled();
      await panel
        .getByRole('combobox', { name: '野手の自動休養', exact: true })
        .selectOption('off');
      await save.click();
      await expect(panel).toContainText('保存済み方針版：3');
      await expect(row).toContainText('休養条件なし');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(errors).toEqual([]);
    },
  );
}
