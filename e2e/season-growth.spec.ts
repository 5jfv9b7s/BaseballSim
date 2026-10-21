import { test, expect, type Page } from '@playwright/test';
import type { WorldView } from '../src/world/controller.ts';

test.setTimeout(150000);
async function start(page: Page, legacy = false) {
  await page.addInitScript((legacy) => {
    const NativeWorker = Worker;
    Reflect.set(window, 'seasonGrowthCommands', []);
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes('world-worker'))
          this.addEventListener('message', (event) => {
            if (!event.data?.view) return;
            // 旧保存のUI投影のみ。実保存の復元はNodeで別途検査する。
            if (legacy) {
              event.data.view.growth = null;
              event.data.view.seasonGrowth = { firstRegular: null, farmRegular: null };
            }
            Reflect.set(window, 'seasonGrowthView', event.data.view);
          });
      }
      override postMessage(message: any, options?: Transferable[] | StructuredSerializeOptions) {
        if (message?.localWorldId)
          Reflect.get(window, 'seasonGrowthCommands').push(structuredClone(message));
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
  }, legacy);
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
async function summary(page: Page) {
  await menu(page, '成績');
  await page.getByRole('button', { name: 'シーズン総括', exact: true }).click();
}
const read = (page: Page) =>
  page.evaluate(() => Reflect.get(window, 'seasonGrowthView')) as Promise<WorldView>;
const count = (page: Page) =>
  page.evaluate(() => Reflect.get(window, 'seasonGrowthCommands').length) as Promise<number>;
const signed = (v: number) => (v > 0 ? `+${v}` : String(v));

