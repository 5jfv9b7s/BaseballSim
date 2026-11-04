import { openDevelopmentHome, reloadDevelopmentHome } from './main-entry.ts';
import { test, expect, type Page } from '@playwright/test';
import type { WorldView } from '../src/world/controller.ts';

test.setTimeout(180000);
const read = (page: Page) =>
  page.evaluate(() => Reflect.get(window, 'honorsView')) as Promise<WorldView>;
const count = (page: Page) =>
  page.evaluate(() => Reflect.get(window, 'honorsCommands')) as Promise<number>;
async function menu(page: Page, name: string) {
  await page
    .getByRole('navigation', { name: 'メインメニュー', exact: true })
    .getByRole('button', { name, exact: true })
    .click();
}
async function start(page: Page) {
  await page.addInitScript(() => {
    Reflect.set(window, 'honorsCommands', 0);
    const NativeWorker = Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes('world-worker'))
          this.addEventListener('message', (event) => {
            if (event.data?.view) Reflect.set(window, 'honorsView', event.data.view);
          });
      }
      override postMessage(message: any, options?: Transferable[] | StructuredSerializeOptions) {
        if (message?.localWorldId)
          Reflect.set(window, 'honorsCommands', Reflect.get(window, 'honorsCommands') + 1);
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
  });
  await openDevelopmentHome(page);
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24', {
    timeout: 30000,
  });
}
for (const width of [1280, 390, 320])
  test(`参考選考・無安打：年度終了・両リーグ・一二軍・選手詳細・再開・閲覧不変 (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await start(page);
    await menu(page, '成績');
    await page.getByRole('button', { name: 'メモリアル', exact: true }).click();
    const memorial = page.getByRole('region', { name: 'メモリアル', exact: true });
    const kind = memorial.getByRole('combobox', { name: '記録の種類' });
    await kind.selectOption('awards');
    await expect(memorial).toContainText('リーグ別の年度要約が確定すると表示');
    await menu(page, '日程');
    await page.getByRole('button', { name: '今日の進行', exact: true }).click();
    await page.getByRole('button', { name: 'シーズン終了まで進行', exact: true }).click();
    await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-28', {
      timeout: 90000,
    });
    const view = await read(page),
      before = await count(page);
    expect(view.referenceHonors.firstRegular).not.toBeNull();
    await menu(page, '成績');
    await page.getByRole('button', { name: 'メモリアル', exact: true }).click();
    await kind.selectOption('awards');
    const awards = memorial.getByRole('region', { name: '表彰の参考選考', exact: true });
    await expect(awards).toContainText('確定した受賞履歴ではありません');
    const first = view.referenceHonors.firstRegular!;
    expect(first.leagues).toHaveLength(2);
    const category = awards.getByRole('combobox', { name: '表彰の部門' });
    for (const section of ['title', 'bestNine', 'goldGlove']) {
      await category.selectOption(section);
      for (const league of first.leagues) {
        const table = awards.getByRole('table', {
          name: `${league.displayName}の表彰候補`,
          exact: true,
        });
        await expect(table.locator('tbody tr')).toHaveCount(
          league.awards.filter((a) => a.category === section).length,
        );
        const names = league.awards
          .filter((a) => a.category === section)
          .flatMap((a) => a.winners.map((w) => w.displayName));
        await expect(table.getByRole('button')).toHaveText(names);
      }
    }
    await category.selectOption('title');
    await awards.screenshot({ path: `.tmp/season-honors/awards-${width}.png` });
    const winner = first.leagues
      .flatMap((l) => l.awards.filter((a) => a.category === 'title'))
      .flatMap((a) => a.winners)[0]!;
    expect(winner).toBeTruthy();
    await awards.getByRole('button', { name: winner.displayName, exact: true }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '表彰候補', exact: true }).click();
    await expect(dialog.getByRole('region', { name: '選手の表彰候補' })).toContainText('参考選考');
    await dialog.getByRole('button', { name: '選手詳細を閉じる', exact: true }).click();
    await memorial.getByRole('combobox', { name: '記録の対象' }).selectOption('own');
    const clubId = view.definitions.squads.find(
      (s) => s.squadId === view.management!.controlledSquadId,
    )!.team.clubId;
    const ownNames = first.leagues
      .flatMap((l) => l.awards.filter((a) => a.category === 'title'))
      .flatMap((a) => a.winners.filter((w) => w.clubId === clubId).map((w) => w.displayName));
    await expect(awards.getByRole('table').getByRole('button')).toHaveText(ownNames);
    await page
      .getByRole('combobox', { name: '表示する大会', exact: true })
      .selectOption('farmRegular');
    await expect(awards).toContainText('二軍');
    await kind.selectOption('hitlessStreaks');
    const hitless = memorial.getByRole('region', { name: '連続打数無安打（試作）', exact: true });
    const expected = view.hitlessStreaks.farmRegular!.byClub[clubId]!;
    expect(expected.maximum).not.toBeNull();
    await expect(hitless.locator('.memorial-result strong')).toHaveText(`${expected.maximum}打数`);
    await expect(hitless.locator('tbody tr')).toHaveCount(expected.players.length);
    await hitless.screenshot({ path: `.tmp/season-honors/hitless-${width}.png` });
    const row = hitless.locator('tbody tr').first();
    await row.locator('summary').click();
    const point = expected.players[0]!.longest[0]!.lastAtBat;
    await row.getByRole('button', { name: '最後の無安打試合', exact: true }).first().click();
    await expect(page.getByRole('region', { name: '日別の試合結果', exact: true })).toBeVisible();
    await expect(
      page.getByRole('combobox', { name: '詳細を表示する試合', exact: true }),
    ).toHaveValue(point.gameId);
    await menu(page, '成績');
    await page.getByRole('button', { name: 'シーズン総括', exact: true }).click();
    await expect(
      page
        .getByRole('region', { name: 'シーズン終了要約' })
        .getByRole('region', { name: '表彰の参考選考', exact: true }),
    ).toContainText('参考選考');
    expect(await count(page)).toBe(before);
    expect(await read(page)).toEqual(view);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `.tmp/season-honors/summary-${width}.png`, fullPage: true });
    if (width === 1280) {
      await reloadDevelopmentHome(page);
      await page.getByRole('button', { name: 'セーブから再開 →', exact: true }).click();
      await page
        .getByRole('combobox', { name: '保存済みプレイ', exact: true })
        .selectOption(view.localWorldId);
      await page.getByRole('combobox', { name: '開く保存枠', exact: true }).selectOption('auto');
      await page.getByRole('button', { name: '選んだプレイを開く', exact: true }).click();
      await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', view.currentDate, {
        timeout: 30000,
      });
      const loaded = await read(page);
      expect(loaded.referenceHonors).toEqual(view.referenceHonors);
      expect(loaded.hitlessStreaks).toEqual(view.hitlessStreaks);
    }
    expect(errors).toEqual([]);
  });
