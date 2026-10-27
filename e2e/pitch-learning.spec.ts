import { test, expect, type Page } from '@playwright/test';
import type { WorldView } from '../src/world/controller.ts';
import { pitchNames } from '../src/data/pitch-types/index.ts';

test.setTimeout(180000);
async function observe(page: Page) {
  await page.addInitScript(() => {
    const Native = Worker;
    Reflect.set(window, 'learningCommands', []);
    window.Worker = class extends Native {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes('world-worker'))
          this.addEventListener('message', (event) => {
            if (event.data?.view) Reflect.set(window, 'learningView', event.data.view);
          });
      }
      override postMessage(message: any, options?: Transferable[] | StructuredSerializeOptions) {
        if (message?.localWorldId)
          Reflect.get(window, 'learningCommands').push(structuredClone(message));
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
  });
  await page.goto('/');
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24', {
    timeout: 30000,
  });
}
const read = (page: Page) =>
  page.evaluate(() => Reflect.get(window, 'learningView')) as Promise<WorldView>;
const count = (page: Page) =>
  page.evaluate(() => Reflect.get(window, 'learningCommands').length) as Promise<number>;
const menu = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'メインメニュー', exact: true })
    .getByRole('button', { name, exact: true })
    .click();
async function training(page: Page) {
  await menu(page, 'チーム');
  await page
    .getByRole('navigation', { name: 'サブメニュー', exact: true })
    .getByRole('button', { name: '育成・練習', exact: true })
    .click();
}
for (const width of [1280, 390, 320])
  test(`球種習得：設定・日次実績・詳細・復帰と閲覧不変 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await observe(page);
    const initial = await read(page);
    const squad = initial.definitions.squads[0]!;
    const pitch = squad.pitches.find((p) => p.acquisitionProgressMilli === 0)!;
    const player = squad.players.find((p) => p.playerId === pitch.playerId)!;
    const name = `${player.familyName} ${player.givenName}`;
    await training(page);
    const panel = page.getByRole('region', { name: '育成・練習設定', exact: true });
    await panel.getByRole('button', { name, exact: true }).click();
    const learning = panel.getByRole('region', { name: '新球種の習得状況', exact: true });
    await expect(learning).toContainText('0.0%');
    await expect(learning).toContainText('未習得・試合では使用不可');
    const target = panel.getByRole('combobox', { name: '練習対象', exact: true });
    await expect(
      target.locator('option').filter({ hasText: pitchNames[pitch.pitchTypeCode] + '・制球' }),
    ).toHaveCount(0);
    await target.selectOption({ label: pitchNames[pitch.pitchTypeCode] + 'の習得' });
    await menu(page, 'ホーム');
    await expect
      .poll(async () => (await read(page)).training!.plans[pitch.playerId]!.target)
      .toEqual({ kind: 'pitchAcquisition', pitchId: pitch.pitchId });
    await page.getByRole('button', { name: /^今日の試合へ/ }).click();
    await page.getByRole('button', { name: '1日を自動進行', exact: true }).click();
    await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-25', {
      timeout: 60000,
    });
    const after = await read(page),
      state = after.growth!.pitchLearning!.acquisition[pitch.pitchId]!;
    expect(state.progressMilli).toBeGreaterThanOrEqual(0);
    expect(after.growth!.pitchLearning!.latest.some((o) => o.pitchId === pitch.pitchId)).toBe(true);
    await training(page);
    await panel.getByRole('button', { name, exact: true }).click();
    await expect(learning.getByRole('progressbar')).toHaveAttribute(
      'value',
      String(state.progressMilli),
    );
    const beforeCount = await count(page);
    await learning.getByText('球種習得の対応範囲', { exact: true }).click();
    await panel.getByRole('button', { name: '選手詳細を開く', exact: true }).click();
    const detail = page.getByRole('dialog');
    await expect(
      detail.getByRole('region', { name: '新球種の習得状況', exact: true }),
    ).toContainText('未習得');
    await page.keyboard.press('Escape');
    expect(await count(page)).toBe(beforeCount);
    expect((await read(page)).growth).toEqual(after.growth);
    await panel.screenshot({ path: `.tmp/pitch-learning/ui-${width}.png` });
    await learning.screenshot({ path: `.tmp/pitch-learning/progress-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (width === 1280) {
      await menu(page, 'システム');
      await page.getByRole('button', { name: '世界を手動保存', exact: true }).click();
      await expect(
        page.getByRole('button', { name: '手動保存を読み込む', exact: true }),
      ).toBeEnabled({ timeout: 30000 });
      await page.reload();
      await page.getByRole('button', { name: 'セーブから再開 →', exact: true }).click();
      await page.getByRole('button', { name: '手動保存を読み込む', exact: true }).click();
      await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-25', {
        timeout: 30000,
      });
      expect((await read(page)).growth!.pitchLearning).toEqual(after.growth!.pitchLearning);
    }
    expect(errors).toEqual([]);
  });

test('習得済みの実保存：習得日・通常能力練習・総括の別記録を表示', async ({ page }) => {
  const { pitchLearningSaveFixture } = await import('./support/pitch-learning-save.ts');
  const fixture = await pitchLearningSaveFixture();
  await observe(page);
  await menu(page, 'システム');
  await page.getByText('ファイルのバックアップ・別プレイの復元', { exact: true }).click();
  await page.getByLabel('取り込む保存ファイル', { exact: true }).setInputFiles({
    name: 'learning.bssave',
    mimeType: 'application/zip',
    buffer: fixture.buffer,
  });
  await page.getByRole('button', { name: '別プレイとして取り込む', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('別プレイとして取り込みました', {
    timeout: 60000,
  });
  await page.getByRole('button', { name: '選んだプレイを開く', exact: true }).click();
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-28', {
    timeout: 60000,
  });
  const view = await read(page);
  expect(view.growth!.pitchLearning!.acquisition[fixture.pitchId]).toEqual({
    progressMilli: 100000,
    acquiredOn: '2026-09-24',
  });
  await menu(page, '成績');
  await page.getByRole('button', { name: 'シーズン総括', exact: true }).click();
  const records = page.getByRole('region', { name: '今季の新球種習得', exact: true });
  await expect(
    records.getByRole('table', { name: '新球種の習得記録', exact: true }).locator('tbody tr'),
  ).toHaveCount(1);
  await expect(records).toContainText('2026-09-24');
  const before = await count(page);
  await records.getByRole('button').click();
  const detail = page.getByRole('dialog');
  await expect(detail.getByRole('region', { name: '新球種の習得状況', exact: true })).toContainText(
    '100.0%',
  );
  await expect(detail).toContainText('習得日：');
  await page.keyboard.press('Escape');
  expect(await count(page)).toBe(before);
});
