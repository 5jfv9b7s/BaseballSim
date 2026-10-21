import { test, expect } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`選手詳細と貯金グラフ：表示・検索・一二軍・保存復帰 (${width}px)`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const original = Worker.prototype.postMessage;
      Reflect.set(window, 'detailCommands', 0);
      Worker.prototype.postMessage = function (message: unknown, options?: unknown) {
        if (message && typeof message === 'object' && 'localWorldId' in message)
          Reflect.set(window, 'detailCommands', Reflect.get(window, 'detailCommands') + 1);
        original.call(this, message, options as StructuredSerializeOptions);
      };
    });
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
    await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24', {
      timeout: 30000,
    });
    await nav.getByRole('button', { name: 'チーム', exact: true }).click();
    const directory = page.getByRole('region', { name: '選手一覧', exact: true });
    const club = directory.getByRole('combobox', { name: '選手の球団', exact: true });
    await expect(directory.locator('.player-link')).toHaveCount(30);
    await club.selectOption({ index: 1 });
    await directory
      .getByRole('combobox', { name: '選手の種類', exact: true })
      .selectOption('pitcher');
    const first = directory.locator('.player-link').first();
    const name = await first.innerText();
    await directory.getByRole('textbox', { name: '名前で検索', exact: true }).fill(name);
    await first.click();
    const detail = page.getByRole('dialog');
    await expect(detail).toHaveAccessibleName(name);
    await expect(detail.getByRole('table', { name: '選手の球種', exact: true })).toBeVisible();
    await expect(
      detail.getByRole('table', { name: '選手の基本能力', exact: true }),
    ).not.toContainText('記録なし');
    await detail.screenshot({ path: `.tmp/main-details-qa/ability-${width}.png` });
    await detail.getByRole('button', { name: '状態・成長', exact: true }).click();
    await expect(detail.locator('.player-state')).not.toContainText('記録なし');
    await expect(detail).toContainText('まだ日次の練習実績がありません');
    await detail.getByRole('button', { name: '成績', exact: true }).click();
    await expect(detail).toContainText('この大会の成績記録はありません');
    await page.keyboard.press('Escape');
    await expect(detail).toHaveCount(0);
    await expect(first).toBeFocused();
    await expect(directory.getByRole('textbox', { name: '名前で検索', exact: true })).toHaveValue(
      name,
    );
    expect(await page.evaluate(() => Reflect.get(window, 'detailCommands'))).toBe(0);
    await nav.getByRole('button', { name: 'ホーム', exact: true }).click();
    await page.getByRole('button', { name: /^今日の試合へ/ }).click();
    await page.getByRole('button', { name: '1日を自動進行', exact: true }).click();
    await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-25', {
      timeout: 45000,
    });
    await nav.getByRole('button', { name: '成績', exact: true }).click();
    await page.getByRole('button', { name: '個人成績', exact: true }).click();
    const ranking = page.getByRole('table', { name: '打撃ランキング', exact: true });
    const rankedPlayer = ranking.locator('tbody .player-link').first();
    await rankedPlayer.click();
    await detail.getByRole('button', { name: '成績', exact: true }).click();
    await expect(detail.getByRole('heading', { name: '打撃成績', exact: true })).toBeVisible();
    await detail
      .getByRole('combobox', { name: '選手成績の大会', exact: true })
      .selectOption('farmRegular');
    await expect(detail).toContainText('この大会の成績記録はありません');
    await detail.getByRole('button', { name: '選手詳細を閉じる', exact: true }).click();
    await expect(rankedPlayer).toBeFocused();
    await nav.getByRole('button', { name: '日程', exact: true }).click();
    const chart = page.getByRole('region', { name: '貯金・借金の推移', exact: true });
    const balance = chart.getByRole('table', { name: '選択日の貯金・借金', exact: true });
    await expect(balance.locator('tbody tr')).toHaveCount(4);
    const commands = await page.evaluate(() => Reflect.get(window, 'detailCommands'));
    await chart
      .getByRole('combobox', { name: 'グラフで確認する日', exact: true })
      .selectOption('2026-09-24');
    await expect(
      page.getByRole('complementary', { name: '選択日の詳細', exact: true }),
    ).toContainText('選択日：2026-09-24');
    const firstValues = await balance.locator('tbody tr').allTextContents();
    await expect(balance.locator('[data-own-club="true"]')).toHaveCount(1);
    await chart.screenshot({ path: `.tmp/main-details-qa/balance-${width}.png` });
    await page
      .getByRole('combobox', { name: '表示する大会', exact: true })
      .selectOption('farmRegular');
    await expect(chart).toContainText('二軍公式戦');
    await expect(balance).toContainText('二軍');
    await page
      .getByRole('combobox', { name: '表示する大会', exact: true })
      .selectOption('firstRegular');
    expect(await balance.locator('tbody tr').allTextContents()).toEqual(firstValues);
    expect(await page.evaluate(() => Reflect.get(window, 'detailCommands'))).toBe(commands);
    await page
      .getByRole('complementary', { name: '選択日の詳細', exact: true })
      .getByRole('button', { name: '試合詳細へ', exact: true })
      .click();
    const results = page.getByRole('region', { name: '日別の試合結果', exact: true });
    await expect(results).toContainText('表示している結果：2026-09-24');
    // 過去試合は保存内の当時の選手表示を維持し、現在選手のリンクへ置換しない。
    await expect(results.locator('.player-link')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await nav.getByRole('button', { name: 'システム', exact: true }).click();
    await page.getByRole('button', { name: '世界を手動保存', exact: true }).click();
    await expect(page.getByRole('button', { name: '手動保存を読み込む', exact: true })).toBeEnabled(
      { timeout: 30000 },
    );
    await page.reload();
    await page.getByRole('button', { name: 'セーブから再開 →', exact: true }).click();
    await page.getByRole('button', { name: '手動保存を読み込む', exact: true }).click();
    await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-25', {
      timeout: 30000,
    });
    await nav.getByRole('button', { name: '日程', exact: true }).click();
    await chart
      .getByRole('combobox', { name: 'グラフで確認する日', exact: true })
      .selectOption('2026-09-24');
    expect(await balance.locator('tbody tr').allTextContents()).toEqual(firstValues);
    expect(errors).toEqual([]);
  });
}

