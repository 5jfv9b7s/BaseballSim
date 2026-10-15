import { test, expect, type Locator, type Page } from '@playwright/test';

async function enableControls(page: Page) {
  const toggle = page.getByRole('button', { name: '選択欄・ボタンで操作', exact: true });
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') {
    await toggle.focus();
    await toggle.press('Space');
  }
}

// スクロール前後で同じ画面座標になる場合も、実際にマウスを動かして開始する。
async function dragCard(page: Page, source: Locator, target: Locator, highlight?: Locator) {
  await target.scrollIntoViewIfNeeded();
  await source.hover();
  const origin = await source.boundingBox();
  await page.mouse.down();
  await page.mouse.move(origin!.x + origin!.width / 2 + 12, origin!.y + origin!.height / 2, {
    steps: 3,
  });
  await target.hover();
  await target.hover();
  if (highlight) await expect(highlight).toHaveAttribute('data-drop-active', 'true');
  await page.mouse.up();
}

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
    await enableControls(page);
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
    await enableControls(page);
    await editor.getByRole('button', { name: '1番を下へ', exact: true }).click();
    await expect(page.locator('.save-badge')).toHaveText('編成を編集中');
    await expect(first).toHaveValue(originalSecond);
    await editor.getByRole('button', { name: '投手オーダー', exact: true }).click();
    await editor.getByRole('button', { name: '起用方針', exact: true }).click();
    await expect(
      editor.getByRole('combobox', { name: '入れ替えモード', exact: true }),
    ).toBeVisible();
    await editor.getByRole('button', { name: '野手オーダー', exact: true }).click();
    await expect(first).toHaveValue(originalSecond);
    await editor.getByRole('button', { name: '選手詳細を開く', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(first).toHaveValue(originalSecond);
    expect(await page.evaluate(() => Reflect.get(window, 'formationCommands'))).toBe(0);
    await editor.getByRole('button', { name: '変更を戻す', exact: true }).click();
    await enableControls(page);
    await expect(first).toHaveValue(originalId);
    await editor.getByRole('button', { name: '1番を下へ', exact: true }).click();
    await page.screenshot({ path: `.tmp/formation-qa/batters-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await nav.getByRole('button', { name: 'ホーム', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'クラブハウス', exact: true })).toBeVisible();
    await expect(page.locator('.save-badge')).toHaveText('保存済み');
    expect(await page.evaluate(() => Reflect.get(window, 'formationCommands'))).toBe(1);
    await nav.getByRole('button', { name: '編成', exact: true }).click();
    await enableControls(page);
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
    await enableControls(page);
    await expect(first).toHaveValue(originalSecond);
    expect(errors).toEqual([]);
  });
}

test('編成エラー：先発0人では退出せず、取消後は保存なしで移動する', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24');
  const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
  await nav.getByRole('button', { name: '編成', exact: true }).click();
  await enableControls(page);
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
  await enableControls(page);
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
    await slots.nth(0).locator('select').first().inputValue(),
    await slots.nth(1).locator('select').first().inputValue(),
  ];
  const roles = [
    await slots.nth(0).locator('select').nth(1).inputValue(),
    await slots.nth(1).locator('select').nth(1).inputValue(),
  ];
  await expect(editor.getByRole('button', { name: '選択欄・ボタンで操作' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(slots.nth(0).locator('select').first()).toBeHidden();
  // Escapeで取り消したドラッグは、下書きも移動先の強調も残さない。
  await slots.nth(0).hover();
  const origin = await slots.nth(0).boundingBox();
  await page.mouse.down();
  await page.mouse.move(origin!.x + origin!.width / 2 + 12, origin!.y + origin!.height / 2, {
    steps: 3,
  });
  await slots.nth(1).hover();
  await slots.nth(1).hover();
  await expect(slots.nth(1)).toHaveAttribute('data-drop-active', 'true');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(editor.locator('[data-drop-active="true"]')).toHaveCount(0);
  await expect(slots.nth(0).locator('select').first()).toHaveValue(ids[0]!);
  await expect(editor).toContainText('変更はありません');
  await dragCard(page, slots.nth(0), slots.nth(1), slots.nth(1));
  await expect(slots.nth(0).locator('select').first()).toHaveValue(ids[1]!);
  await expect(slots.nth(0).locator('select').nth(1)).toHaveValue(roles[1]!);
  await dragCard(
    page,
    slots.nth(0).locator('.formation-position'),
    slots.nth(1).locator('.formation-position'),
    slots.nth(1),
  );
  await expect(slots.nth(0).locator('select').first()).toHaveValue(ids[1]!);
  await expect(slots.nth(0).locator('select').nth(1)).toHaveValue(roles[0]!);
  await expect(editor.locator('[data-drop-active="true"]')).toHaveCount(0);
  await page.screenshot({ path: '.tmp/formation-drag-qa/batters-1280.png', fullPage: true });
  await page.getByRole('button', { name: 'シミュレーション開発ツール ↗', exact: true }).click();
  await expect(page.getByRole('button', { name: '本画面へ戻る', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /本画面へ戻る/ }).click();
  await nav.getByRole('button', { name: '編成', exact: true }).click();
  await expect(slots.nth(0).locator('select').first()).toHaveValue(ids[1]!);
  await expect(slots.nth(0).locator('select').nth(1)).toHaveValue(roles[0]!);
});

test('編成登録：最終差分だけを確定し、抹消した選手の再登録日を表示する', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 960 });
  await page.goto('/');
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24');
  const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
  await nav.getByRole('button', { name: '編成', exact: true }).click();
  await enableControls(page);
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
  await enableControls(page);
  await expect(
    farm.getByRole('button', { name: demoteLabel.replace('二軍', '一軍'), exact: true }),
  ).toBeDisabled();
  await expect(farm).toContainText('再登録可能：2026-10-04');
  await expect(
    bench.getByRole('button', { name: promoteLabel.replace('一軍', '二軍'), exact: true }),
  ).toBeEnabled();
  await bench.locator('.player-link').first().click();
  await expect(page.getByRole('complementary', { name: '選択選手情報' })).toBeVisible();
  await editor.getByRole('button', { name: '選手詳細を開く', exact: true }).click();
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
  await enableControls(page);
  const first = page.getByRole('combobox', { name: '1番の選手', exact: true });
  await expect(first).toBeDisabled();
  await expect(page.locator('.formation-editor [draggable="true"]')).toHaveCount(0);
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-25', {
    timeout: 45000,
  });
  await page.getByRole('button', { name: '編成の編集を開始', exact: true }).click();
  await enableControls(page);
  await expect(first).toBeEnabled();
  await expect(page.getByRole('region', { name: '編成の編集', exact: true })).toContainText(
    '2026-09-25の登録案',
  );
});

for (const width of [1280, 390]) {
  test(`編成仕様：役割ドラッグ・共有起用方針・情報タブの維持 (${width}px)`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 960 });
    await page.goto('/');
    await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24');
    const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
    await nav.getByRole('button', { name: '編成', exact: true }).click();
    await enableControls(page);
    const editor = page.getByRole('region', { name: '編成の編集', exact: true });
    const info = page.getByRole('complementary', { name: '選択選手情報', exact: true });
    await info.getByRole('button', { name: '成績', exact: true }).click();
    const order = page.getByRole('region', { name: '理想オーダー', exact: true });
    await order.locator('.player-link').nth(1).click();
    await expect(info.getByRole('button', { name: '成績', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await info.getByRole('combobox', { name: /の固定希望$/ }).selectOption('firstFixed');
    await editor.getByRole('button', { name: '投手オーダー', exact: true }).click();
    const close = page.getByRole('region', { name: '僅差', exact: true });
    const closer = page.getByRole('region', { name: '抑え', exact: true });
    const originalName = (await close.locator('.player-link').first().innerText()).trim();
    await close
      .getByRole('combobox', { name: originalName + 'の配置先', exact: true })
      .selectOption('closer');
    await expect(closer.locator('.player-link')).toHaveText([originalName]);
    const farm = page.getByRole('region', { name: '二軍投手', exact: true });
    const farmName = (await farm.locator('.player-link').first().innerText()).trim();
    await farm.getByRole('button', { name: farmName + 'を一軍へ', exact: true }).click();
    if (width === 1280) {
      const source = close.getByRole('button', { name: farmName, exact: true });
      const target = closer.getByRole('button', { name: originalName, exact: true });
      await target.scrollIntoViewIfNeeded();
      await source.hover();
      // スクロール前後で選手名が同じ画面座標になるため、先にドラッグを開始する。
      const origin = await source.boundingBox();
      await page.mouse.down();
      await page.mouse.move(origin!.x + origin!.width / 2 + 12, origin!.y + origin!.height / 2, {
        steps: 3,
      });
      await target.hover();
      await target.hover();
      await page.mouse.up();
    } else
      await close
        .getByRole('combobox', { name: farmName + 'の配置先', exact: true })
        .selectOption('closer');
    await expect(closer.locator('.player-link')).toHaveCount(2);
    await expect(farm.getByRole('button', { name: farmName, exact: true })).toHaveCount(0);
    await expect(info.getByRole('button', { name: '成績', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await editor.getByRole('button', { name: '起用方針', exact: true }).click();
    await editor.getByLabel('直近の投球数以上', { exact: true }).fill('70');
    await editor.getByLabel('個別条件の使い方', { exact: true }).selectOption('custom');
    await editor
      .getByRole('group', { name: '投手個別の条件', exact: true })
      .getByLabel('直近の投球数以上', { exact: true })
      .fill('65');
    await editor.getByRole('button', { name: '投手オーダー', exact: true }).click();
    await expect(closer.locator('.player-link')).toHaveCount(2);
    await expect(info.getByRole('button', { name: '成績', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.screenshot({ path: `.tmp/formation-spec-qa/roles-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await nav.getByRole('button', { name: 'ホーム', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'クラブハウス', exact: true })).toBeVisible();
    await nav.getByRole('button', { name: '編成', exact: true }).click();
    await enableControls(page);
    await editor.getByRole('button', { name: '投手オーダー', exact: true }).click();
    await expect(closer.locator('.player-link')).toHaveCount(2);
    await editor.getByRole('button', { name: '起用方針', exact: true }).click();
    await expect(
      editor
        .getByRole('group', { name: '一軍の既定条件', exact: true })
        .getByLabel('直近の投球数以上', { exact: true }),
    ).toHaveValue('70');
    await expect(
      editor
        .getByRole('group', { name: '投手個別の条件', exact: true })
        .getByLabel('直近の投球数以上', { exact: true }),
    ).toHaveValue('65');
    await page.screenshot({ path: `.tmp/formation-spec-qa/policy-${width}.png`, fullPage: true });
  });
}