for (const width of [1280, 390, 320])
  test(`年間成長総括：実日程・絞込・内訳・選手詳細と閲覧不変 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await start(page);
    await summary(page);
    const before = await read(page);
    const beforeCount = await count(page);
    const report = before.seasonGrowth.firstRegular!;
    const ownClub = before.definitions.squads.find(
      (s) => s.squadId === before.management!.controlledSquadId,
    )!;
    const expected = report.rows.filter((r) => r.clubId === ownClub.team.clubId);
    const panel = page.getByRole('region', { name: 'シーズンの能力成長', exact: true });
    const table = panel.getByRole('table', { name: '選手別の年間成長', exact: true });
    const rows = table.locator(':scope > tbody > tr:not([hidden])');
    await expect(panel).toContainText(`${report.from}〜${report.through}`);
    await expect(rows).toHaveCount(30);
    await expect(
      panel.getByRole('combobox', { name: '成長を確認する球団', exact: true }),
    ).toHaveValue(ownClub.team.clubId);
    await expect(rows.first()).toHaveAttribute('data-own-club', 'true');
    await expect(panel.getByRole('definition')).toHaveText([
      signed(expected.reduce((n, r) => n + r.increase, 0)),
      String(expected.reduce((n, r) => n + r.decrease, 0)),
      signed(expected.reduce((n, r) => n + r.net, 0)),
    ]);
    await table.getByRole('button', { name: '差引 ▼', exact: true }).click();
    await expect(table.getByRole('columnheader', { name: '差引 ▲', exact: true })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    await panel
      .getByRole('combobox', { name: '成長一覧の選手区分', exact: true })
      .selectOption('pitcher');
    await expect(rows).toHaveCount(expected.filter((r) => r.role === 'pitcher').length);
    await panel
      .getByRole('combobox', { name: '成長一覧の選手区分', exact: true })
      .selectOption('all');
    const changed = expected.find((r) => r.changes.length)!;
    await panel
      .getByRole('textbox', { name: '成長一覧の名前検索', exact: true })
      .fill(changed.name);
    await expect(rows).toHaveCount(1);
    await rows.getByRole('button', { name: `${changed.name}の成長内訳`, exact: true }).click();
    const detail = panel.getByRole('table', { name: `${changed.name}の能力変化`, exact: true });
    await expect(detail.locator('tbody tr')).toHaveCount(changed.changes.length);
    await expect(detail.getByRole('columnheader', { name: '終了', exact: true })).toHaveCSS(
      'text-align',
      'right',
    );
    await expect(detail.locator('tbody th').first()).toHaveCSS('white-space', 'normal');
    const first = changed.changes[0]!;
    await expect(detail.locator('tbody tr').first()).toContainText(first.label);
    await expect(detail.locator('tbody tr').first().locator('td').last()).toHaveText(
      signed(first.delta),
    );
    const detailRegion = panel.getByRole('region', {
      name: `${changed.name}の成長内訳`,
      exact: true,
    });
    await expect(detailRegion).toBeFocused();
    const detailScroll = detailRegion.getByRole('region', {
      name: '能力別内訳の横スクロール',
      exact: true,
    });
    if (width !== 1280) {
      await detailScroll.evaluate((e) => {
        e.scrollLeft = 1000;
      });
      await expect.poll(() => detailScroll.evaluate((e) => e.scrollLeft)).toBeGreaterThan(0);
      await expect(detail.locator('tbody th').first()).toBeInViewport();
      const abilityBox = (await detail.locator('tbody th').first().boundingBox())!;
      const scrollBox = (await detailScroll.boundingBox())!;
      const endText = await detail
        .locator('tbody tr')
        .first()
        .locator('td')
        .nth(1)
        .evaluate((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          const box = range.getBoundingClientRect();
          return { left: box.left, right: box.right };
        });
      expect(endText.left).toBeGreaterThanOrEqual(abilityBox.x + abilityBox.width);
      expect(endText.right).toBeLessThanOrEqual(scrollBox.x + scrollBox.width);
    }
    await detailRegion.screenshot({ path: `.tmp/season-growth-qa/detail-${width}.png` });
    await detailRegion.getByRole('button', { name: '内訳を閉じる', exact: true }).click();
    await expect(
      rows.getByRole('button', { name: `${changed.name}の成長内訳`, exact: true }),
    ).toBeFocused();
    // 絞込を戻しただけで旧内訳を再び開き、入力からフォーカスを奪わない。
    await rows.getByRole('button', { name: `${changed.name}の成長内訳`, exact: true }).click();
    const search = panel.getByRole('textbox', { name: '成長一覧の名前検索', exact: true });
    await search.fill('該当しない選手');
    await expect(detailRegion).toHaveCount(0);
    await search.fill(changed.name);
    await expect(search).toBeFocused();
    await expect(detailRegion).toHaveCount(0);
    await table.scrollIntoViewIfNeeded();
    await panel.screenshot({ path: `.tmp/season-growth-qa/report-${width}.png` });
    const scroll = panel.getByRole('region', { name: '年間成長一覧の横スクロール', exact: true });
    if (width !== 1280) {
      await scroll.evaluate((e) => {
        e.scrollLeft = 1000;
      });
      await expect.poll(() => scroll.evaluate((e) => e.scrollLeft)).toBeGreaterThan(0);
      await expect(rows.getByRole('button', { name: changed.name, exact: true })).toBeInViewport();
    }
    await rows.getByRole('button', { name: changed.name, exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText(changed.name);
    await page.keyboard.press('Escape');
    await panel
      .getByRole('textbox', { name: '成長一覧の名前検索', exact: true })
      .fill('該当しない選手');
    await expect(panel.getByRole('status')).toHaveText('条件に合う選手がいません。');
    await panel.getByRole('textbox', { name: '成長一覧の名前検索', exact: true }).fill('');
    const other = before.definitions.squads.find((s) => s.team.clubId !== ownClub.team.clubId)!;
    await panel
      .getByRole('combobox', { name: '成長を確認する球団', exact: true })
      .selectOption(other.team.clubId);
    await expect(rows).toHaveCount(30);
    await expect(rows.first()).toHaveAttribute('data-own-club', 'false');
    await page
      .getByRole('combobox', { name: '表示する大会', exact: true })
      .selectOption('farmRegular');
    await expect(panel).toContainText(
      `${before.seasonGrowth.farmRegular!.from}〜${before.seasonGrowth.farmRegular!.through}`,
    );
    await expect(
      panel.getByRole('combobox', { name: '成長を確認する球団', exact: true }),
    ).toHaveValue(ownClub.team.clubId);
    expect(await count(page)).toBe(beforeCount);
    expect(await read(page)).toEqual(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: '詳細成績へ', exact: true }).click();
    await expect(page.getByRole('region', { name: '累計個人成績', exact: true })).toBeVisible();
    await summary(page);
    await page.getByRole('button', { name: 'メモリアルへ', exact: true }).click();
    await expect(page.getByRole('region', { name: 'メモリアル', exact: true })).toBeVisible();
    await summary(page);
    await page.getByRole('button', { name: 'ホームへ', exact: true }).click();
    await expect(page.getByRole('button', { name: 'シーズン総括へ', exact: true })).toBeVisible();
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
      await summary(page);
      await expect(
        panel.getByRole('table', { name: '選手別の年間成長', exact: true }),
      ).toBeVisible();
      expect((await read(page)).seasonGrowth).toEqual(before.seasonGrowth);
    }
    expect(errors).toEqual([]);
  });

test('年間成長総括：旧保存の表示で0成長の表を作らない', async ({ page }) => {
  await start(page, true);
  await summary(page);
  const panel = page.getByRole('region', { name: 'シーズンの能力成長', exact: true });
  await expect(panel).toContainText('この保存には日次成長の記録がありません');
  await expect(panel.getByRole('table')).toHaveCount(0);
  await expect(panel.getByRole('definition')).toHaveCount(0);
});