test('年間表示：未確定のグラフを月変更で補完せず、進行中の選手タブを保持する', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24', {
    timeout: 30000,
  });
  await nav.getByRole('button', { name: 'システム', exact: true }).click();
  await page.getByRole('button', { name: '新規プレイ', exact: true }).click();
  await page.getByText('新規日程・担当球団と試作の範囲', { exact: true }).click();
  await page
    .getByRole('combobox', { name: '新規プレイの日程', exact: true })
    .selectOption('annual');
  await page.getByRole('button', { name: '新しい日程を準備', exact: true }).click();
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-03-27');
  await nav.getByRole('button', { name: '日程', exact: true }).click();
  const chart = page.getByRole('region', { name: '貯金・借金の推移', exact: true });
  await expect(chart.getByRole('img')).toHaveCount(0);
  await expect(chart).toContainText('表示できる日付はまだありません');
  await page.getByRole('button', { name: '翌月', exact: true }).click();
  await expect(chart.getByRole('img')).toHaveCount(0);
  await expect(chart).toContainText('表示できる日付はまだありません');
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-03-27');
  await page.getByRole('button', { name: '現在月', exact: true }).click();
  await expect(chart.getByRole('img')).toHaveCount(0);
  // Workerの更新が連続しても、開いたタブが能力に戻らないことを確認する。
  await page.evaluate(() => {
    const original = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message: unknown, options?: unknown) {
      if (message && typeof message === 'object' && 'kind' in message && message.kind === 'advance')
        setTimeout(() => original.call(this, message, options as StructuredSerializeOptions), 35);
      else original.call(this, message, options as StructuredSerializeOptions);
    };
  });
  await page.getByRole('button', { name: '今日の進行', exact: true }).click();
  await page.getByRole('button', { name: '1日を自動進行', exact: true }).click();
  await nav.getByRole('button', { name: 'チーム', exact: true }).click();
  await page
    .getByRole('region', { name: '選手一覧', exact: true })
    .locator('.player-link')
    .first()
    .click();
  const detail = page.getByRole('dialog');
  await detail.getByRole('button', { name: '状態・成長', exact: true }).click();
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-03-28', {
    timeout: 45000,
  });
  await expect(detail.getByRole('button', { name: '状態・成長', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(detail).toContainText('2026-03-28現在の状態');
  await detail.getByRole('button', { name: '選手詳細を閉じる', exact: true }).click();
});

test('貯金グラフ：同日の一部終了では更新せず、全試合終了後に一斉更新する', async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    let hold = false;
    let released = false;
    let pending: (() => void) | undefined;
    Reflect.set(window, 'releaseGraphDay', () => {
      released = true;
      hold = false;
      pending?.();
      pending = undefined;
    });
    window.Worker = class extends NativeWorker {
      isWorld: boolean;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.isWorld = String(url).includes('world-worker');
        if (this.isWorld)
          this.addEventListener('message', (event) => {
            const view = event.data?.view;
            if (!view) return;
            const today = view.games.filter((g: { date: string }) => g.date === view.currentDate);
            const done = today.filter((g: { status: string }) => g.status === 'completed').length;
            if (!released && done > 0 && done < today.length) {
              hold = true;
              Reflect.set(window, 'partialGraphDay', { done, total: today.length });
            }
          });
      }
      postMessage(message: unknown, options?: StructuredSerializeOptions | Transferable[]) {
        const send = () => {
          if (Array.isArray(options)) super.postMessage(message, options);
          else super.postMessage(message, options);
        };
        if (
          this.isWorld &&
          hold &&
          message &&
          typeof message === 'object' &&
          'kind' in message &&
          message.kind === 'advance'
        ) {
          pending = send;
          Reflect.set(window, 'graphDayHeld', true);
        } else send();
      }
    };
  });
  await page.goto('/');
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24', {
    timeout: 30000,
  });
  await page.getByRole('button', { name: /^今日の試合へ/ }).click();
  await page.getByRole('button', { name: '1日を自動進行', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'graphDayHeld'))).toBe(true);
  const partial = await page.evaluate(() => Reflect.get(window, 'partialGraphDay'));
  expect(partial.done).toBeGreaterThan(0);
  expect(partial.done).toBeLessThan(partial.total);
  const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
  await nav.getByRole('button', { name: '日程', exact: true }).click();
  const chart = page.getByRole('region', { name: '貯金・借金の推移', exact: true });
  await expect(chart.getByRole('img')).toHaveCount(0);
  await expect(chart).toContainText('表示できる日付はまだありません');
  await page.screenshot({ path: '.tmp/formation-spec-qa/graph-partial.png', fullPage: true });
  await page.evaluate(() => Reflect.get(window, 'releaseGraphDay')());
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-25', {
    timeout: 45000,
  });
  await expect(chart.getByRole('img')).toBeVisible();
  await expect(
    chart.getByRole('combobox', { name: 'グラフで確認する日', exact: true }),
  ).toHaveValue('2026-09-24');
  await expect(
    chart.getByRole('combobox', { name: 'グラフで確認する日', exact: true }).locator('option'),
  ).toHaveCount(1);
  await page.screenshot({ path: '.tmp/formation-spec-qa/graph-completed.png', fullPage: true });
});