test('編成の欠員：二軍へ移した選手を別の打順へ戻しても重複せず、補充後に退出できる', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24');
  const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
  await nav.getByRole('button', { name: '編成', exact: true }).click();
  await enableControls(page);
  const order = page.getByRole('region', { name: '理想オーダー', exact: true });
  const first = order.getByRole('combobox', { name: '1番の選手', exact: true });
  const second = order.getByRole('combobox', { name: '2番の選手', exact: true });
  const original = await first.inputValue();
  await order
    .locator('.formation-slot')
    .first()
    .getByRole('button', { name: /を二軍へ$/ })
    .click();
  await expect(first).toHaveValue('');
  await nav.getByRole('button', { name: 'ホーム', exact: true }).click();
  await expect(
    page.getByText('一軍オーダーの空き枠を補充してください：1番', { exact: true }),
  ).toBeVisible();
  await second.selectOption(original);
  await expect(second).toHaveValue(original);
  await expect(first).toHaveValue('');
  const bench = page.getByRole('region', { name: '一軍控え', exact: true });
  const substitute = (await bench.locator('.player-link').first().innerText()).trim();
  await first.selectOption({ label: substitute });
  const ids = await order
    .getByRole('combobox', { name: /^[1-9]番の選手$/ })
    .evaluateAll((elements) => elements.map((e) => (e as HTMLSelectElement).value));
  expect(new Set(ids).size).toBe(9);
  await nav.getByRole('button', { name: 'ホーム', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'クラブハウス', exact: true })).toBeVisible();
});

