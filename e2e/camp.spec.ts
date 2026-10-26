import { test, expect, type Page } from '@playwright/test';
import type { WorldView } from '../src/world/controller.ts';
import { campSaveFixture } from './support/camp-save.ts';
test.setTimeout(180000);
let fixture: Awaited<ReturnType<typeof campSaveFixture>>;
test.beforeAll(async () => {
  fixture = await campSaveFixture();
});
async function observe(page: Page, mode: 'current' | 'failOnce' = 'current') {
  await page.addInitScript((mode) => {
    const NativeWorker = Worker;
    Reflect.set(window, 'trainingCommands', []);
    window.Worker = class extends NativeWorker {
      private lastResponse: any;
      private failOnce = mode === 'failOnce';
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes('world-worker'))
          this.addEventListener('message', (event) => {
            if (!event.data?.view) return;
            this.lastResponse = event.data;
            Reflect.set(window, 'trainingView', event.data.view);
          });
      }
      override postMessage(message: any, options?: Transferable[] | StructuredSerializeOptions) {
        if (message?.localWorldId)
          Reflect.get(window, 'trainingCommands').push(structuredClone(message));
        if (message?.kind === 'setCampPlans' && this.failOnce) {
          this.failOnce = false;
          // UIの保存失敗応答を一度だけ模擬。DBの原子的回復はNodeで実検証。
          setTimeout(
            () =>
              this.dispatchEvent(
                new MessageEvent('message', {
                  data: { ...this.lastResponse, ok: false, error: '練習設定の保存失敗（試験）' },
                }),
              ),
            0,
          );
          return;
        }
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
  }, mode);
  await page.goto('/');
  // Worker/保存領域の初期化完了を待つ。機能操作の検査とは待機境界を分ける。
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24', {
    timeout: 30000,
  });
}
const read = (page: Page) =>
  page.evaluate(() => Reflect.get(window, 'trainingView')) as Promise<WorldView>;
const commands = (page: Page) =>
  page.evaluate(() => Reflect.get(window, 'trainingCommands')) as Promise<unknown[]>;
async function openTraining(page: Page) {
  await page
    .getByRole('navigation', { name: 'メインメニュー', exact: true })
    .getByRole('button', { name: 'チーム', exact: true })
    .click();
  await page
    .getByRole('navigation', { name: 'サブメニュー', exact: true })
    .getByRole('button', { name: '育成・練習', exact: true })
    .click();
}
const home = (page: Page) =>
  page
    .getByRole('navigation', { name: 'メインメニュー', exact: true })
    .getByRole('button', { name: 'ホーム', exact: true })
    .click();

for (const width of [1280, 390, 320])
  test(`キャンプ：通常との独立・一括編集・離脱保存・実履歴 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await observe(page);
    const before = await read(page);
    await openTraining(page);
    const panel = page.getByRole('region', { name: '育成・練習設定', exact: true });
    const camp = page.getByRole('region', { name: 'キャンプ専用設定', exact: true });
    await expect(camp).toContainText('開始前');
    await expect(camp).toContainText('2026-09-25〜2026-09-26');
    await camp
      .getByRole('combobox', { name: 'キャンプ練習強度', exact: true })
      .selectOption('hard');
    await expect(panel.getByRole('status')).toContainText('キャンプ設定を編集中');
    await panel.getByRole('combobox', { name: '練習強度', exact: true }).selectOption('light');
    const squad = before.definitions.squads.find(
      (s) => s.squadId === before.management!.controlledSquadId,
    )!;
    const [first, second] = squad.players;
    await panel
      .getByRole('checkbox', {
        name: `${second!.familyName} ${second!.givenName}を一括選択`,
        exact: true,
      })
      .check();
    await expect(camp.getByRole('combobox', { name: 'キャンプ練習強度', exact: true })).toHaveValue(
      '',
    );
    await camp
      .getByRole('combobox', { name: 'キャンプ練習強度', exact: true })
      .selectOption('rest');
    expect(await commands(page)).toHaveLength(0);
    expect(await read(page)).toEqual(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await camp.screenshot({ path: `.tmp/camp-qa/editor-${width}.png` });
    await home(page);
    await expect(page.getByRole('heading', { name: 'クラブハウス', exact: true })).toBeVisible();
    const saved = await read(page);
    expect(saved.training!.revision).toBe(1);
    expect(saved.camp!.revision).toBe(1);
    expect(saved.training!.plans[first!.playerId]!.intensity).toBe('light');
    expect(saved.training!.plans[second!.playerId]).toEqual(
      before.training!.plans[second!.playerId],
    );
    for (const id of [first!.playerId, second!.playerId])
      expect(saved.camp!.periods[0]!.plans[id]!.intensity).toBe('rest');
    expect((await commands(page)).map((c) => (c as { kind: string }).kind)).toEqual([
      'setTrainingPlans',
      'setCampPlans',
    ]);
    expect(saved.growth).toEqual(before.growth);
    expect(saved.stats).toEqual(before.stats);
    await page
      .getByRole('navigation', { name: 'メインメニュー', exact: true })
      .getByRole('button', { name: 'システム', exact: true })
      .click();
    await page.getByText('ファイルのバックアップ・別プレイの復元', { exact: true }).click();
    await page
      .getByLabel('取り込む保存ファイル', { exact: true })
      .setInputFiles({ name: 'camp.bssave', mimeType: 'application/zip', buffer: fixture.buffer });
    await page.getByRole('button', { name: '別プレイとして取り込む', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('別プレイとして取り込みました', {
      timeout: 60000,
    });
    await page.getByRole('button', { name: '選んだプレイを開く', exact: true }).click();
    await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-26', {
      timeout: 60000,
    });
    await openTraining(page);
    await expect(camp).toContainText('キャンプ中');
    await page.getByText('キャンプ爆発の記録（1件）', { exact: true }).click();
    const record = page.locator('.camp-results');
    await expect(record).toContainText('2026-09-25');
    const actual = (await read(page)).growth!.campBursts!;
    expect(actual).toEqual(fixture.events);
    const count = (await commands(page)).length;
    await record.screenshot({ path: `.tmp/camp-qa/results-${width}.png` });
    await home(page);
    expect((await commands(page)).length).toBe(count);
    expect(errors).toEqual([]);
  });

test('キャンプ：通常保存後に専用保存が失敗しても画面と下書きを維持して再試行', async ({ page }) => {
  await observe(page, 'failOnce');
  await openTraining(page);
  const camp = page.getByRole('region', { name: 'キャンプ専用設定', exact: true });
  await page.getByRole('combobox', { name: '練習強度', exact: true }).selectOption('light');
  await camp.getByRole('combobox', { name: 'キャンプ練習強度', exact: true }).selectOption('hard');
  await home(page);
  await expect(page.getByRole('alert')).toContainText('練習設定の保存失敗');
  await expect(camp.getByRole('combobox', { name: 'キャンプ練習強度', exact: true })).toHaveValue(
    'hard',
  );
  expect((await read(page)).training!.revision).toBe(1);
  expect((await read(page)).camp!.revision).toBe(0);
  await home(page);
  await expect(page.getByRole('heading', { name: 'クラブハウス', exact: true })).toBeVisible();
  expect((await read(page)).training!.revision).toBe(1);
  expect((await read(page)).camp!.revision).toBe(1);
  expect((await commands(page)).map((c) => (c as { kind: string }).kind)).toEqual([
    'setTrainingPlans',
    'setCampPlans',
    'setCampPlans',
  ]);
});
