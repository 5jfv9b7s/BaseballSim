import { test, expect, type Page, type Locator } from '@playwright/test';
import type { WorldView } from '../src/world/controller.ts';
import type { HomeRunRecord } from '../src/world/memorial.ts';

test.setTimeout(180000);
const menu = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'メインメニュー', exact: true })
    .getByRole('button', { name, exact: true })
    .click();
const read = (page: Page) =>
  page.evaluate(() => Reflect.get(window, 'recordView')) as Promise<WorldView>;
const count = (page: Page) =>
  page.evaluate(() => Reflect.get(window, 'recordCommands').length) as Promise<number>;
async function start(page: Page) {
  await page.addInitScript(() => {
    const NativeWorker = Worker;
    Reflect.set(window, 'recordCommands', []);
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes('world-worker'))
          this.addEventListener('message', (event) => {
            if (event.data?.view) Reflect.set(window, 'recordView', event.data.view);
          });
      }
      override postMessage(message: any, options?: Transferable[] | StructuredSerializeOptions) {
        if (message?.localWorldId)
          Reflect.get(window, 'recordCommands').push(structuredClone(message));
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
  });
  await page.goto('/');
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24', {
    timeout: 30000,
  });
  // 自球団の一軍/二軍の両方に達成記録がある固定入力。係数は既定値。
  await menu(page, 'システム');
  await page.getByRole('button', { name: '新規プレイ', exact: true }).click();
  await page.getByText('新規日程・担当球団と試作の範囲', { exact: true }).click();
  await page.getByRole('textbox', { name: '世界seed', exact: true }).fill('2');
  await page.getByRole('button', { name: '新しい日程を準備', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('新しい日程を準備しました');
  await menu(page, 'ホーム');
  await page.getByRole('button', { name: /^今日の試合へ/ }).click();
  await page.getByRole('button', { name: 'シーズン終了まで進行', exact: true }).click();
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-28', {
    timeout: 90000,
  });
}
async function openStatsPage(page: Page, name: string) {
  await menu(page, '成績');
  await page.getByRole('button', { name, exact: true }).click();
}
async function verify(panel: Locator, record: HomeRunRecord) {
  if (record.maximum === null) {
    await expect(panel).toContainText('本塁打記録は');
    await expect(panel.getByRole('table')).toHaveCount(0);
    return;
  }
  await expect(panel.locator('.memorial-result strong')).toHaveText(`${record.maximum}本`);
  await expect(panel).toContainText(`同数の全${record.entries.length}件`);
  const rows = panel
    .getByRole('row')
    .filter({ has: panel.page().getByRole('button', { name: /記録達成試合を表示/ }) });
  await expect(rows).toHaveCount(record.entries.length);
  for (let i = 0; i < record.entries.length; i++) {
    const entry = record.entries[i]!;
    await expect(rows.nth(i).getByRole('rowheader')).toHaveText(entry.display.playerName);
    await expect(rows.nth(i)).toContainText(entry.achievedOn);
    await expect(rows.nth(i)).toContainText(entry.display.teamName);
    await expect(rows.nth(i)).toContainText(entry.display.opponentName);
  }
}
for (const width of [1280, 390, 320]) {
  test(`記録：球団/球界・一二軍・総括・達成試合・閲覧不変 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await start(page);
    const view = await read(page);
    const commands = await count(page);
    const ownSquad = view.definitions.squads.find(
      (s) => s.squadId === view.management!.controlledSquadId,
    )!;
    const own = view.clubMemorial.firstRegular[ownSquad.team.clubId]!;
    expect(own.entries.length).toBeGreaterThan(0);
    expect(view.clubMemorial.farmRegular![ownSquad.team.clubId]!.entries.length).toBeGreaterThan(0);
    await openStatsPage(page, 'メモリアル');
    const memorial = page.getByRole('region', { name: 'メモリアル', exact: true });
    await verify(memorial, view.memorial.firstRegular);
    await memorial.getByRole('combobox', { name: '記録の対象', exact: true }).selectOption('own');
    await verify(memorial, own);
    await page
      .getByRole('combobox', { name: '表示する大会', exact: true })
      .selectOption('farmRegular');
    await verify(memorial, view.clubMemorial.farmRegular![ownSquad.team.clubId]!);
    await expect(memorial.getByRole('combobox', { name: '記録の対象' })).toHaveValue('own');
    await page
      .getByRole('combobox', { name: '表示する大会', exact: true })
      .selectOption('firstRegular');
    await openStatsPage(page, 'シーズン総括');
    const summary = page.getByRole('region', { name: 'シーズンの達成記録', exact: true });
    await verify(summary, own);
    await expect(summary).toContainText(`${view.seasonSummary!.completedOn}確定`);
    await summary.screenshot({ path: `.tmp/memorial-summary/summary-${width}.png` });
    {
      await expect(summary.locator('tbody tr[data-own-club="true"]')).toHaveCount(
        own.entries.length,
      );
      const entry = own.entries[0]!;
      const game = view.games.find((g) => g.gameId === entry.gameId)!;
      expect(game.result!.batting.find((b) => b.playerId === entry.playerId)!.homeRuns).toBe(
        entry.homeRuns,
      );
      expect(game.display!.players.find((p) => p.playerId === entry.playerId)!.playerName).toBe(
        entry.display.playerName,
      );
      await summary
        .getByRole('button', { name: /記録達成試合を表示/ })
        .first()
        .click();
      const result = page.getByRole('region', { name: '日別の試合結果', exact: true });
      await expect(result).toBeFocused();
      await expect(result.getByRole('combobox', { name: '結果の日付', exact: true })).toHaveValue(
        entry.achievedOn,
      );
      await expect(
        result.getByRole('combobox', { name: '詳細を表示する試合', exact: true }),
      ).toHaveValue(entry.gameId);
      await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', view.currentDate);
      await openStatsPage(page, 'シーズン総括');
    }
    await page
      .getByRole('combobox', { name: '表示する大会', exact: true })
      .selectOption('farmRegular');
    await verify(summary, view.clubMemorial.farmRegular![ownSquad.team.clubId]!);
    await expect(summary).toContainText(`${view.farm!.summary!.completedOn}確定`);
    const farmEntry = view.clubMemorial.farmRegular![ownSquad.team.clubId]!.entries[0]!;
    await summary
      .getByRole('button', { name: /記録達成試合を表示/ })
      .first()
      .click();
    const farmResult = page.getByRole('region', { name: '日別の試合結果', exact: true });
    await expect(
      farmResult.getByRole('combobox', { name: '詳細を表示する試合', exact: true }),
    ).toHaveValue(farmEntry.gameId);
    await expect(page.getByRole('combobox', { name: '表示する大会', exact: true })).toHaveValue(
      'farmRegular',
    );
    await openStatsPage(page, 'シーズン総括');
    expect(await read(page)).toEqual(view);
    expect(await count(page)).toBe(commands);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await openStatsPage(page, 'メモリアル');
    await memorial.getByRole('combobox', { name: '記録の対象' }).selectOption('own');
    await memorial.screenshot({ path: `.tmp/memorial-summary/memorial-${width}.png` });
    if (width === 1280) {
      const expected = structuredClone((await read(page)).clubMemorial);
      await menu(page, 'システム');
      await page.getByRole('button', { name: '世界を手動保存', exact: true }).click();
      await expect(
        page.getByRole('button', { name: '手動保存を読み込む', exact: true }),
      ).toBeEnabled({ timeout: 30000 });
      await page.reload();
      await page.getByRole('button', { name: 'セーブから再開 →', exact: true }).click();
      await page
        .getByRole('combobox', { name: '保存済みプレイ', exact: true })
        .selectOption(view.localWorldId);
      await page.getByRole('combobox', { name: '開く保存枠', exact: true }).selectOption('manual');
      await page.getByRole('button', { name: '選んだプレイを開く', exact: true }).click();
      await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-28', {
        timeout: 30000,
      });
      await openStatsPage(page, 'シーズン総括');
      await verify(summary, expected.firstRegular[ownSquad.team.clubId]!);
      expect((await read(page)).clubMemorial).toEqual(expected);
    }
    expect(errors).toEqual([]);
  });
}
