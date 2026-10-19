import { test, expect, type Page } from '@playwright/test';
import type { WorldWorkerResponse } from '../src/world-worker.ts';

async function observe(page: Page, legacy = false) {
  await page.addInitScript((legacy) => {
    const NativeWorker = Worker;
    Reflect.set(window, 'leagueSwitchCommands', 0);
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes('world-worker'))
          this.addEventListener('message', (event) => {
            // 旧保存の表示投影のみ。正本・実IndexedDBには変更を加えない。
            if (legacy && event.data?.view) {
              event.data.view.definitions.version = 'world-definitions-v16';
              delete event.data.view.definitions.leagueStructure;
            }
            Reflect.set(window, 'twoLeagueResponse', event.data);
          });
      }
      override postMessage(
        message: unknown,
        options?: Transferable[] | StructuredSerializeOptions,
      ) {
        if (message && typeof message === 'object' && 'localWorldId' in message)
          Reflect.set(
            window,
            'leagueSwitchCommands',
            Reflect.get(window, 'leagueSwitchCommands') + 1,
          );
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
  }, legacy);
  await page.goto('/');
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24');
}

for (const width of [1280, 390]) {
  test(`リーグ切替：自リーグから表示し、別リーグ・二軍へ進行せず切り替える (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await observe(page);
    const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
    await page.getByRole('button', { name: 'リーグ順位のカード', exact: true }).click();
    const homeTable = page.getByRole('table', { name: 'リーグ順位', exact: true });
    await expect(homeTable.locator('tbody tr')).toHaveCount(2);
    await expect(homeTable).toContainText('星原フォックス');
    await expect(homeTable).not.toContainText('青凪ハーバーズ');
    await expect(page.getByRole('region', { name: '今日の対戦', exact: true })).toContainText(
      '一軍公式戦・交流戦',
    );
    await nav.getByRole('button', { name: '成績', exact: true }).click();
    const panel = page.getByRole('region', { name: '順位表', exact: true });
    const league = panel.getByRole('combobox', { name: '表示するリーグ', exact: true });
    await expect(league).toHaveValue('fictional-sky-league');
    await expect(panel.getByRole('table').locator('tbody tr')).toHaveCount(2);
    await expect(panel.getByRole('table')).toContainText('自球団');
    const scrollHint = panel.getByText('横にスクロールして勝率・ゲーム差・得失点を確認 →', {
      exact: true,
    });
    if (width === 390) {
      await expect(scrollHint).toBeVisible();
      const scroll = panel.getByRole('region', {
        name: '架空スカイリーグの表スクロール領域',
        exact: true,
      });
      await scroll.focus();
      await page.keyboard.press('ArrowRight');
      await expect.poll(() => scroll.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    } else await expect(scrollHint).toBeHidden();

    await expect(panel.getByRole('table').locator('tbody tr').first()).toContainText('—');
    await league.selectOption('fictional-ocean-league');
    await expect(panel.getByRole('table')).toContainText('青凪ハーバーズ');
    await expect(panel.getByRole('table')).not.toContainText('星原フォックス');
    await page
      .getByRole('combobox', { name: '表示する大会', exact: true })
      .selectOption('farmRegular');
    await expect(panel.getByRole('combobox', { name: '表示するリーグ', exact: true })).toHaveCount(
      0,
    );
    await expect(panel.getByRole('table').locator('tbody tr')).toHaveCount(4);
    await page
      .getByRole('combobox', { name: '表示する大会', exact: true })
      .selectOption('firstRegular');
    await expect(league).toHaveValue('fictional-sky-league');
    expect(await page.evaluate(() => Reflect.get(window, 'leagueSwitchCommands'))).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await panel.screenshot({ path: `.tmp/two-leagues-qa/standings-${width}.png` });
    expect(errors).toEqual([]);
  });
}

test('旧表示：所属を補完せず全4球団の従来順位を表示する', async ({ page }) => {
  await observe(page, true);
  await page
    .getByRole('navigation', { name: 'メインメニュー', exact: true })
    .getByRole('button', { name: '成績', exact: true })
    .click();
  const panel = page.getByRole('region', { name: '順位表', exact: true });
  await expect(panel.getByRole('table').locator('tbody tr')).toHaveCount(4);
  await expect(panel).toContainText('リーグ情報の記録なし');
  await expect(panel.getByRole('combobox', { name: '表示するリーグ', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, 'leagueSwitchCommands'))).toBe(0);
});

for (const width of [1280, 390]) {
  test(`リーグ別年度末：保存済みの一二軍順位・優勝判定を表示する (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 960 });
    test.setTimeout(120000);
    await observe(page);
    await page.getByRole('button', { name: /^今日の試合へ/ }).click();
    await page.getByRole('button', { name: 'シーズン終了まで進行', exact: true }).click();
    await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-28', {
      timeout: 90000,
    });
    const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
    await nav.getByRole('button', { name: '成績', exact: true }).click();
    await page.getByRole('button', { name: 'シーズン総括', exact: true }).click();
    const summary = page.getByRole('region', { name: 'シーズン終了要約', exact: true });
    await expect(summary).toContainText('全6試合');
    await expect(summary.getByRole('table')).toHaveCount(2);
    await expect(summary).toContainText('架空スカイリーグ');
    await expect(summary).toContainText('架空オーシャンリーグ');
    const response = await page.evaluate(
      () => Reflect.get(window, 'twoLeagueResponse') as WorldWorkerResponse,
    );
    expect(response.view.seasonSummary!.version).toBe('season-summary-v2');
    expect(response.view.seasonSummary!.title.status).toBe('byLeague');
    expect(response.view.unsavedChanges).toBe(false);
    const lastRow = summary.getByRole('table').last().locator('tbody tr').last();
    await lastRow.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await expect(lastRow).toBeInViewport();
    const rowBox = (await lastRow.boundingBox())!;
    expect(rowBox.y + rowBox.height).toBeLessThan(
      (await page.locator('.main-navigation').boundingBox())!.y,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `.tmp/two-leagues-qa/summary-${width}.png` });
    await page
      .getByRole('combobox', { name: '表示する大会', exact: true })
      .selectOption('farmRegular');
    await expect(summary).toContainText('全4試合');
    await expect(summary.getByRole('table')).toHaveCount(1);
    await expect(summary).toContainText('架空二軍リーグ');
  });
}
