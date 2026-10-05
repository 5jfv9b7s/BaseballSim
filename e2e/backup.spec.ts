import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

for (const width of [1280, 390]) {
  test(
    '保存ファイル：書出し・別プレイ復元・元保存保護・別端末読込 (' + width + 'px)',
    async ({ page, browser }) => {
      test.setTimeout(240000);
      await page.setViewportSize({ width, height: 960 });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/');
      await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
      const date = page.getByTestId('world-date');
      await page.getByRole('button', { name: '1日を自動進行', exact: true }).click();
      await expect(date).toHaveText('2026-09-25', { timeout: 60000 });
      const panel = page.getByRole('region', { name: '世界の保存', exact: true });
      await panel.getByRole('button', { name: '世界を手動保存', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('世界全体を手動保存', {
        timeout: 30000,
      });
      await panel.getByText('ファイルのバックアップ・別プレイの復元', { exact: true }).click();
      const downloadPromise = page.waitForEvent('download');
      await panel.getByRole('button', { name: '保存ファイルを書き出す', exact: true }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe('BaseballSim-manual.bssave');
      const bytes = await readFile((await download.path())!);
      expect(bytes.subarray(0, 4).toString('hex')).toBe('504b0304');
      await expect(page.getByRole('status')).toContainText(
        '保存済みの時点をファイルへ書き出しました',
      );

      await page.getByText('新規日程・担当球団と試作の範囲', { exact: true }).click();
      await page.getByRole('button', { name: '新しい日程を準備', exact: true }).click();
      await expect(date).toHaveText('2026-09-24');
      await panel.getByLabel('取り込む保存ファイル', { exact: true }).setInputFiles({
        name: 'broken.bssave',
        mimeType: 'application/zip',
        buffer: Buffer.from('broken'),
      });
      await panel.getByRole('button', { name: '別プレイとして取り込む', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText('容量', { timeout: 30000 });
      await expect(date).toHaveText('2026-09-24');
      await panel
        .getByLabel('取り込む保存ファイル', { exact: true })
        .setInputFiles({ name: 'backup.bssave', mimeType: 'application/zip', buffer: bytes });
      await panel.getByRole('button', { name: '別プレイとして取り込む', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('別プレイとして取り込みました', {
        timeout: 30000,
      });
      await expect(date).toHaveText('2026-09-24');
      await expect(panel).toContainText('作業状態には未保存の変更');
      const plays = panel.getByRole('combobox', { name: '保存済みプレイ', exact: true });
      const imported = await plays.inputValue();
      expect(imported.startsWith('import-')).toBe(true);
      await expect(
        panel.getByRole('button', { name: '選んだプレイを開く', exact: true }),
      ).toBeDisabled();
      await panel.getByRole('button', { name: '世界を手動保存', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('世界全体を手動保存', {
        timeout: 30000,
      });
      await panel.getByRole('button', { name: '選んだプレイを開く', exact: true }).click();
      await expect(date).toHaveText('2026-09-25', { timeout: 30000 });
      await expect(
        page.getByRole('button', { name: '日次進行を一時停止', exact: true }),
      ).toBeDisabled();
      await page.getByRole('button', { name: '1日を自動進行', exact: true }).click();
      await expect(date).toHaveText('2026-09-26', { timeout: 60000 });
      await plays.selectOption('v02-local');
      await panel.getByRole('combobox', { name: '開く保存枠', exact: true }).selectOption('manual');
      await panel.getByRole('button', { name: '選んだプレイを開く', exact: true }).click();
      await expect(date).toHaveText('2026-09-24', { timeout: 30000 });

      await page.reload();
      await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
      await panel.getByText('ファイルのバックアップ・別プレイの復元', { exact: true }).click();
      await plays.selectOption(imported);
      await panel.getByRole('combobox', { name: '開く保存枠', exact: true }).selectOption('auto');
      await panel.getByRole('button', { name: '選んだプレイを開く', exact: true }).click();
      await expect(date).toHaveText('2026-09-26', { timeout: 30000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await panel.screenshot({ path: 'test-results/backup-' + width + '.png' });

      // 別ブラウザ領域には元端末のDB・共有ブロックが存在しない。
      const independent = await browser.newContext({ viewport: { width, height: 960 } });
      try {
        const receiver = await independent.newPage();
        receiver.on('pageerror', (error) => errors.push(error.message));
        await receiver.goto(new URL('/', page.url()).href);
        await receiver.getByRole('button', { name: '日程・球団運営', exact: true }).click();
        await receiver.getByText('ファイルのバックアップ・別プレイの復元', { exact: true }).click();
        await receiver.getByLabel('取り込む保存ファイル', { exact: true }).setInputFiles({
          name: 'other-device.bssave',
          mimeType: 'application/zip',
          buffer: bytes,
        });
        await receiver.getByRole('button', { name: '別プレイとして取り込む', exact: true }).click();
        await expect(receiver.getByRole('status')).toContainText('別プレイとして取り込みました', {
          timeout: 30000,
        });
        await receiver.getByRole('button', { name: '選んだプレイを開く', exact: true }).click();
        await expect(receiver.getByTestId('world-date')).toHaveText('2026-09-25', {
          timeout: 30000,
        });
        await receiver.getByRole('button', { name: '世界を手動保存', exact: true }).click();
        await expect(receiver.getByRole('status')).toContainText('世界全体を手動保存', {
          timeout: 30000,
        });
      } finally {
        await independent.close();
      }
      expect(errors).toEqual([]);
    },
  );
}
