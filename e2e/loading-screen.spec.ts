import { expect, test, type Page } from '@playwright/test';
import type { WorldWorkerMessage } from '../src/world-worker.ts';

/** 本番の世界を進めず、独立したブラウザーの起動・読込だけを観測する。 */
async function observeLoading(page: Page) {
  await page.addInitScript(() => {
    const NativeWorker = Worker;
    Reflect.set(window, 'loadingChecks', []);
    window.Worker = class extends NativeWorker {
      private readonly isWorld: boolean;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.isWorld = String(url).includes('world-worker');
        if (this.isWorld)
          this.addEventListener('message', ({ data }: MessageEvent<WorldWorkerMessage>) => {
            if ('kind' in data) Reflect.get(window, 'loadingChecks').push(data);
          });
      }
      override postMessage(
        message: unknown,
        options?: Transferable[] | StructuredSerializeOptions,
      ) {
        if (this.isWorld && message && typeof message === 'object' && 'kind' in message) {
          const dialog = document.querySelector<HTMLDialogElement>('.loading-dialog[open]');
          const rect = dialog?.getBoundingClientRect();
          Reflect.get(window, 'loadingChecks').push({
            kind: 'send',
            operation: message.kind,
            open: Boolean(dialog),
            fullScreen: Boolean(
              rect && rect.width >= innerWidth - 1 && rect.height >= innerHeight - 1,
            ),
            hiddenAncestor: Boolean(dialog?.closest('[hidden]')),
          });
        }
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
  });
}

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.locator('.title-primary')).toBeEnabled({ timeout: 45000 });
  await expect(page.locator('.loading-dialog')).not.toBeVisible();
}

test('ローディング：起動と実保存の読込前に表示し、実工程の通知後に閉じる', async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await observeLoading(page);
  await ready(page);
  await page.getByRole('button', { name: 'はじめから', exact: true }).click();
  await page.getByRole('button', { name: '新しい日程を準備', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'クラブハウス', exact: true })).toBeVisible({
    timeout: 30000,
  });
  await expect(page.locator('.loading-dialog')).not.toBeVisible();
  await page
    .getByRole('navigation', { name: 'メインメニュー', exact: true })
    .getByRole('button', { name: 'システム', exact: true })
    .click();
  await page.getByRole('button', { name: 'タイトル画面へ', exact: true }).click();
  await page.getByRole('button', { name: '続きから', exact: true }).first().click();
  const savedPlay = page.getByRole('combobox', { name: '保存済みプレイ', exact: true });
  await expect(savedPlay.locator('option')).toHaveCount(2);
  const id = await savedPlay.locator('option').nth(1).getAttribute('value');
  await savedPlay.selectOption(id!);
  await page.getByRole('button', { name: '選んだプレイを開く', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'クラブハウス', exact: true })).toBeVisible({
    timeout: 30000,
  });
  await expect(page.locator('.loading-dialog')).not.toBeVisible();
  const checks = await page.evaluate(() => Reflect.get(window, 'loadingChecks'));
  expect(checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: 'send',
        operation: 'query',
        open: true,
        fullScreen: true,
        hiddenAncestor: false,
      }),
      expect.objectContaining({ kind: 'send', operation: 'new', open: true, fullScreen: true }),
      expect.objectContaining({
        kind: 'send',
        operation: 'openPlay',
        open: true,
        fullScreen: true,
      }),
      expect.objectContaining({
        kind: 'workProgress',
        operation: 'openPlay',
        progress: expect.objectContaining({ stage: 'decode', completed: 0 }),
      }),
      expect.objectContaining({
        kind: 'workProgress',
        operation: 'openPlay',
        progress: expect.objectContaining({ stage: 'validate' }),
      }),
    ]),
  );
  expect(
    checks
      .filter((c: { kind: string }) => c.kind === 'send')
      .every((c: { open: boolean }) => c.open),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('ローディング：狭い画面でも全画面で回転表示し、起動後に解除する', async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 390, height: 760 });
  await observeLoading(page);
  // 初回応答を少し遅らせ、表示とアニメーションを確実に観測する。結果計算は変更しない。
  await page.addInitScript(() => {
    const original = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (
      message: unknown,
      options?: Transferable[] | StructuredSerializeOptions,
    ) {
      const send = () =>
        original.call(this, message, Array.isArray(options) ? { transfer: options } : options);
      if (message && typeof message === 'object' && 'kind' in message && message.kind === 'query')
        setTimeout(send, 1500);
      else send();
    };
  });
  await page.goto('/');
  const dialog = page.locator('.loading-dialog');
  await expect(dialog).toBeVisible({ timeout: 45000 });
  const state = await dialog.evaluate((element) => {
    const spinner = element.querySelector('.loading-spinner')!;
    const rect = element.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      animation: getComputedStyle(spinner).animationName,
    };
  });
  expect(state).toEqual({ width: 390, height: 760, animation: 'loading-spin' });
  await expect(page.locator('.title-primary')).toBeEnabled({ timeout: 30000 });
  await expect(dialog).not.toBeVisible();
});

test('ローディング：Workerエラーで閉じてエラーと再読込の案内を表示する', async ({ page }) => {
  test.setTimeout(60000);
  await page.addInitScript(() => {
    const NativeWorker = Worker;
    window.Worker = class extends NativeWorker {
      private readonly isWorld: boolean;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.isWorld = String(url).includes('world-worker');
      }
      override postMessage(
        message: unknown,
        options?: Transferable[] | StructuredSerializeOptions,
      ) {
        if (this.isWorld) {
          setTimeout(
            () => this.dispatchEvent(new ErrorEvent('error', { message: 'loading test' })),
            150,
          );
          return;
        }
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Workerでエラー', { timeout: 45000 });
  await expect(page.getByRole('alert')).toContainText('再読み込み');
  await expect(page.locator('.loading-dialog')).not.toBeVisible();
});
