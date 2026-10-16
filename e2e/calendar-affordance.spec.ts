import { expect, test, type Page } from '@playwright/test';
import type { WorldView } from '../src/world/controller.ts';

async function openCalendar(page: Page) {
  await page.addInitScript(() => {
    const OriginalWorker = Worker;
    Reflect.set(window, 'calendarCommands', 0);
    Reflect.set(
      window,
      'Worker',
      class extends OriginalWorker {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options);
          if (url.toString().includes('world-worker')) {
            this.addEventListener('message', ({ data }) => {
              if (data?.view) Reflect.set(window, 'calendarView', data.view);
            });
          }
        }
        override postMessage(
          message: unknown,
          options?: Transferable[] | StructuredSerializeOptions,
        ) {
          if (message && typeof message === 'object' && 'localWorldId' in message) {
            Reflect.set(window, 'calendarCommands', Reflect.get(window, 'calendarCommands') + 1);
          }
          if (Array.isArray(options)) super.postMessage(message, options);
          else super.postMessage(message, options);
        }
      },
    );
  });
  await page.goto('/');
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24');
  await page
    .getByRole('navigation', { name: 'メインメニュー', exact: true })
    .getByRole('button', { name: '日程', exact: true })
    .click();
}

for (const width of [1280, 390, 320]) {
  test(`カレンダー：自チームだけ・日付付近の操作・閉じ方・大会切替 (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 820 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openCalendar(page);
    const calendar = page.getByRole('region', { name: '月別カレンダー', exact: true });
    const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
    const today = calendar.getByRole('button', { name: /^09-24/ });
    await expect(today.locator('.calendar-match')).toHaveCount(1);
    await expect(today).toContainText('青凪ハーバーズ');
    await expect(today).not.toContainText('朝霧フォックス');
    await expect(today).not.toContainText('湖白スワンズ');
    await expect(
      calendar.getByRole('button', { name: /^09-26/ }).locator('.calendar-match'),
    ).toHaveCount(0);
    await expect(calendar.locator('.calendar-weekday')).toHaveText([
      '日',
      '月',
      '火',
      '水',
      '木',
      '金',
      '土',
    ]);
    await today.click();
    const menu = calendar.getByRole('dialog', { name: '選択日の操作', exact: true });
    await expect(menu).toHaveCount(0);
    await expect(calendar.getByRole('complementary')).toContainText('選択日：2026-09-24');
    const cell = calendar.getByRole('button', { name: /^09-26/ });
    await cell.focus();
    await page.keyboard.press('Enter');
    await expect(cell).toHaveAttribute('aria-expanded', 'true');
    await expect(menu).toContainText('選択日：2026-09-26');
    await expect(menu).toContainText('3日分・残り8試合');
    await expect(menu).toContainText('担当球団の試合なし');
    await expect(
      menu.getByRole('button', { name: 'この日の終了まで進める', exact: true }),
    ).toBeFocused();
    const box = (await menu.boundingBox())!;
    const navBox = (await nav.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(navBox.y);
    if (width > 600) {
      const cellBox = (await cell.boundingBox())!;
      const gap = Math.min(
        Math.abs(box.y - cellBox.y - cellBox.height),
        Math.abs(cellBox.y - box.y - box.height),
      );
      expect(gap).toBeLessThanOrEqual(12);
    }
    const cellBox = (await cell.boundingBox())!;
    const scrollBox = (await calendar.locator('.calendar-scroll').boundingBox())!;
    expect(cellBox.x).toBeGreaterThanOrEqual(scrollBox.x);
    expect(cellBox.x + cellBox.width).toBeLessThanOrEqual(scrollBox.x + scrollBox.width);
    await page.screenshot({ path: `.tmp/calendar-menu-qa/selected-${width}.png` });
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(cell).toBeFocused();
    await expect(cell).toHaveAttribute('aria-pressed', 'true');
    await cell.click();
    await cell.click();
    await expect(menu).toHaveCount(0);
    await cell.click();
    await menu.getByRole('button', { name: '日付メニューを閉じる', exact: true }).click();
    await expect(menu).toHaveCount(0);
    await expect(cell).toBeFocused();
    await cell.click();
    await calendar.getByRole('heading', { name: '月別カレンダー', exact: true }).click();
    await expect(menu).toHaveCount(0);
    const tomorrow = calendar.getByRole('button', { name: /^09-25/ });
    await tomorrow.click();
    await expect(menu).toContainText('選択日：2026-09-25');
    await page
      .getByRole('combobox', { name: '表示する大会', exact: true })
      .selectOption('farmRegular');
    await expect(menu).toHaveCount(0);
    const view = await page.evaluate(() => Reflect.get(window, 'calendarView') as WorldView);
    const club = view.definitions.squads.find(
      (squad) => squad.squadId === view.management!.controlledSquadId,
    )!;
    const farm = view.definitions.farm!.squads.find(
      (squad) => squad.team.clubId === club.team.clubId,
    )!;
    const game = view.games.find(
      (game) =>
        game.date === '2026-09-26' &&
        game.statScope === 'farmRegular' &&
        [game.homeSquadId, game.awaySquadId].includes(farm.squadId),
    )!;
    const opponent = view.definitions.farm!.squads.find(
      (squad) =>
        squad.squadId === (game.homeSquadId === farm.squadId ? game.awaySquadId : game.homeSquadId),
    )!;
    await expect(cell.locator('.calendar-match')).toHaveCount(1);
    await expect(cell).toContainText(opponent.team.name);
    expect(await page.evaluate(() => Reflect.get(window, 'calendarCommands'))).toBe(0);
    await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  });
}

test('カレンダー：当日の全試合まで進行し、過去日の自チームの結果を明示して開く', async ({
  page,
}) => {
  test.setTimeout(90000);
  await openCalendar(page);
  const calendar = page.getByRole('region', { name: '月別カレンダー', exact: true });
  await calendar.getByRole('button', { name: /^09-25/ }).click();
  await calendar
    .getByRole('dialog')
    .getByRole('button', { name: 'この日の終了まで進める', exact: true })
    .click();
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-26', {
    timeout: 50000,
  });
  await expect(calendar.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('region', { name: '日別の試合結果', exact: true })).toHaveCount(0);
  for (const scope of ['firstRegular', 'farmRegular'] as const) {
    if (scope === 'farmRegular')
      await page.getByRole('button', { name: 'カレンダー', exact: true }).click();
    await page.getByRole('combobox', { name: '表示する大会', exact: true }).selectOption(scope);
    const date = scope === 'firstRegular' ? '2026-09-25' : '2026-09-24';
    const expected = await page.evaluate(
      ({ scope, date }) => {
        const view = Reflect.get(window, 'calendarView') as WorldView;
        const club = view.definitions.squads.find(
          (squad) => squad.squadId === view.management!.controlledSquadId,
        )!;
        const own =
          scope === 'firstRegular'
            ? club
            : view.definitions.farm!.squads.find(
                (squad) => squad.team.clubId === club.team.clubId,
              )!;
        const game = view.games.find(
          (game) =>
            game.date === date &&
            game.statScope === scope &&
            [game.awaySquadId, game.homeSquadId].includes(own.squadId),
        )!;
        const home = own.squadId === game.homeSquadId;
        return {
          id: game.gameId,
          ours: home ? game.score!.home : game.score!.away,
          theirs: home ? game.score!.away : game.score!.home,
        };
      },
      { scope, date },
    );
    const cell = calendar.getByRole('button', { name: new RegExp(`^${date.slice(5)}`) });
    await cell.click();
    await expect(cell).toContainText(`${expected.ours} − ${expected.theirs}`);
    const menu = calendar.getByRole('dialog');
    await expect(
      menu.getByRole('button', { name: 'この日の終了まで進める', exact: true }),
    ).toHaveCount(0);
    await menu.getByRole('button', { name: '試合詳細へ', exact: true }).click();
    const result = page.getByRole('region', { name: '日別の試合結果', exact: true });
    await expect(
      result.getByRole('combobox', { name: '詳細を表示する試合', exact: true }),
    ).toHaveValue(expected.id);
    await expect(
      result.getByRole('table', { name: '日次のイニング別スコア', exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-26');
  }
});

test('カレンダー：別の担当球団の年間日程と月変更、今日への入口', async ({ page }) => {
  await openCalendar(page);
  const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
  await nav.getByRole('button', { name: 'システム', exact: true }).click();
  await page.getByRole('button', { name: '新規プレイ', exact: true }).click();
  await page.getByText('新規日程・担当球団と試作の範囲', { exact: true }).click();
  await page
    .getByRole('combobox', { name: '新規プレイの日程', exact: true })
    .selectOption('annual');
  const clubSelect = page.getByRole('combobox', { name: '新規プレイの担当球団', exact: true });
  await clubSelect.selectOption({ index: 1 });
  const squadId = await clubSelect.inputValue();
  await page.getByRole('button', { name: '新しい日程を準備', exact: true }).click();
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-03-27');
  await nav.getByRole('button', { name: '日程', exact: true }).click();
  const calendar = page.getByRole('region', { name: '月別カレンダー', exact: true });
  const view = await page.evaluate(() => Reflect.get(window, 'calendarView') as WorldView);
  expect(view.management!.controlledSquadId).toBe(squadId);
  const club = view.definitions.squads.find((squad) => squad.squadId === squadId)!;
  await expect(calendar.locator('.calendar-heading')).toContainText(club.team.name);
  const games = view.games.filter(
    (game) =>
      game.date.startsWith('2026-03') &&
      game.statScope === 'firstRegular' &&
      [game.homeSquadId, game.awaySquadId].includes(squadId),
  );
  await expect(calendar.locator('.calendar-match')).toHaveCount(games.length);
  for (const game of games) {
    const opponent = view.definitions.squads.find(
      (squad) =>
        squad.squadId === (game.homeSquadId === squadId ? game.awaySquadId : game.homeSquadId),
    )!;
    await expect(
      calendar.getByRole('button', { name: new RegExp(`^${game.date.slice(5)}`) }),
    ).toContainText(opponent.team.name);
  }
  await calendar.getByRole('button', { name: /^03-29/ }).click();
  await expect(calendar.getByRole('dialog')).toBeVisible();
  await calendar.getByRole('button', { name: '翌月', exact: true }).click();
  await expect(calendar.getByRole('dialog')).toHaveCount(0);
  await expect(calendar.locator('input[type="month"]')).toHaveValue('2026-04');
  await calendar.getByRole('button', { name: /^04-01/ }).click();
  await expect(calendar.getByRole('dialog')).toBeVisible();
  await calendar.getByRole('button', { name: '現在月', exact: true }).click();
  await expect(calendar.getByRole('dialog')).toHaveCount(0);
  await expect(calendar.locator('input[type="month"]')).toHaveValue('2026-03');
  await expect(calendar.getByRole('complementary')).toContainText('選択日：2026-03-27');
  const commands = await page.evaluate(() => Reflect.get(window, 'calendarCommands'));
  await calendar.getByRole('button', { name: '今日の試合へ', exact: true }).click();
  await expect(page.getByRole('region', { name: '日次進行', exact: true })).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, 'calendarCommands'))).toBe(commands);
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-03-27');
});
