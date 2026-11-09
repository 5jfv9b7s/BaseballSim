import { selectSaveChoice } from './saved-play.ts';
import { openDevelopmentHome, reloadDevelopmentHome } from './main-entry.ts';
import { test, expect, type Page, type Locator } from '@playwright/test';
import type { WorldView } from '../src/world/controller.ts';
import type { HitStreakRecord } from '../src/world/hit-streaks.ts';

test.setTimeout(180000);
const read = (page: Page) =>
  page.evaluate(() => Reflect.get(window, 'streakView')) as Promise<WorldView>;
const commands = (page: Page) =>
  page.evaluate(() => Reflect.get(window, 'streakCommands')) as Promise<number>;
async function start(page: Page) {
  await page.addInitScript(() => {
    const NativeWorker = Worker;
    Reflect.set(window, 'streakCommands', 0);
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes('world-worker'))
          this.addEventListener('message', (event) => {
            if (event.data?.view) Reflect.set(window, 'streakView', event.data.view);
          });
      }
      override postMessage(message: any, options?: Transferable[] | StructuredSerializeOptions) {
        if (message?.localWorldId)
          Reflect.set(window, 'streakCommands', Reflect.get(window, 'streakCommands') + 1);
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
  });
  await page.goto('/?tools=1');
  await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
  await page.getByText('新規日程・担当球団と試作の範囲', { exact: true }).click();
  await page.getByRole('textbox', { name: '世界seed', exact: true }).fill('2');
  await page.getByRole('button', { name: '新しい日程を準備', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('新しい日程を準備しました', {
    timeout: 30000,
  });
}
async function verify(panel: Locator, record: HitStreakRecord) {
  await expect(panel).toContainText('欠場・打数0は維持');
  if (record.maximum === null) {
    await expect(panel).toContainText('確定試合での安打記録はまだありません');
    await expect(panel.getByRole('table')).toHaveCount(0);
    return;
  }
  await expect(panel.locator('.memorial-result strong')).toHaveText(`${record.maximum}試合`);
  const rows = panel
    .getByRole('table', { name: '連続試合安打の現在と自己最長' })
    .locator('tbody tr');
  await expect(rows).toHaveCount(record.players.length);
  const tableColor = await panel
    .locator('.memorial-table')
    .evaluate((e) => getComputedStyle(e).color);
  await expect(rows.first().getByRole('rowheader')).toHaveCSS('color', tableColor);
  // セルごとのCDP往復を避け、同じ全選手・全項目の検証を1回のDOM取得で行う。
  const actual = await rows.evaluateAll((elements) =>
    elements.map((row) => {
      const cells = Array.from(row.querySelectorAll('td'));
      return {
        name: row.querySelector('th')?.textContent,
        rank: cells[2]?.textContent,
        club: cells[3]?.textContent,
        current: cells[0]?.querySelector('strong')?.textContent,
        maximum: cells[1]?.querySelector('strong')?.textContent,
      };
    }),
  );
  for (const [i, player] of record.players.entries()) {
    const best = player.longest.at(-1)!;
    expect(actual[i]!.name).toBe(best.lastHit.display.playerName);
    expect(actual[i]!.rank).toBe(
      String(record.players.findIndex((p) => p.maximum === player.maximum) + 1),
    );
    expect(actual[i]!.club).toContain(best.lastHit.display.teamName);
    expect(actual[i]!.current).toBe(String(player.current?.length ?? 0));
    expect(actual[i]!.maximum).toBe(String(player.maximum));
  }
}
for (const width of [1280, 390, 320]) {
  test(`連続試合安打：実進行・現在/最長・全体/自球団・一二軍・結果・保存 (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await start(page);
    const memorial = page.getByRole('region', { name: 'メモリアル', exact: true });
    const kind = memorial.getByRole('combobox', { name: '記録の種類', exact: true });
    await kind.selectOption('hitStreaks');
    const panel = memorial.getByRole('region', { name: '連続試合安打（試作）', exact: true });
    await verify(panel, (await read(page)).hitStreaks.firstRegular.overall);
    await page.getByRole('button', { name: '1日を自動進行', exact: true }).click();
    await expect(page.getByTestId('world-date')).toHaveText('2026-09-25', { timeout: 45000 });
    const firstView = await read(page);
    expect(firstView.hitStreaks.firstRegular.overall.players.length).toBeGreaterThan(0);
    expect(
      firstView.hitStreaks.firstRegular.overall.players.every(
        (p) => p.current?.status === 'ongoing',
      ),
    ).toBe(true);
    await verify(panel, firstView.hitStreaks.firstRegular.overall);
    await page.getByRole('button', { name: 'シーズン終了まで進行', exact: true }).click();
    await expect(page.getByTestId('world-date')).toHaveText('2026-09-28', { timeout: 90000 });
    const view = await read(page);
    const beforeCommands = await commands(page);
    const overall = view.hitStreaks.firstRegular.overall;
    expect(overall.status).toBe('final');
    expect(overall.players.some((p) => p.current?.status === 'seasonClosed')).toBe(true);
    expect(overall.players.some((p) => p.longest.some((e) => e.endedBy))).toBe(true);
    await verify(panel, overall);
    const endedPlayer = overall.players.find((p) => p.longest.some((e) => e.endedBy))!;
    const index = overall.players.indexOf(endedPlayer);
    const row = panel.locator('tbody tr').nth(index);
    const details = row.locator('summary');
    await details.focus();
    await page.keyboard.press('Enter');
    const period = endedPlayer.longest.find((e) => e.endedBy)!;
    const results = page.getByRole('region', { name: '日別の試合結果', exact: true });
    // 最長期間の全件がDOMにあり、当該の終了試合へ移動できる。
    await expect(row.locator('ol').first().locator('li')).toHaveCount(endedPlayer.longest.length);
    await row
      .getByRole('button', {
        name: `${period.endedBy!.achievedOn} ${period.endedBy!.display.playerName}の記録が途切れた試合を表示`,
        exact: true,
      })
      .first()
      .click();
    await expect(results).toBeFocused();
    await expect(results.getByRole('combobox', { name: '結果の日付', exact: true })).toHaveValue(
      period.endedBy!.achievedOn,
    );
    await expect(
      results.getByRole('combobox', { name: '詳細を表示する試合', exact: true }),
    ).toHaveValue(period.endedBy!.gameId);
    await row
      .getByRole('button', {
        name: `${period.lastHit.achievedOn} ${period.lastHit.display.playerName}の最後の安打試合を表示`,
        exact: true,
      })
      .first()
      .click();
    await expect(
      results.getByRole('combobox', { name: '詳細を表示する試合', exact: true }),
    ).toHaveValue(period.lastHit.gameId);
    const ownClubId = view.definitions.squads.find(
      (s) => s.squadId === view.management!.controlledSquadId,
    )!.team.clubId;
    await memorial.getByRole('combobox', { name: '記録の対象' }).selectOption('own');
    await verify(panel, view.hitStreaks.firstRegular.byClub[ownClubId]!);
    await page
      .getByRole('combobox', { name: '表示する大会', exact: true })
      .selectOption('farmRegular');
    await verify(panel, view.hitStreaks.farmRegular!.byClub[ownClubId]!);
    await expect(panel).toContainText('二軍・今季確定');
    const farm = view.hitStreaks.farmRegular!.byClub[ownClubId]!;
    const farmEntry = farm.players[0]!.longest[0]!;
    const farmRow = panel.locator('tbody tr').first();
    // Reactは表の選手キーを維持する場合があるため、開閉状態を明示する。
    if (!(await farmRow.locator('details').evaluate((e) => (e as HTMLDetailsElement).open)))
      await farmRow.locator('summary').click();
    await farmRow
      .getByRole('button', {
        name: `${farmEntry.lastHit.achievedOn} ${farmEntry.lastHit.display.playerName}の最後の安打試合を表示`,
        exact: true,
      })
      .first()
      .click();
    await expect(
      results.getByRole('combobox', { name: '詳細を表示する試合', exact: true }),
    ).toHaveValue(farmEntry.lastHit.gameId);
    await expect(page.getByTestId('world-date')).toHaveText(view.currentDate);
    expect(await commands(page)).toBe(beforeCommands);
    expect(await read(page)).toEqual(view);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await panel.locator('.memorial-table').evaluate((e) => {
      e.scrollLeft = 0;
    });
    await panel.screenshot({ path: `.tmp/hit-streaks/records-${width}.png` });
    if (width === 1280) {
      await page.getByRole('button', { name: '世界を手動保存', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('世界全体を手動保存', {
        timeout: 30000,
      });
      await reloadDevelopmentHome(page);
      await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
      await selectSaveChoice(
        page.getByRole('group', { name: '保存済みプレイ', exact: true }),
        view.localWorldId,
      );
      await selectSaveChoice(
        page.getByRole('group', { name: '開く保存枠', exact: true }),
        'manual',
      );
      await page.getByRole('button', { name: '選んだプレイを開く', exact: true }).click();
      await expect(page.getByTestId('world-date')).toHaveText(view.currentDate, { timeout: 30000 });
      expect((await read(page)).hitStreaks).toEqual(view.hitStreaks);
      await memorial
        .getByRole('combobox', { name: '記録の種類', exact: true })
        .selectOption('hitStreaks');
      await verify(panel, overall);
    }
    // 本画面でも同じ実保存を開き、メニューから追加した記録へ到達する。
    await openDevelopmentHome(page);
    await page.getByRole('button', { name: 'セーブから再開 →', exact: true }).click();
    await selectSaveChoice(
      page.getByRole('group', { name: '保存済みプレイ', exact: true }),
      view.localWorldId,
    );
    await selectSaveChoice(page.getByRole('group', { name: '開く保存枠', exact: true }), 'auto');
    await page.getByRole('button', { name: '選んだプレイを開く', exact: true }).click();
    await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', view.currentDate, {
      timeout: 30000,
    });
    const menu = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
    await menu.getByRole('button', { name: '成績', exact: true }).click();
    await page.getByRole('button', { name: 'メモリアル', exact: true }).click();
    const mainView = await read(page);
    const mainCommands = await commands(page);
    await memorial
      .getByRole('combobox', { name: '記録の種類', exact: true })
      .selectOption('hitStreaks');
    await verify(panel, mainView.hitStreaks.firstRegular.overall);
    await panel.locator('summary').first().click();
    await panel.locator('.memorial-table').evaluate((e) => {
      e.scrollLeft = 0;
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const tableBounds = await panel.locator('.memorial-table').boundingBox();
    for (const cellIndex of [0, 1]) {
      const cellBounds = await panel
        .locator('tbody tr')
        .first()
        .getByRole('cell')
        .nth(cellIndex)
        .boundingBox();
      expect(cellBounds!.x + cellBounds!.width).toBeLessThanOrEqual(
        tableBounds!.x + tableBounds!.width,
      );
    }
    await memorial.screenshot({ path: `.tmp/hit-streaks/main-${width}.png` });
    expect(await commands(page)).toBe(mainCommands);
    expect(await read(page)).toEqual(mainView);
    expect(errors).toEqual([]);
  });
}
