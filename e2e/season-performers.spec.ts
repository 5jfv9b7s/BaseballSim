import { test, expect, type Page } from '@playwright/test';
import type { WorldView } from '../src/world/controller.ts';

test.setTimeout(150000);
async function start(page: Page, edgeProjection = false) {
  await page.addInitScript((edgeProjection) => {
    const NativeWorker = Worker;
    Reflect.set(window, 'performerCommands', []);
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes('world-worker'))
          this.addEventListener('message', (event) => {
            if (!event.data?.view) return;
            const view = event.data.view as WorldView;
            // 同率・空欄の表示だけを検査する投影。実計算・IndexedDBは変更しない。
            if (edgeProjection && view.seasonSummary) {
              const stats = view.seasonSummary.stats;
              for (const row of stats.batting) {
                row.hits = 0;
                row.atBats = 1;
                row.plateAppearances = 1;
                row.homeRuns = 0;
                row.runsBattedIn = 0;
              }
              const own = stats.batting.filter(
                (row) => row.squadId === view.management!.controlledSquadId,
              );
              for (const row of own.slice(0, 2)) row.hits = 1;
              stats.pitching = [];
            }
            Reflect.set(window, 'performerView', view);
          });
      }
      override postMessage(message: any, options?: Transferable[] | StructuredSerializeOptions) {
        if (message?.localWorldId)
          Reflect.get(window, 'performerCommands').push(structuredClone(message));
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
  }, edgeProjection);
  await page.goto('/');
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24', {
    timeout: 30000,
  });
  await page.getByRole('button', { name: /^今日の試合へ/ }).click();
  await page.getByRole('button', { name: 'シーズン終了まで進行', exact: true }).click();
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-28', {
    timeout: 90000,
  });
}
const menu = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'メインメニュー', exact: true })
    .getByRole('button', { name, exact: true })
    .click();
async function openSummary(page: Page) {
  await menu(page, '成績');
  await page.getByRole('button', { name: 'シーズン総括', exact: true }).click();
}
const read = (page: Page) =>
  page.evaluate(() => Reflect.get(window, 'performerView')) as Promise<WorldView>;
const count = (page: Page) =>
  page.evaluate(() => Reflect.get(window, 'performerCommands').length) as Promise<number>;
const panel = (page: Page) => page.getByRole('region', { name: 'シーズンの活躍選手', exact: true });
function expectedHits(view: WorldView, squadId: string, farm = false) {
  const summary = farm ? view.farm!.summary! : view.seasonSummary!;
  const rows = summary.stats.batting.filter((row) => row.squadId === squadId);
  const max = Math.max(0, ...rows.map((row) => row.hits));
  return rows
    .filter((row) => max > 0 && row.hits === max)
    .map((row) => row.playerId)
    .sort();
}
async function verifyHits(page: Page, view: WorldView, squadId: string, farm = false) {
  const expected = expectedHits(view, squadId, farm);
  const row = panel(page).locator('tr[data-metric="hits"]');
  const players = view.definitions.squads.flatMap((s) => s.players);
  await expect(row.getByRole('button')).toHaveText(
    expected.map((id) => {
      const player = players.find((p) => p.playerId === id)!;
      return player.familyName + ' ' + player.givenName;
    }),
  );
}

