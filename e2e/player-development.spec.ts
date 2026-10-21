import { test, expect, type Page } from '@playwright/test';
import type { WorldView } from '../src/world/controller.ts';

async function observe(page: Page, mode: 'current' | 'legacy' | 'boundary' = 'current') {
  await page.addInitScript((mode) => {
    const NativeWorker = Worker;
    Reflect.set(window, 'developmentCommands', 0);
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes('world-worker'))
          this.addEventListener('message', (event) => {
            const view = event.data?.view;
            if (!view) return;
            // 表示投影のみ。Workerの正本やIndexedDBは変更しない。
            if (mode === 'legacy') {
              view.definitions.version = 'world-definitions-v18';
              delete view.definitions.playerDevelopment;
            } else if (mode === 'boundary') {
              view.definitions.squads[0].players[0].batting.contactVsRight.valueMilli = 89999;
            }
            Reflect.set(window, 'developmentView', view);
          });
      }
      override postMessage(
        message: unknown,
        options?: Transferable[] | StructuredSerializeOptions,
      ) {
        if (message && typeof message === 'object' && 'localWorldId' in message)
          Reflect.set(
            window,
            'developmentCommands',
            Reflect.get(window, 'developmentCommands') + 1,
          );
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
  }, mode);
  await page.goto('/');
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24');
}

async function openFirstPlayer(page: Page) {
  const view = (await page.evaluate(() => Reflect.get(window, 'developmentView'))) as WorldView;
  const player = view.definitions.squads[0]!.players[0]!;
  const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
  await nav.getByRole('button', { name: 'チーム', exact: true }).click();
  await page
    .getByRole('region', { name: '選手一覧', exact: true })
    .getByRole('button', { name: `${player.familyName} ${player.givenName}`, exact: true })
    .click();
  return { view, player, detail: page.getByRole('dialog') };
}

for (const width of [1280, 390, 320]) {
  test(`能力：22項目・適性・特性 (${width}px)`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await observe(page);
    const { view, player, detail } = await openFirstPlayer(page);
    expect(view.definitions.version).toBe('world-definitions-v20');
    const before = await page.evaluate(() => Reflect.get(window, 'developmentCommands'));
    const table = detail.getByRole('table', { name: '選手の基本能力', exact: true });
    const group = detail.getByRole('combobox', { name: '能力の分野', exact: true });
    await expect(table.locator('tbody tr')).toHaveCount(22);
    await expect(table.locator('.ability-support')).toHaveCount(11);
    await expect(detail.getByRole('meter')).toHaveCount(22);
    await expect(table).not.toContainText('記録なし');
    await expect(detail).toContainText('架空の動作確認用');
    await expect(detail.getByRole('meter', { name: '対右ミート', exact: true })).toHaveAttribute(
      'value',
      String(player.batting.contactVsRight.valueMilli / 1000),
    );
    await group.selectOption('batting');
    await expect(table.locator('tbody tr')).toHaveCount(6);
    await expect(table).toContainText('バント技術');
    await detail.screenshot({ path: `.tmp/player-development-qa/abilities-${width}.png` });
    await group.selectOption('catching');
    await expect(table.locator('tbody tr')).toHaveCount(3);
    await expect(table).toContainText('フレーミング');
    await group.selectOption('physical');
    await expect(table.locator('tbody tr')).toHaveCount(3);
    await detail.getByText('守備適性・習熟（9位置）', { exact: true }).click();
    const positions = detail.getByRole('table', { name: '選手の守備適性・習熟', exact: true });
    await expect(positions.locator('tbody tr')).toHaveCount(9);
    await expect(positions.locator('tbody th')).toHaveText([
      'P',
      'C',
      '1B',
      '2B',
      '3B',
      'SS',
      'LF',
      'CF',
      'RF',
    ]);
    await positions.locator('thead').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await detail.screenshot({ path: `.tmp/player-development-qa/positions-${width}.png` });
    await detail.getByRole('button', { name: '状態・成長', exact: true }).click();
    const input = view.definitions.playerDevelopment!.players.find(
      (p) => p.playerId === player.playerId,
    )!;
    await expect(detail.getByRole('meter', { name: '才能', exact: true })).toHaveAttribute(
      'value',
      String(input.growthProfile.talentMilli / 1000),
    );
    await expect(detail.getByRole('meter', { name: '向上心', exact: true })).toHaveAttribute(
      'value',
      String(input.growthProfile.ambitionMilli / 1000),
    );
    await expect(detail).toContainText('成長履歴は工事中');
    await detail.screenshot({ path: `.tmp/player-development-qa/growth-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(await page.evaluate(() => Reflect.get(window, 'developmentCommands'))).toBe(before);
    expect(await page.evaluate(() => Reflect.get(window, 'developmentView'))).toEqual(view);
    await page.keyboard.press('Escape');
    await expect(detail).toHaveCount(0);
    if (width === 1280) {
      await page
        .getByRole('navigation', { name: 'メインメニュー', exact: true })
        .getByRole('button', { name: 'システム', exact: true })
        .click();
      await page.getByRole('button', { name: '世界を手動保存', exact: true }).click();
      await expect(
        page.getByRole('button', { name: '手動保存を読み込む', exact: true }),
      ).toBeEnabled({ timeout: 30000 });
      await page.reload();
      await page.getByRole('button', { name: 'セーブから再開 →', exact: true }).click();
      await page.getByRole('button', { name: '手動保存を読み込む', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('保存した世界を読み込みました', {
        timeout: 30000,
      });
      const restored = await openFirstPlayer(page);
      expect(restored.view.definitions.playerDevelopment).toEqual(
        view.definitions.playerDevelopment,
      );
      await expect(
        restored.detail
          .getByRole('table', { name: '選手の基本能力', exact: true })
          .locator('tbody tr'),
      ).toHaveCount(22);
    }
    expect(errors).toEqual([]);
  });
}

test('能力：旧v18の表示へ補完しない', async ({ page }) => {
  await observe(page, 'legacy');
  const { detail } = await openFirstPlayer(page);
  const table = detail.getByRole('table', { name: '選手の基本能力', exact: true });
  await expect(table.locator('tbody tr')).toHaveCount(11);
  await expect(detail).toContainText('追加11能力・適性の記録はありません');
  await expect(detail.getByText('守備適性・習熟（9位置）', { exact: true })).toHaveCount(0);
  await expect(
    detail
      .getByRole('combobox', { name: '能力の分野', exact: true })
      .locator('option[value="catching"]'),
  ).toHaveCount(0);
});

test('能力：89.999の表示をSへ繰り上げない', async ({ page }) => {
  await observe(page, 'boundary');
  const { detail } = await openFirstPlayer(page);
  const row = detail.locator('tr[data-ability-code="batting.contactVsRight"]');
  await expect(row.locator('.ability-rating-rank')).toHaveText('A');
  await expect(row.locator('.ability-rating-value')).toHaveText('A89');
  await expect(row.getByRole('meter')).toHaveAttribute('value', '89.999');
  await expect(row.locator('.ability-rating')).toHaveAttribute('title', '内部値 89.999 / 120');
});
