import { test, expect } from '@playwright/test';
import type { WorldWorkerResponse } from '../src/world-worker.ts';

async function observe(page: import('@playwright/test').Page, legacy = false) {
  await page.addInitScript((legacy) => {
    const NativeWorker = Worker;
    Reflect.set(window, 'leagueCommands', 0);
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes('world-worker'))
          this.addEventListener('message', (event) => {
            // 旧形式の表示投影だけを確認する。Workerの正本とDBは変更しない。
            if (legacy && event.data?.view) {
              const definitions = event.data.view.definitions;
              definitions.version = 'world-definitions-v16';
              delete definitions.leagueStructure;
              for (const game of definitions.schedule) delete game.stadiumRef;
            }
            Reflect.set(window, 'leagueResponse', event.data);
          });
      }
      override postMessage(
        message: unknown,
        options?: Transferable[] | StructuredSerializeOptions,
      ) {
        if (message && typeof message === 'object' && 'localWorldId' in message)
          Reflect.set(window, 'leagueCommands', Reflect.get(window, 'leagueCommands') + 1);
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
  }, legacy);
  await page.goto('/');
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24');
}

for (const width of [1280, 390]) {
  test(`大会・本拠地：ホーム・一二軍日程・新規確認・初回保存 (${width}px)`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await observe(page);
    const hero = page.getByRole('region', { name: '今日の対戦', exact: true });
    await expect(hero).toContainText('球場 青凪スタジアム');
    const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
    await nav.getByRole('button', { name: '日程', exact: true }).click();
    const detail = page.getByRole('complementary', { name: '選択日の詳細', exact: true });
    await expect(detail).toContainText('球場：青凪スタジアム');
    await page
      .getByRole('combobox', { name: '表示する大会', exact: true })
      .selectOption('farmRegular');
    const response = await page.evaluate(
      () => Reflect.get(window, 'leagueResponse') as WorldWorkerResponse,
    );
    const d = response.view.definitions;
    const own = d.farm!.squads.find((s) => s.team.clubId === d.squads[0]!.team.clubId)!;
    const scheduled = d.schedule.find(
      (g) => g.date === '2026-09-24' && [g.awaySquadId, g.homeSquadId].includes(own.squadId),
    )!;
    const stadium = d.leagueStructure!.stadiums.find(
      (s) => s.stadiumId === scheduled.stadiumRef!.stadiumId,
    )!;
    await expect(detail).toContainText('球場：' + stadium.displayName);
    await nav.getByRole('button', { name: 'システム', exact: true }).click();
    await page.getByRole('button', { name: '新規プレイ', exact: true }).click();
    await page.getByText('新規日程・担当球団と試作の範囲', { exact: true }).click();
    await page
      .getByRole('combobox', { name: '新規プレイの担当球団', exact: true })
      .selectOption('aonagi-first');
    const preview = page.getByRole('region', { name: '新規球団の確認', exact: true });
    await expect(preview).toContainText('青凪ハーバーズ');
    await expect(preview).toContainText('一軍本拠地青凪スタジアム');
    await expect(preview).toContainText('二軍本拠地青凪第二球場');
    await expect(preview).toContainText('2026-09-24');
    await page
      .getByRole('combobox', { name: '新規プレイの日程', exact: true })
      .selectOption('annual');
    await expect(preview).toContainText('2026-03-27');
    await expect(preview).toContainText('2026-09-30');
    expect(await page.evaluate(() => Reflect.get(window, 'leagueCommands'))).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await preview.evaluate((element) => element.scrollIntoView({ block: 'start' }));
    const closingDate = preview.getByText('2026-09-30', { exact: true });
    await expect(closingDate).toBeInViewport();
    expect(
      (await closingDate.boundingBox())!.y + (await closingDate.boundingBox())!.height,
    ).toBeLessThan((await page.locator('.main-navigation').boundingBox())!.y);
    await preview.screenshot({ path: `.tmp/league-structure-qa/setup-${width}.png` });
    await page.getByRole('button', { name: '新しい日程を準備', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('初回保存が完了', { timeout: 30000 });
    await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-03-27');
    const saved = await page.evaluate(
      () => Reflect.get(window, 'leagueResponse') as WorldWorkerResponse,
    );
    expect(saved.view.definitions.version).toBe('world-definitions-v17');
    expect(saved.view.management!.controlledSquadId).toBe('aonagi-first');
    expect(saved.view.unsavedChanges).toBe(false);
    await page.screenshot({ path: `.tmp/league-structure-qa/home-${width}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}

test('旧形式の表示：球場を現行データで補わず、新規確認は現行初期データを使う', async ({ page }) => {
  await observe(page, true);
  await expect(page.getByRole('region', { name: '今日の対戦', exact: true })).toContainText(
    '球場 記録なし',
  );
  const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
  await nav.getByRole('button', { name: '日程', exact: true }).click();
  await expect(
    page.getByRole('complementary', { name: '選択日の詳細', exact: true }),
  ).toContainText('球場：記録なし');
  await nav.getByRole('button', { name: 'システム', exact: true }).click();
  await page.getByRole('button', { name: '新規プレイ', exact: true }).click();
  await page.getByText('新規日程・担当球団と試作の範囲', { exact: true }).click();
  await expect(page.getByRole('region', { name: '新規球団の確認', exact: true })).toContainText(
    '星原スタジアム',
  );
  expect(await page.evaluate(() => Reflect.get(window, 'leagueCommands'))).toBe(0);
});

test('終了試合：日程から開いた試合に保存内の開催球場を表示する', async ({ page }) => {
  test.setTimeout(90000);
  await observe(page);
  await page.getByRole('button', { name: /^今日の試合へ/ }).click();
  await page.getByRole('button', { name: '1日を自動進行', exact: true }).click();
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-25', {
    timeout: 45000,
  });
  await page
    .getByRole('navigation', { name: 'メインメニュー', exact: true })
    .getByRole('button', { name: '日程', exact: true })
    .click();
  await page
    .getByRole('combobox', { name: 'グラフで確認する日', exact: true })
    .selectOption('2026-09-24');
  await page
    .getByRole('complementary', { name: '選択日の詳細', exact: true })
    .getByRole('button', { name: '試合詳細へ', exact: true })
    .click();
  const result = page.getByRole('region', { name: '日別の試合結果', exact: true });
  await expect(result).toContainText('開催球場：青凪スタジアム');
  await expect(
    result.getByRole('table', { name: '日次のイニング別スコア', exact: true }),
  ).toBeVisible();
});
