import { test, expect, type Page } from '@playwright/test';
import type { WorldView } from '../src/world/controller.ts';

/** 独立したテスト用ブラウザでWorkerの実応答を観測する。ゲーム指示は追加しない。 */
async function observeHome(page: Page) {
  await page.addInitScript(() => {
    const OriginalWorker = Worker;
    Reflect.set(window, 'homeCommands', 0);
    Reflect.set(
      window,
      'Worker',
      class extends OriginalWorker {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options);
          if (!url.toString().includes('world-worker')) return;
          Reflect.set(window, 'homeWorker', this);
          this.addEventListener('message', ({ data }) => {
            if (data?.view) Reflect.set(window, 'homeResponse', data);
          });
        }
        override postMessage(
          message: unknown,
          options?: Transferable[] | StructuredSerializeOptions,
        ) {
          if (message && typeof message === 'object' && 'localWorldId' in message) {
            Reflect.set(window, 'homeCommands', Reflect.get(window, 'homeCommands') + 1);
          }
          if (Array.isArray(options)) super.postMessage(message, options);
          else super.postMessage(message, options);
        }
      },
    );
  });
  await page.goto('/');
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24');
}

for (const width of [1280, 390, 320]) {
  test(`ホームの視覚表示：実データ・詳細・手動レポート・収まり (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 720 : 820 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await observeHome(page);
    const hero = page.getByRole('region', { name: '今日の対戦', exact: true });
    await expect(hero.getByRole('img', { name: '試合前・得点なし' })).toBeVisible();
    await expect(hero).toContainText('開始時刻 未設定');
    await expect(hero).toContainText('球場 未設定');
    const view = await page.evaluate(() => Reflect.get(window, 'homeResponse').view as WorldView);
    const starter = view.definitions.squads
      .flatMap((squad) => squad.players)
      .find((player) => player.playerId === view.registrationPreview!.starterId)!;
    const name = starter.familyName + ' ' + starter.givenName;
    const starterLink = hero.getByRole('button', { name: name + 'の選手詳細', exact: true });
    await expect(starterLink).toBeVisible();
    await expect(hero.locator('.match-starter[data-side="away"]')).toContainText('先発候補');
    await expect(hero.locator('.match-starter[data-side="home"]')).toContainText('先発未確定');
    await expect(hero.locator('.uniform-graphic text')).toHaveText(['—', '—']);
    await expect(hero.locator('.match-team-away')).toContainText('自球団');
    const action = hero.getByRole('button', { name: /^今日の試合へ/ });
    const actionBox = (await action.boundingBox())!;
    const menuBox = (await page.locator('.main-navigation').boundingBox())!;
    expect(actionBox.y + actionBox.height).toBeLessThanOrEqual(menuBox.y);
    await page.screenshot({ path: `.tmp/home-visual-qa/home-${width}.png` });
    await starterLink.click();
    await expect(page.getByRole('dialog')).toContainText(name);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(starterLink).toBeFocused();

    await page.getByRole('button', { name: 'リーグ順位のカード', exact: true }).click();
    const table = page.getByRole('table', { name: 'リーグ順位', exact: true });
    await expect(table.locator('tbody tr')).toHaveCount(view.standings.length);
    for (const [index, row] of view.standings.entries()) {
      await expect(table.locator('tbody tr').nth(index).locator('td.report-number')).toHaveText([
        String(row.wins),
        String(row.losses),
        String(row.draws),
      ]);
    }
    await page.getByRole('button', { name: '球団収支のカード', exact: true }).click();
    await expect(page.getByRole('button', { name: /収支サマリー.*工事中/ })).toBeDisabled();
    await page.getByRole('button', { name: '次の情報カード', exact: true }).click();
    await expect(page.getByRole('table', { name: '安打ランキング' })).toBeVisible();
    await expect(page.getByRole('region', { name: '球団情報カード' })).toContainText(
      '確定した試合の成績がまだありません',
    );
    const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
    await nav.getByRole('button', { name: '日程', exact: true }).click();
    await nav.getByRole('button', { name: 'ホーム', exact: true }).click();
    await expect(page.getByRole('button', { name: '安打ランキングのカード' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByText('日程・表示について', { exact: true }).click();
    await expect(page.locator('.home-display-notes')).toHaveAttribute('open', '');
    expect(await page.evaluate(() => Reflect.get(window, 'homeCommands'))).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  });
}

test('ホーム表示の試験用応答：進行中・終了・異常停止で左右の得点と確定先発を保持', async ({
  page,
}) => {
  await observeHome(page);
  for (const status of ['playing', 'completed', 'aborted'] as const) {
    // 表示専用の試験。実際の保存・Worker正本は変更せず、取得した応答を複製する。
    const expected = await page.evaluate((state) => {
      const response = structuredClone(Reflect.get(window, 'homeResponse')) as { view: WorldView };
      const view = response.view;
      const today = view.games.find(
        (game) =>
          game.date === view.currentDate &&
          game.statScope === 'firstRegular' &&
          game.awaySquadId === view.management!.controlledSquadId,
      )!;
      const away = view.definitions.squads.find((squad) => squad.squadId === today.awaySquadId)!;
      const home = view.definitions.squads.find((squad) => squad.squadId === today.homeSquadId)!;
      today.status = state;
      today.score = { away: 0, home: 12 };
      today.startingPitchers = { away: away.team.pitcherIds[0]!, home: home.team.pitcherIds[0]! };
      Reflect.get(window, 'homeWorker').dispatchEvent(
        new MessageEvent('message', { data: response }),
      );
      return { away: away.team.name, home: home.team.name };
    }, status);
    const hero = page.getByRole('region', { name: '今日の対戦', exact: true });
    await expect(
      hero.getByRole('img', { name: `${expected.away} 0 対 12 ${expected.home}` }),
    ).toBeVisible();
    await expect(hero.locator('.starter-label')).toHaveText(['先発投手', '先発投手']);
    await expect(hero.locator('.game-state')).toHaveText(
      {
        playing: '進行中',
        completed: '試合終了',
        aborted: '異常停止',
      }[status],
    );
    await expect(
      hero.getByRole('button', {
        name: status === 'completed' ? /^今日の結果・進行へ/ : /^今日の試合へ/,
      }),
    ).toBeVisible();
  }
  expect(await page.evaluate(() => Reflect.get(window, 'homeCommands'))).toBe(0);
});

test('ホーム表示の試験用応答：旧保存の候補なし・未知の球団・長い名前', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 820 });
  await observeHome(page);
  await page.evaluate(() => {
    // 球団IDは他の表示用データにも参照があるため、試験用応答全体で対応を保つ。
    const original = Reflect.get(window, 'homeResponse') as { view: WorldView };
    const oldId = original.view.definitions.squads.find(
      (squad) => squad.squadId === original.view.management!.controlledSquadId,
    )!.team.clubId;
    const response = JSON.parse(
      JSON.stringify(original).replaceAll(
        JSON.stringify(oldId),
        JSON.stringify('test-custom-club'),
      ),
    ) as { view: WorldView };
    response.view.registrationPreview = null;
    const squad = response.view.definitions.squads.find(
      (squad) => squad.squadId === response.view.management!.controlledSquadId,
    )!;
    squad.team.clubId = 'test-custom-club';
    squad.team.name = 'テスト用のとても長い球団名称ベースボールクラブ';
    Reflect.get(window, 'homeWorker').dispatchEvent(
      new MessageEvent('message', { data: response }),
    );
  });
  const hero = page.getByRole('region', { name: '今日の対戦', exact: true });
  await expect(hero.locator('.match-team-away .club-mark')).toHaveText('球');
  await expect(hero.locator('.starter-label')).toHaveText(['先発未確定', '先発未確定']);
  await expect(hero.locator('.starter-name')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
