import { test, expect, type Page } from '@playwright/test';
import type { WorldView } from '../src/world/controller.ts';

async function observe(page: Page, legacy = false) {
  await page.addInitScript((legacy) => {
    const NativeWorker = Worker;
    Reflect.set(window, 'leaderboardReadCommands', 0);
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes('world-worker'))
          this.addEventListener('message', (event) => {
            if (event.data?.view) {
              // 読み取り投影だけで旧保存を再現。保存やWorker内の正本は書き換えない。
              if (legacy) {
                event.data.view.definitions.version = 'world-definitions-v16';
                delete event.data.view.definitions.leagueStructure;
              }
              Reflect.set(window, 'leaderboardReadView', event.data.view);
            }
          });
      }
      override postMessage(
        message: unknown,
        options?: Transferable[] | StructuredSerializeOptions,
      ) {
        if (message && typeof message === 'object' && 'localWorldId' in message)
          Reflect.set(
            window,
            'leaderboardReadCommands',
            Reflect.get(window, 'leaderboardReadCommands') + 1,
          );
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
  }, legacy);
  await page.goto('/');
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24');
}

for (const width of [1280, 390, 320]) {
  test(`個人成績：リーグ・率・固定列 (${width}px)`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await observe(page);
    await page.getByRole('button', { name: /^今日の試合へ/ }).click();
    await page.getByRole('button', { name: '1日を自動進行', exact: true }).click();
    await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-25', {
      timeout: 45000,
    });
    await page
      .getByRole('navigation', { name: 'メインメニュー', exact: true })
      .getByRole('button', { name: '成績', exact: true })
      .click();
    await page.getByRole('button', { name: '個人成績', exact: true }).click();
    const panel = page.getByRole('region', { name: '累計個人成績', exact: true });
    const league = panel.getByRole('combobox', { name: '成績のリーグ', exact: true });
    const club = panel.getByRole('combobox', { name: '成績の球団', exact: true });
    const metric = panel.getByRole('combobox', { name: '並べ替える指標', exact: true });
    const batting = panel.getByRole('table', { name: '打撃ランキング', exact: true });
    const commands = await page.evaluate(() => Reflect.get(window, 'leaderboardReadCommands'));
    const view = (await page.evaluate(() =>
      Reflect.get(window, 'leaderboardReadView'),
    )) as WorldView;
    await expect(league).toHaveValue('fictional-sky-league');
    await expect(club.locator('option')).toHaveCount(3);
    await expect(batting).toContainText('星原フォックス');
    await expect(batting).toContainText('湖白スワンズ');
    await expect(batting).not.toContainText('青凪ハーバーズ');
    const skyCount = await batting.locator('tbody tr').count();
    await metric.selectOption('ops');
    await expect(panel.getByRole('heading', { level: 3 })).toContainText(
      'スカイリーグ ／ 打撃ランキング：OPS',
    );
    await expect(
      panel.getByText('OPS＝丸め前の出塁率＋丸め前の長打率', { exact: true }),
    ).toBeVisible();
    await expect(panel.getByRole('combobox', { name: '率の対象', exact: true })).toBeDisabled();
    const allSky = await batting.locator('tbody tr').allTextContents();
    const ownClub = await club
      .locator('option')
      .filter({ hasText: '担当球団' })
      .getAttribute('value');
    await club.selectOption(ownClub!);
    const filtered = await batting.locator('tbody tr').allTextContents();
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((row) => allSky.includes(row))).toBe(true);
    await expect(batting.locator('tbody tr:not([data-own-club="true"])')).toHaveCount(0);
    await league.selectOption('fictional-ocean-league');
    await expect(club).toHaveValue('');
    await expect(club.locator('option')).toHaveCount(3);
    await expect(batting).toContainText('青凪ハーバーズ');
    await expect(batting).not.toContainText('星原フォックス');
    const oceanCount = await batting.locator('tbody tr').count();
    await league.selectOption('');
    await expect(batting.locator('tbody tr')).toHaveCount(skyCount + oceanCount);
    await expect(panel.getByRole('heading', { level: 3 })).toContainText('全リーグ（合算）');
    await expect(club.locator('option')).toHaveCount(5);
    await league.selectOption('fictional-ocean-league');
    await page
      .getByRole('combobox', { name: '表示する大会', exact: true })
      .selectOption('farmRegular');
    await expect(league).toBeDisabled();
    await expect(batting).toContainText('二軍');
    await expect(club.locator('option')).toHaveCount(5);
    await page
      .getByRole('combobox', { name: '表示する大会', exact: true })
      .selectOption('firstRegular');
    await expect(league).toHaveValue('fictional-ocean-league');
    await panel.getByRole('button', { name: '投手', exact: true }).click();
    await metric.selectOption('whip');
    await expect(panel.getByRole('combobox', { name: '並び順', exact: true })).toHaveValue(
      'ascending',
    );
    await expect(panel.getByRole('table', { name: '投手ランキング', exact: true })).toContainText(
      'K/BB',
    );
    await panel.getByRole('button', { name: '守備', exact: true }).click();
    await metric.selectOption('fieldingPercentage');
    await panel.getByRole('combobox', { name: '守備位置', exact: true }).selectOption('C');
    await expect(
      panel.getByRole('table', { name: '守備ランキング', exact: true }).locator('tbody tr'),
    ).toHaveCount(2);
    await panel.getByRole('button', { name: '打撃', exact: true }).click();
    await metric.selectOption('ops');
    await panel.locator('.season-leaderboard').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `.tmp/league-leaderboard-qa/controls-${width}.png` });
    const scroll = panel.getByRole('region', { name: '成績表の横スクロール', exact: true });
    const name = batting.locator('tbody th').first();
    const before = await name.boundingBox();
    await scroll.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    const after = await name.boundingBox();
    expect(Math.abs(before!.x - after!.x)).toBeLessThanOrEqual(1);
    // 固定フッターの下へ隠れない位置まで送り、実際の数値列を撮影する。
    await batting.locator('thead').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: `.tmp/league-leaderboard-qa/ops-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(await page.evaluate(() => Reflect.get(window, 'leaderboardReadCommands'))).toBe(
      commands,
    );
    const afterView = (await page.evaluate(() =>
      Reflect.get(window, 'leaderboardReadView'),
    )) as WorldView;
    expect(afterView).toEqual(view);
    await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-25');
    expect(errors).toEqual([]);
  });
}

test('個人成績：旧保存の所属未記録', async ({ page }) => {
  await observe(page, true);
  await page
    .getByRole('navigation', { name: 'メインメニュー', exact: true })
    .getByRole('button', { name: '成績', exact: true })
    .click();
  await page.getByRole('button', { name: '個人成績', exact: true }).click();
  const panel = page.getByRole('region', { name: '累計個人成績', exact: true });
  const league = panel.getByRole('combobox', { name: '成績のリーグ', exact: true });
  await expect(league).toBeDisabled();
  await expect(league.locator('option')).toHaveText('リーグ情報の記録なし');
  await expect(panel).toContainText('条件に合う成績がありません');
  await expect(
    panel.getByRole('combobox', { name: '成績の球団', exact: true }).locator('option'),
  ).toHaveCount(5);
});
