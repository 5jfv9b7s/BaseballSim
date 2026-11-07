import { expect, test } from '@playwright/test';

test('自動進行：まとめ要求を使い、待機画面で停止を覆わず1応答で一時停止できる', async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const NativeWorker = Worker;
    Reflect.set(window, 'matchProgressChecks', []);
    window.Worker = class extends NativeWorker {
      private readonly isWorld: boolean;
      private awaitingBatch = false;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.isWorld = String(url).includes('world-worker');
        if (this.isWorld)
          this.addEventListener('message', ({ data }) => {
            if (!this.awaitingBatch || !data.view) return;
            this.awaitingBatch = false;
            const pause = [...document.querySelectorAll('button')].find(
              (button) => button.textContent === '進行を一時停止',
            );
            Reflect.get(window, 'matchProgressChecks').push({ kind: 'response', paused: !!pause });
            // 次の自動要求が組み立てられる前に、利用者と同じ停止操作を行う。
            pause?.click();
          });
      }
      override postMessage(
        message: unknown,
        options?: Transferable[] | StructuredSerializeOptions,
      ) {
        if (
          this.isWorld &&
          message &&
          typeof message === 'object' &&
          'kind' in message &&
          message.kind === 'advanceBatch'
        ) {
          this.awaitingBatch = true;
          Reflect.get(window, 'matchProgressChecks').push({
            kind: 'send',
            message,
            overlay: !!document.querySelector('.loading-dialog[open]'),
          });
        }
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
  });
  await page.goto('/');
  await expect(page.locator('.title-primary')).toBeEnabled({ timeout: 45000 });
  await page.getByRole('button', { name: 'はじめから', exact: true }).click();
  await page.getByRole('button', { name: '新しい日程を準備', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'クラブハウス', exact: true })).toBeVisible({
    timeout: 30000,
  });
  const date = await page.getByTestId('main-date').getAttribute('datetime');
  await page.getByRole('button', { name: '今日の試合へ', exact: true }).click();
  await page.getByRole('button', { name: '1日を自動進行', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Reflect.get(window, 'matchProgressChecks').filter(
            (item: { kind: string }) => item.kind === 'response',
          ).length,
      ),
    )
    .toBe(1);
  await expect(page.getByRole('button', { name: '進行を一時停止', exact: true })).toHaveCount(0);
  await expect(page.locator('.loading-dialog')).not.toBeVisible();
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', date!);
  const checks = await page.evaluate(() => Reflect.get(window, 'matchProgressChecks'));
  expect(checks.filter((item: { kind: string }) => item.kind === 'send')).toEqual([
    expect.objectContaining({
      overlay: false,
      message: expect.objectContaining({ kind: 'advanceBatch', count: 25, batches: 4 }),
    }),
  ]);
  expect(checks).toContainEqual({ kind: 'response', paused: true });
  expect(errors).toEqual([]);
});
