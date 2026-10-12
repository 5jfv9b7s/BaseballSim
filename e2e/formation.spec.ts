import { test, expect } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`本画面編成：共有編集・元に戻す・退出保存・詳細閲覧・再開 (${width}px)`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      Reflect.set(window, 'formationCommands', 0);
      const original = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (message: unknown, options?: unknown) {
        if (
          message &&
          typeof message === 'object' &&
          'kind' in message &&
          message.kind === 'setFormation'
        )
          Reflect.set(window, 'formationCommands', Reflect.get(window, 'formationCommands') + 1);
        original.call(this, message, options as StructuredSerializeOptions);
      };
    });
    await page.goto('/');
    await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24');
    const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
    await nav.getByRole('button', { name: '編成', exact: true }).click();
    const editor = page.getByRole('region', { name: '編成の編集', exact: true });
    const order = page.getByRole('region', { name: '理想オーダー', exact: true });
    const first = editor.getByRole('combobox', { name: '1番の選手', exact: true });
    const originalId = await first.inputValue();
    const originalSecond = await editor
      .getByRole('combobox', { name: '2番の選手', exact: true })
      .inputValue();
    const demote = order.getByRole('button', { name: /を二軍へ$/ }).first();
    const demoteName = (await demote.getAttribute('aria-label'))!;
    await demote.click();
    const farm = page.getByRole('region', { name: '二軍野手', exact: true });
    await farm
      .getByRole('button', { name: demoteName.replace('二軍', '一軍'), exact: true })
      .click();
    await expect(editor).toContainText('変更はありません');
    await nav.getByRole('button', { name: 'ホーム', exact: true }).click();
    expect(await page.evaluate(() => Reflect.get(window, 'formationCommands'))).toBe(0);
    await nav.getByRole('button', { name: '編成', exact: true }).click();
    await editor.getByRole('button', { name: '1番を下へ', exact: true }).click();
    await expect(first).toHaveValue(originalSecond);
    await editor.getByRole('button', { name: '投手オーダー', exact: true }).click();
    await editor.getByRole('button', { name: '起用方針', exact: true }).click();
    await expect(editor).toContainText('起用方針の本画面編集は工事中');
    await editor.getByRole('button', { name: '野手オーダー', exact: true }).click();
    await expect(first).toHaveValue(originalSecond);
    await editor.getByRole('button', { name: '選手詳細を開く', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(first).toHaveValue(originalSecond);
    expect(await page.evaluate(() => Reflect.get(window, 'formationCommands'))).toBe(0);
    await editor.getByRole('button', { name: '変更を戻す', exact: true }).click();
    await expect(first).toHaveValue(originalId);
    await editor.getByRole('button', { name: '1番を下へ', exact: true }).click();
    await page.screenshot({ path: `.tmp/formation-qa/batters-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await nav.getByRole('button', { name: 'ホーム', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'クラブハウス', exact: true })).toBeVisible();
    expect(await page.evaluate(() => Reflect.get(window, 'formationCommands'))).toBe(1);
    await nav.getByRole('button', { name: '編成', exact: true }).click();
    await expect(first).toHaveValue(originalSecond);
    await editor.getByRole('button', { name: '投手オーダー', exact: true }).click();
    await page.screenshot({ path: `.tmp/formation-qa/pitchers-${width}.png`, fullPage: true });
    await nav.getByRole('button', { name: 'システム', exact: true }).click();
    await page.getByRole('button', { name: '世界を手動保存', exact: true }).click();
    await expect(
      page.getByRole('button', { name: '手動保存を読み込む', exact: true }),
    ).toBeEnabled();
    await page.reload();
    await page.getByRole('button', { name: 'セーブから再開 →', exact: true }).click();
    await page.getByRole('button', { name: '手動保存を読み込む', exact: true }).click();
    await expect(
      page.getByText('保存した世界を読み込みました。進行は停止しています。', { exact: true }),
    ).toBeVisible();
    await nav.getByRole('button', { name: '編成', exact: true }).click();
    await expect(first).toHaveValue(originalSecond);
    expect(errors).toEqual([]);
  });
}

test('編成エラー：先発0人では退出せず、取消後は保存なしで移動する', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24');
  const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
  await nav.getByRole('button', { name: '編成', exact: true }).click();
  const editor = page.getByRole('region', { name: '編成の編集', exact: true });
  await editor.getByRole('button', { name: '投手オーダー', exact: true }).click();
  const rotation = page.getByRole('region', { name: '先発ローテーション', exact: true });
  while (await rotation.getByRole('button', { name: '救援へ', exact: true }).count())
    await rotation.getByRole('button', { name: '救援へ', exact: true }).first().click();
  await nav.getByRole('button', { name: 'ホーム', exact: true }).click();
  await expect(page.getByText(/ローテーション人数:/)).toBeVisible();
  await expect(editor).toBeVisible();
  await expect(editor).toContainText('変更中');
  await editor.getByRole('button', { name: '変更を戻す', exact: true }).click();
  await expect(rotation.getByRole('button', { name: '救援へ', exact: true }).first()).toBeVisible();
  await nav.getByRole('button', { name: 'ホーム', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'クラブハウス', exact: true })).toBeVisible();
});

test('編成ドラッグ：選手と守備位置の交換を分け、開発画面への退出でも保存する', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.goto('/');
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24');
  const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
  await nav.getByRole('button', { name: '編成', exact: true }).click();
  const editor = page.getByRole('region', { name: '編成の編集', exact: true });
  const slots = editor.locator('.formation-slot');
  const ids = [
    await slots.nth(0).getByRole('combobox').first().inputValue(),
    await slots.nth(1).getByRole('combobox').first().inputValue(),
  ];
  const roles = [
    await slots.nth(0).getByRole('combobox').nth(1).inputValue(),
    await slots.nth(1).getByRole('combobox').nth(1).inputValue(),
  ];
  await slots.nth(0).locator('.player-link').dragTo(slots.nth(1).locator('.player-link'));
  await expect(slots.nth(0).getByRole('combobox').first()).toHaveValue(ids[1]!);
  await expect(slots.nth(0).getByRole('combobox').nth(1)).toHaveValue(roles[1]!);
  await slots.nth(0).locator('span[draggable]').dragTo(slots.nth(1).locator('.player-link'));
  await expect(slots.nth(0).getByRole('combobox').first()).toHaveValue(ids[1]!);
  await expect(slots.nth(0).getByRole('combobox').nth(1)).toHaveValue(roles[0]!);
  await page.getByRole('button', { name: 'シミュレーション開発ツール ↗', exact: true }).click();
  await expect(page.getByRole('button', { name: '本画面へ戻る', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /本画面へ戻る/ }).click();
  await nav.getByRole('button', { name: '編成', exact: true }).click();
  await expect(slots.nth(0).getByRole('combobox').first()).toHaveValue(ids[1]!);
  await expect(slots.nth(0).getByRole('combobox').nth(1)).toHaveValue(roles[0]!);
});

test('編成登録：最終差分だけを確定し、抹消した選手の再登録日を表示する', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 960 });
  await page.goto('/');
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24');
  const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
  await nav.getByRole('button', { name: '編成', exact: true }).click();
  const editor = page.getByRole('region', { name: '編成の編集', exact: true });
  const bench = page.getByRole('region', { name: '一軍控え', exact: true });
  const farm = page.getByRole('region', { name: '二軍野手', exact: true });
  const demote = bench.getByRole('button', { name: /を二軍へ$/ }).first();
  const demoteLabel = (await demote.getAttribute('aria-label'))!;
  const promote = farm.getByRole('button', { name: /を一軍へ$/ }).first();
  const promoteLabel = (await promote.getAttribute('aria-label'))!;
  await promote.click();
  await demote.click();
  await nav.getByRole('button', { name: 'ホーム', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'クラブハウス', exact: true })).toBeVisible();
  await nav.getByRole('button', { name: '編成', exact: true }).click();
  await expect(
    farm.getByRole('button', { name: demoteLabel.replace('二軍', '一軍'), exact: true }),
  ).toBeDisabled();
  await expect(farm).toContainText('再登録可能：2026-10-04');
  await expect(
    bench.getByRole('button', { name: promoteLabel.replace('一軍', '二軍'), exact: true }),
  ).toBeEnabled();
  await bench.locator('.player-link').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(editor).toContainText('変更はありません');
});

test('進行中の編成は閲覧のみで、翌日から新しい編集案を開始できる', async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => {
    const original = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message: unknown, options?: unknown) {
      if (message && typeof message === 'object' && 'kind' in message && message.kind === 'advance')
        setTimeout(() => original.call(this, message, options as StructuredSerializeOptions), 35);
      else original.call(this, message, options as StructuredSerializeOptions);
    };
  });
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24');
  await page.getByRole('button', { name: /^今日の試合へ/ }).click();
  await page.getByRole('button', { name: '1日を自動進行', exact: true }).click();
  await nav.getByRole('button', { name: '編成', exact: true }).click();
  const first = page.getByRole('combobox', { name: '1番の選手', exact: true });
  await expect(first).toBeDisabled();
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-25', {
    timeout: 45000,
  });
  await page.getByRole('button', { name: '編成の編集を開始', exact: true }).click();
  await expect(first).toBeEnabled();
  await expect(page.getByRole('region', { name: '編成の編集', exact: true })).toContainText(
    '2026-09-25の登録案',
  );
});