for (const width of [1280, 390, 320]) {
  test(`活躍選手：実成績・球団/一二軍切替・選手詳細・閲覧不変 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && /same key/i.test(message.text()))
        errors.push(message.text());
    });
    await start(page);
    await openSummary(page);
    const view = await read(page);
    const commands = await count(page);
    const own = view.management!.controlledSquadId;
    const ownSquad = view.definitions.squads.find((s) => s.squadId === own)!;
    const ownResult = view.seasonSummary!.clubs.find((r) => r.squadId === own)!;
    await expect(panel(page)).toContainText(`${view.seasonSummary!.completedOn}確定`);
    await expect(
      panel(page).getByRole('combobox', { name: '活躍を確認する球団', exact: true }),
    ).toHaveValue(own);
    await expect(panel(page).locator('.season-performer-club')).toHaveAttribute(
      'data-own-club',
      'true',
    );
    await expect(panel(page).getByRole('definition')).toHaveText([
      ownResult.rank === null ? '—' : `${ownResult.rank}位`,
      String(ownResult.wins),
      String(ownResult.losses),
      String(ownResult.draws),
      String(Math.abs(ownResult.wins - ownResult.losses)),
    ]);
    await verifyHits(page, view, own);
    await panel(page).locator('tr[data-metric="hits"]').getByRole('button').first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '選手詳細を閉じる', exact: true }).click();
    const other = view.definitions.squads.find((s) => s.squadId !== own)!;
    await panel(page)
      .getByRole('combobox', { name: '活躍を確認する球団', exact: true })
      .selectOption(other.squadId);
    await verifyHits(page, view, other.squadId);
    await expect(panel(page).locator('.season-performer-club')).toHaveAttribute(
      'data-own-club',
      'false',
    );
    await page
      .getByRole('combobox', { name: '表示する大会', exact: true })
      .selectOption('farmRegular');
    const farmOwn = view.definitions.farm!.squads.find(
      (s) => s.team.clubId === ownSquad.team.clubId,
    )!;
    await expect(
      panel(page).getByRole('combobox', { name: '活躍を確認する球団', exact: true }),
    ).toHaveValue(farmOwn.squadId);
    await expect(panel(page)).toContainText('二軍公式戦');
    await expect(panel(page)).toContainText(`${view.farm!.summary!.completedOn}確定`);
    await verifyHits(page, view, farmOwn.squadId, true);
    await page
      .getByRole('combobox', { name: '表示する大会', exact: true })
      .selectOption('firstRegular');
    await verifyHits(page, view, own);
    expect(await read(page)).toEqual(view);
    expect(await count(page)).toBe(commands);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await panel(page).screenshot({ path: `.tmp/season-performers-qa/${width}.png` });
    const originalTable = await panel(page)
      .getByRole('table', { name: '球団内の打撃実績', exact: true })
      .innerText();
    if (width === 1280) {
      await menu(page, 'システム');
      await page.getByRole('button', { name: '世界を手動保存', exact: true }).click();
      await expect(
        page.getByRole('button', { name: '手動保存を読み込む', exact: true }),
      ).toBeEnabled({ timeout: 30000 });
      await page.reload();
      await page.getByRole('button', { name: 'セーブから再開 →', exact: true }).click();
      await page.getByRole('button', { name: '手動保存を読み込む', exact: true }).click();
      await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-28', {
        timeout: 30000,
      });
      await openSummary(page);
      await expect(
        panel(page).getByRole('table', { name: '球団内の打撃実績', exact: true }),
      ).toHaveText(originalTable, { useInnerText: true });
      expect((await read(page)).seasonSummary).toEqual(view.seasonSummary);
      expect((await read(page)).farm!.summary).toEqual(view.farm!.summary);
    }
    expect(errors).toEqual([]);
  });
}

test('活躍選手：同率全員・全員0・規定未到達・未記録を区別する表示投影', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  await start(page, true);
  await openSummary(page);
  const view = await read(page);
  await verifyHits(page, view, view.management!.controlledSquadId);
  await expect(panel(page).locator('tr[data-metric="hits"]')).toContainText('同率2人');
  await expect(panel(page).locator('tr[data-metric="homeRuns"]')).toContainText(
    '該当記録なし（全員0）',
  );
  await expect(panel(page).locator('tr[data-metric="average"]')).toContainText('規定到達者なし');
  await expect(panel(page).locator('tr[data-metric="era"]')).toContainText('成績記録なし');
  await expect(panel(page).locator('tr[data-metric="homeRuns"]').getByRole('button')).toHaveCount(
    0,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
