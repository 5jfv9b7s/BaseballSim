import { test, expect, type Page } from '@playwright/test';
import type { WorldView } from '../src/world/controller.ts';
import { rookieSaveFixture } from './support/rookie-save.ts';

test.setTimeout(240000);
let fixture: Awaited<ReturnType<typeof rookieSaveFixture>>;
test.beforeAll(async () => {
  fixture = await rookieSaveFixture();
});
const menu = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'メインメニュー', exact: true })
    .getByRole('button', { name, exact: true })
    .click();
for (const width of [1280, 390, 320])
  test(`ルーキー覚醒：実保存の取込・履歴・選手詳細・閲覧不変 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      const NativeWorker = Worker;
      Reflect.set(window, 'rookieCommands', 0);
      window.Worker = class extends NativeWorker {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options);
          if (String(url).includes('world-worker'))
            this.addEventListener('message', (event) => {
              if (event.data?.view) Reflect.set(window, 'rookieView', event.data.view);
            });
        }
        override postMessage(message: any, options?: Transferable[] | StructuredSerializeOptions) {
          if (message?.localWorldId)
            Reflect.set(window, 'rookieCommands', Reflect.get(window, 'rookieCommands') + 1);
          if (Array.isArray(options)) super.postMessage(message, options);
          else super.postMessage(message, options);
        }
      };
    });
    await page.goto('/');
    await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24', {
      timeout: 60000,
    });
    await menu(page, 'システム');
    await page.getByText('ファイルのバックアップ・別プレイの復元', { exact: true }).click();
    await page.getByLabel('取り込む保存ファイル', { exact: true }).setInputFiles({
      name: 'rookie.bssave',
      mimeType: 'application/zip',
      buffer: fixture.buffer,
    });
    await page.getByRole('button', { name: '別プレイとして取り込む', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('別プレイとして取り込みました', {
      timeout: 60000,
    });
    await page.getByRole('button', { name: '選んだプレイを開く', exact: true }).click();
    await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-25', {
      timeout: 60000,
    });
    const view = await page.evaluate(() => Reflect.get(window, 'rookieView') as WorldView);
    expect(view.modelVersion).toBe('world-prototype-v19');
    expect(view.growth!.rookieAwakening!.events).toEqual(fixture.events);
    const before = await page.evaluate(() => Reflect.get(window, 'rookieCommands'));
    await menu(page, 'チーム');
    await page
      .getByRole('navigation', { name: 'サブメニュー', exact: true })
      .getByRole('button', { name: '育成・練習', exact: true })
      .click();
    await page.getByText('ルーキー覚醒の記録（自球団 2件）', { exact: true }).click();
    const table = page.getByRole('table', { name: '自球団のルーキー覚醒履歴', exact: true });
    await expect(table.locator('tbody tr')).toHaveCount(2);
    const event = fixture.events.find((e) => e.playerId === 'player-h-06')!;
    const player = view.definitions.squads
      .flatMap((s) => s.players)
      .find((p) => p.playerId === event.playerId)!;
    const name = player.familyName + ' ' + player.givenName;
    await table.getByRole('button', { name, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: '状態・成長', exact: true }).click();
    await dialog.getByText('ルーキー覚醒', { exact: true }).click();
    const detail = dialog.getByRole('table', { name: '選手のルーキー覚醒履歴', exact: true });
    const points = (n: number) => (n / 1000).toFixed(3).replace(/\.?0+$/, '');
    await expect(detail.locator('tbody td')).toHaveText([
      event.date,
      points(event.beforeValue),
      points(event.afterValue),
      '+' + points(event.afterValue - event.beforeValue),
    ]);
    await expect(dialog.locator('.rookie-results')).toContainText('2026年プロ入り ／ プロ1年目');
    await dialog
      .locator('.rookie-results')
      .screenshot({ path: `.tmp/rookie-qa/detail-${width}.png` });
    await page.keyboard.press('Escape');
    await table.screenshot({ path: `.tmp/rookie-qa/roster-${width}.png` });
    expect(await page.evaluate(() => Reflect.get(window, 'rookieCommands'))).toBe(before);
    expect(
      (await page.evaluate(() => Reflect.get(window, 'rookieView') as WorldView)).growth,
    ).toEqual(view.growth);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  });
