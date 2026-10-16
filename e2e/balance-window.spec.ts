import { test, expect, type Page } from '@playwright/test';
import type { WorldView } from '../src/world/controller.ts';

async function observe(page: Page) {
  await page.addInitScript(() => {
    const OriginalWorker = Worker;
    Reflect.set(window, 'balanceCommands', 0);
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (!String(url).includes('world-worker')) return;
        Reflect.set(window, 'balanceWorker', this);
        this.addEventListener('message', ({ data }) => {
          if (data?.view) Reflect.set(window, 'balanceResponse', data);
        });
      }
      override postMessage(
        message: unknown,
        options?: Transferable[] | StructuredSerializeOptions,
      ) {
        if (message && typeof message === 'object' && 'localWorldId' in message)
          Reflect.set(window, 'balanceCommands', Reflect.get(window, 'balanceCommands') + 1);
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
  });
  await page.goto('/');
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24');
  await page.getByRole('button', { name: /^今日の試合へ/ }).click();
  await page.getByRole('button', { name: '1日を自動進行', exact: true }).click();
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-25', {
    timeout: 45000,
  });
  await page
    .getByRole('navigation', { name: 'メインメニュー', exact: true })
    .getByRole('button', { name: '日程', exact: true })
    .click();
}

/** 表示だけの境界検査。実試合の応答を複製し、Worker正本・保存には書き戻さない。 */
async function showWindow(page: Page, days: number, partial = false) {
  await page.evaluate(
    ({ days, partial }) => {
      if (!Reflect.has(window, 'balanceFixtureBase'))
        Reflect.set(
          window,
          'balanceFixtureBase',
          structuredClone(Reflect.get(window, 'balanceResponse')),
        );
      const response = structuredClone(Reflect.get(window, 'balanceFixtureBase')) as {
        view: WorldView;
      };
      const view = response.view;
      const fixtures = view.games.filter((game) => game.date === '2026-09-24');
      const date = (offset: number) =>
        new Date(Date.parse('2026-03-10T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
      view.definitions.startDate = date(0);
      view.currentDate = date(partial ? days - 1 : days);
      view.completedDates = Array.from({ length: partial ? days - 1 : days }, (_, i) => date(i));
      view.games = Array.from({ length: days }, (_, i) =>
        fixtures.map((game, index) => ({
          ...structuredClone(game),
          gameId: `balance-display-${i}-${index}`,
          date: date(i),
        })),
      ).flat();
      if (partial) {
        const unfinished = view.games.find(
          (game) => game.date === date(days - 1) && game.statScope === 'farmRegular',
        )!;
        unfinished.status = 'playing';
      }
      const today = view.games.filter((game) => game.date === view.currentDate);
      view.dayPlan = {
        date: view.currentDate,
        gameIds: today.map((game) => game.gameId),
        cursor: today.filter((game) => game.status === 'completed').length,
      };
      view.lastCompletedDate = view.completedDates.at(-1)!;
      view.registrationPreview = null;
      Reflect.get(window, 'balanceWorker').dispatchEvent(
        new MessageEvent('message', { data: response }),
      );
    },
    { days, partial },
  );
}

for (const width of [1280, 390, 320]) {
  test(`貯金の表示用応答：月と独立した30日・更新待ち・日付選択 (${width}px)`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await observe(page);
    const chart = page.getByRole('region', { name: '貯金・借金の推移', exact: true });
    const select = chart.getByRole('combobox', { name: 'グラフで確認する日', exact: true });
    const firstDot = chart.locator('[data-own="true"] circle');
    await expect(firstDot).toHaveAttribute('cx', '690');
    await showWindow(page, 40);
    await expect(chart.locator('.balance-range time').first()).toHaveAttribute(
      'datetime',
      '2026-03-20',
    );
    await expect(chart.locator('.balance-range time').last()).toHaveAttribute(
      'datetime',
      '2026-04-18',
    );
    await expect(select.locator('option')).toHaveCount(30);
    await expect(select.locator('option').first()).toHaveText('2026-03-20');
    await expect(select.locator('option').last()).toHaveText('2026-04-18');
    const line = chart.locator('[data-own="true"] polyline');
    const before = (await line.getAttribute('points'))!;
    expect(before.trim().split(' ').at(-1)!.split(',')[0]).toBe('690');
    const commands = await page.evaluate(() => Reflect.get(window, 'balanceCommands'));
    const calendar = page.getByRole('region', { name: '月別カレンダー', exact: true });
    await calendar.getByRole('button', { name: '翌月', exact: true }).click();
    await expect(calendar.locator('input[type="month"]')).toHaveValue('2026-05');
    await expect(line).toHaveAttribute('points', before);
    await calendar.getByRole('button', { name: '前月', exact: true }).click();
    await calendar.getByRole('button', { name: '前月', exact: true }).click();
    await expect(calendar.locator('input[type="month"]')).toHaveValue('2026-03');
    await expect(line).toHaveAttribute('points', before);
    await select.selectOption('2026-03-30');
    await expect(chart.getByRole('table')).toContainText('2026-03-30時点');
    await expect(calendar.getByRole('complementary')).toContainText('選択日：2026-03-30');
    await expect(line).toHaveAttribute('points', before);
    // 一軍終了後でも、二軍が残る41日目は範囲を動かさない。
    await showWindow(page, 41, true);
    await expect(line).toHaveAttribute('points', before);
    await expect(chart.locator('.balance-range time').last()).toHaveAttribute(
      'datetime',
      '2026-04-18',
    );
    await showWindow(page, 41);
    await expect(chart.locator('.balance-range time').first()).toHaveAttribute(
      'datetime',
      '2026-03-21',
    );
    await expect(chart.locator('.balance-range time').last()).toHaveAttribute(
      'datetime',
      '2026-04-19',
    );
    await expect(select.locator('option')).toHaveCount(30);
    const after = (await line.getAttribute('points'))!;
    expect(after.trim().split(' ').at(-1)!.split(',')[0]).toBe('690');
    await page
      .getByRole('combobox', { name: '表示する大会', exact: true })
      .selectOption('farmRegular');
    await expect(chart).toContainText('二軍公式戦');
    await expect(chart.locator('.balance-range time').last()).toHaveAttribute(
      'datetime',
      '2026-04-19',
    );
    await expect(select.locator('option')).toHaveCount(30);
    await select.selectOption('2026-04-19');
    await expect(chart.getByRole('table')).toContainText('2026-04-19時点');
    expect(await page.evaluate(() => Reflect.get(window, 'balanceCommands'))).toBe(commands);
    await chart.screenshot({ path: `.tmp/balance-window-qa/rolling-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  });
}
