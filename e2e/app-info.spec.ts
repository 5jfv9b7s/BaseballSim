import { test, expect } from '@playwright/test';
import packageInfo from '../package.json' with { type: 'json' };
import { RELEASE_NOTES } from '../src/ui/release-notes.ts';

const version = packageInfo.version;

for (const width of [1280, 390]) {
  test(
    '利用案内：版・保存への影響・開閉で進行や保存を変更しない (' + width + 'px)',
    async ({ page }) => {
      test.setTimeout(60000);
      expect(RELEASE_NOTES[0].version).toBe(version);
      await page.setViewportSize({ width, height: 960 });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(() => {
        const original = Worker.prototype.postMessage;
        Reflect.set(window, 'guideWorldCommands', 0);
        Worker.prototype.postMessage = function (message: unknown, options?: unknown) {
          if (message && typeof message === 'object' && 'localWorldId' in message) {
            Reflect.set(
              window,
              'guideWorldCommands',
              Reflect.get(window, 'guideWorldCommands') + 1,
            );
          }
          if (
            message &&
            typeof message === 'object' &&
            'kind' in message &&
            message.kind === 'save' &&
            'localWorldId' in message
          ) {
            // 表示の確認用に指示の送信だけを遅らせる。実保存・世界計算は通常どおり。
            setTimeout(
              () => original.call(this, message, options as StructuredSerializeOptions),
              800,
            );
          } else original.call(this, message, options as StructuredSerializeOptions);
        };
      });
      await page.goto('/');
      const guide = page.getByRole('complementary', { name: 'バージョンと利用案内', exact: true });
      await expect(guide.locator('summary')).toHaveText('開発版 ' + version + '・利用案内');
      await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
      const save = page.getByRole('button', { name: '世界を手動保存', exact: true });
      await save.click();
      await expect(page.getByRole('status')).toContainText('世界を手動保存しています');
      await expect(save).toBeDisabled();
      await expect(page.getByRole('status')).toContainText('世界全体を手動保存', {
        timeout: 30000,
      });
      const commands = await page.evaluate(() => Reflect.get(window, 'guideWorldCommands'));
      const date = await page.getByTestId('world-date').innerText();
      const status = await page.getByRole('status').innerText();
      await guide.locator('summary').focus();
      await page.keyboard.press('Enter');
      await expect(
        guide.getByRole('heading', { name: '保存して続きを遊ぶ', exact: true }),
      ).toBeVisible();
      await expect(guide).toContainText('保存への影響');
      await expect(guide).toContainText('問い合わせ窓口は公開準備中');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await guide.screenshot({ path: 'test-results/app-info-' + width + '.png' });
      await guide.locator('summary').click();
      await expect(
        guide.getByRole('heading', { name: '保存して続きを遊ぶ', exact: true }),
      ).toBeHidden();
      expect(await page.evaluate(() => Reflect.get(window, 'guideWorldCommands'))).toBe(commands);
      await expect(page.getByTestId('world-date')).toHaveText(date);
      expect(await page.getByRole('status').innerText()).toBe(status);
      await expect(
        page.getByRole('button', { name: '日次進行を一時停止', exact: true }),
      ).toBeDisabled();
      await page.getByRole('button', { name: '1試合シミュレーション', exact: true }).click();
      await guide.locator('summary').click();
      await expect(guide.getByRole('heading', { name: '最近の更新', exact: true })).toBeVisible();
      expect(errors).toEqual([]);
    },
  );
}