test('ドラッグを基本操作にする：控え交代・一二軍交換・空き領域の往復', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.goto('/');
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24');
  const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
  await nav.getByRole('button', { name: '編成', exact: true }).click();
  const editor = page.getByRole('region', { name: '編成の編集', exact: true });
  const slots = editor.locator('.formation-slot');
  const bench = page.getByRole('region', { name: '一軍控え', exact: true });
  const farm = page.getByRole('region', { name: '二軍野手', exact: true });
  const original = await slots.first().getAttribute('data-player-id');
  const position = await slots.first().locator('.formation-position').innerText();
  const substitute = await bench
    .locator('.formation-player')
    .first()
    .getAttribute('data-player-id');
  await dragCard(page, bench.locator('.formation-player').first(), slots.first(), slots.first());
  await expect(slots.first()).toHaveAttribute('data-player-id', substitute!);
  await expect(slots.first().locator('.formation-position')).toHaveText(position);
  await expect(bench.locator(`[data-player-id="${original}"]`)).toBeVisible();

  const farmId = await farm.locator('.formation-player').first().getAttribute('data-player-id');
  await dragCard(page, farm.locator('.formation-player').first(), slots.first(), slots.first());
  await expect(slots.first()).toHaveAttribute('data-player-id', farmId!);
  await expect(slots.first().locator('.formation-position')).toHaveText(position);
  await expect(farm.locator(`[data-player-id="${substitute}"]`)).toBeVisible();

  const candidate = bench.locator(`[data-player-id="${original}"]`);
  await dragCard(page, candidate, farm.locator('.formation-drop-space'), farm);
  await expect(farm.locator(`[data-player-id="${original}"]`)).toBeVisible();
  await dragCard(
    page,
    farm.locator(`[data-player-id="${original}"]`),
    bench.locator('.formation-drop-space'),
    bench,
  );
  await expect(candidate).toBeVisible();
  // 再登録日の制限を操作ごとに確定せず、退出時に最終案だけを保存する。
  await expect(farm).not.toContainText('再登録可能');
  await expect(editor.getByRole('button', { name: '選択欄・ボタンで操作' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await nav.getByRole('button', { name: 'ホーム', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'クラブハウス', exact: true })).toBeVisible();
  await nav.getByRole('button', { name: '編成', exact: true }).click();
  await expect(slots.first()).toHaveAttribute('data-player-id', farmId!);
  await expect(farm.locator(`[data-player-id="${substitute}"]`)).toContainText(
    '再登録可能：2026-10-04',
  );
  await expect(farm.locator(`[data-player-id="${substitute}"]`)).toHaveAttribute(
    'draggable',
    'false',
  );
});

test('投手カードのドラッグ：先発順・役割間・役割内優先順・二軍から配置', async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.goto('/');
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24');
  const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
  await nav.getByRole('button', { name: '編成', exact: true }).click();
  const editor = page.getByRole('region', { name: '編成の編集', exact: true });
  await editor.getByRole('button', { name: '投手オーダー', exact: true }).click();
  const rotation = page.getByRole('region', { name: '先発ローテーション', exact: true });
  const close = page.getByRole('region', { name: '僅差', exact: true });
  const closer = page.getByRole('region', { name: '抑え', exact: true });
  const farm = page.getByRole('region', { name: '二軍投手', exact: true });
  const rows = rotation.locator('.formation-player');
  // 初期の一軍先発は1人。救援からもう1人をドラッグし、複数枠の順序を検証する。
  await expect(rows).toHaveCount(1);
  await dragCard(
    page,
    close.locator('.formation-player').first(),
    rotation.locator('.formation-drop-space'),
    rotation,
  );
  await expect(rows).toHaveCount(2);
  const firstId = await rows.first().getAttribute('data-player-id');
  const secondId = await rows.nth(1).getAttribute('data-player-id');
  await dragCard(page, rows.nth(1), rows.first(), rows.first());
  await expect(rows.first()).toHaveAttribute('data-player-id', secondId!);
  await expect(rows.nth(1)).toHaveAttribute('data-player-id', firstId!);
  await dragCard(page, rows.first(), closer.locator('.formation-drop-space'), closer);
  await expect(closer.locator(`[data-player-id="${secondId}"]`)).toBeVisible();
  await expect(rotation.locator(`[data-player-id="${secondId}"]`)).toHaveCount(0);
  const reliefId = await close.locator('.formation-player').first().getAttribute('data-player-id');
  await dragCard(
    page,
    close.locator('.formation-player').first(),
    closer.locator('.formation-drop-space'),
    closer,
  );
  await expect(close.locator(`[data-player-id="${reliefId}"]`)).toHaveCount(0);
  await dragCard(
    page,
    closer.locator(`[data-player-id="${reliefId}"]`),
    closer.locator(`[data-player-id="${secondId}"]`),
    closer.locator(`[data-player-id="${secondId}"]`),
  );
  await expect(closer.locator('.formation-player').first()).toHaveAttribute(
    'data-player-id',
    reliefId!,
  );
  await dragCard(
    page,
    closer.locator(`[data-player-id="${secondId}"]`),
    rotation.locator('.formation-drop-space'),
    rotation,
  );
  await expect(rows.last()).toHaveAttribute('data-player-id', secondId!);
  // 同人数を維持したまま二軍の投手と入れ替える。
  const farmId = await farm.locator('.formation-player').first().getAttribute('data-player-id');
  await dragCard(page, rows.last(), farm.locator('.formation-drop-space'), farm);
  await dragCard(
    page,
    farm.locator(`[data-player-id="${farmId}"]`),
    closer.locator('.formation-drop-space'),
    closer,
  );
  await expect(closer.locator(`[data-player-id="${farmId}"]`)).toBeVisible();
  await expect(farm.locator(`[data-player-id="${farmId}"]`)).toHaveCount(0);
  await expect(editor.getByRole('combobox', { name: /の配置先$/ })).toHaveCount(0);
  await page.screenshot({ path: '.tmp/formation-drag-qa/pitchers-1280.png', fullPage: true });
  await nav.getByRole('button', { name: 'ホーム', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'クラブハウス', exact: true })).toBeVisible();
  await nav.getByRole('button', { name: '編成', exact: true }).click();
  await editor.getByRole('button', { name: '投手オーダー', exact: true }).click();
  await expect(closer.locator('.formation-player').first()).toHaveAttribute(
    'data-player-id',
    reliefId!,
  );
  await expect(closer.locator(`[data-player-id="${farmId}"]`)).toBeVisible();
});

test('自動登録中：二軍からのドロップは編集案を変えない', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.goto('/');
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24');
  await page
    .getByRole('navigation', { name: 'メインメニュー', exact: true })
    .getByRole('button', { name: '編成', exact: true })
    .click();
  const editor = page.getByRole('region', { name: '編成の編集', exact: true });
  await editor.getByRole('button', { name: '起用方針', exact: true }).click();
  await editor.getByRole('combobox', { name: '入れ替えモード', exact: true }).selectOption('auto');
  await editor.getByRole('button', { name: '野手オーダー', exact: true }).click();
  const slot = editor.locator('.formation-slot').first();
  const original = await slot.getAttribute('data-player-id');
  const farm = page.getByRole('region', { name: '二軍野手', exact: true });
  const ids = await farm
    .locator('.formation-player')
    .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-player-id')));
  await dragCard(page, farm.locator('.formation-player').first(), slot);
  await expect(slot).toHaveAttribute('data-player-id', original!);
  expect(
    await farm
      .locator('.formation-player')
      .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-player-id'))),
  ).toEqual(ids);
  await expect(editor.locator('[data-drop-active="true"]')).toHaveCount(0);
});
