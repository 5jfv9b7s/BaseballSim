import { test, expect, type Page } from '@playwright/test';

async function storedState(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('BaseballSim-v02-worlds');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const stores = ['local_worlds', 'save_slots', 'save_snapshots', 'save_blocks'];
      const tx = db.transaction(stores, 'readonly');
      return await Promise.all(
        stores.map(
          (name) =>
            new Promise((resolve, reject) => {
              const request = tx.objectStore(name).getAll();
              request.onsuccess = () =>
                resolve(
                  name === 'save_blocks'
                    ? request.result.map((b) => ({
                        blockId: b.blockId,
                        contentHash: b.contentHash,
                      }))
                    : request.result,
                );
              request.onerror = () => reject(request.error);
            }),
        ),
      );
    } finally {
      db.close();
    }
  });
}

for (const width of [1280, 390, 320]) {
  test(`トレード提案：選択・比較・人数試算・下書き保持と保存不変 (${width}px)`, async ({
    page,
  }) => {
    test.setTimeout(180000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      Reflect.set(window, 'tradeCommandCount', 0);
      const send = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (message: unknown, options?: unknown) {
        if (message && typeof message === 'object' && 'localWorldId' in message)
          Reflect.set(window, 'tradeCommandCount', Reflect.get(window, 'tradeCommandCount') + 1);
        send.call(this, message, options as StructuredSerializeOptions);
      };
    });
    await page.goto('/');
    const start = page.getByRole('button', { name: 'はじめから', exact: true });
    await expect(start).toBeEnabled({ timeout: 30000 });
    await start.click();
    await page.getByRole('button', { name: '新しい日程を準備', exact: true }).click();
    await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24', {
      timeout: 30000,
    });
    const before = await storedState(page);
    const commandCount = await page.evaluate(() => Reflect.get(window, 'tradeCommandCount'));
    const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
    await nav.getByRole('button', { name: 'チーム', exact: true }).click();
    await page.getByRole('button', { name: 'トレードの提案を作る', exact: true }).click();
    const proposal = page.getByRole('region', { name: 'トレード提案の作成', exact: true });
    const partner = proposal.getByRole('combobox', { name: '相手球団', exact: true });
    await partner.selectOption({ index: 1 });
    const outgoing = proposal.getByRole('button', { name: '＋ 出す選手を追加', exact: true });
    const incoming = proposal.getByRole('button', { name: '＋ 獲得する選手を追加', exact: true });
    await outgoing.click();
    let picker = page.getByRole('dialog', { name: '出す選手を選択', exact: true });
    await expect(picker.getByLabel('候補の名前で検索')).toBeFocused();
    const contrast = await picker
      .getByRole('button', { name: '選ばずに戻る', exact: true })
      .evaluate((button) => {
        const style = getComputedStyle(button);
        const luminance = (css: string) => {
          const components = css
            .match(/[\d.]+/g)!
            .slice(0, 3)
            .map(Number)
            .map((value) => {
              const channel = value / 255;
              return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
            });
          return components[0]! * 0.2126 + components[1]! * 0.7152 + components[2]! * 0.0722;
        };
        const foreground = luminance(style.color),
          background = luminance(style.backgroundColor);
        return (
          (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
        );
      });
    expect(contrast).toBeGreaterThanOrEqual(4.5);

    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);
    await expect(outgoing).toBeFocused();
    await outgoing.click();
    await picker.getByLabel('候補の名前で検索').fill('該当なしの名前');
    await expect(picker.getByRole('status')).toHaveText('0名の候補');
    await expect(
      picker.getByRole('button', { name: 'この選手を選ぶ', exact: true }),
    ).toBeDisabled();
    await picker.getByLabel('候補の名前で検索').fill('');
    await picker.locator('tbody tr button').first().click();
    await expect(picker.getByRole('table', { name: '選手の基本能力', exact: true })).toBeVisible();
    await picker.getByRole('button', { name: '成績', exact: true }).click();
    await expect(
      picker.getByRole('region', { name: '候補選手の比較情報', exact: true }),
    ).toContainText('成績');
    await page.screenshot({ path: `.tmp/trade-qa/picker-${width}.png`, fullPage: true });
    await picker.getByRole('button', { name: 'この選手を選ぶ', exact: true }).click();
    await expect(outgoing).toBeFocused();
    await outgoing.click();
    await expect(picker.getByRole('status')).toHaveText('29名の候補');
    await picker.locator('tbody tr button').first().click();
    await picker.getByRole('button', { name: 'この選手を選ぶ', exact: true }).click();
    await incoming.click();
    picker = page.getByRole('dialog', { name: '獲得する選手を選択', exact: true });
    await picker.getByLabel('候補の種類').selectOption('pitcher');
    await picker.locator('tbody tr button').first().click();
    await picker.getByRole('button', { name: 'この選手を選ぶ', exact: true }).click();
    await expect(proposal.getByTestId('trade-own-count')).toHaveText('30 → 29');
    await expect(proposal.getByTestId('trade-partner-count')).toHaveText('30 → 31');
    await expect(
      proposal
        .getByRole('table', { name: 'トレード選手の基本能力', exact: true })
        .locator('thead th'),
    ).toHaveCount(4);
    await proposal.getByLabel('比較する能力の分野').selectOption('fielding');
    await expect(
      proposal.getByRole('table', { name: 'トレード選手の基本能力', exact: true }),
    ).toContainText('捕球');
    await proposal.getByLabel('提示金銭（円）').fill('-1');
    await expect(
      proposal.getByRole('region', { name: 'トレード提案の入力確認', exact: true }),
    ).toContainText('提示金銭');
    await proposal.getByLabel('提示金銭（円）').fill('100000');
    await expect(
      proposal.getByRole('region', { name: 'トレードの資金と実行状況', exact: true }),
    ).toContainText('100,000円');
    await expect(
      proposal.getByRole('button', { name: '交渉する（工事中）', exact: true }),
    ).toBeDisabled();
    await proposal
      .getByRole('button', { name: /の詳細$/ })
      .first()
      .click();
    await expect(page.getByRole('button', { name: '選手詳細を閉じる', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '選手詳細を閉じる', exact: true }).click();
    await nav.getByRole('button', { name: 'ホーム', exact: true }).click();
    await nav.getByRole('button', { name: 'チーム', exact: true }).click();
    await page.getByRole('button', { name: 'トレード', exact: true }).click();
    await expect(proposal.getByRole('status')).toContainText('出す選手 2名 ／ 獲得する選手 1名');
    await expect(proposal.getByLabel('提示金銭（円）')).toHaveValue('100000');
    await proposal
      .getByRole('button', { name: /出す選手：.*を選び直す/ })
      .first()
      .click();
    picker = page.getByRole('dialog', { name: '出す選手を選択', exact: true });
    await expect(picker.getByRole('status')).toHaveText('29名の候補');
    await picker.getByRole('button', { name: '選ばずに戻る', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `.tmp/trade-qa/proposal-${width}.png`, fullPage: true });
    await partner.selectOption({ index: 2 });
    await expect(proposal.getByRole('status')).toContainText('出す選手 2名 ／ 獲得する選手 0名');
    await proposal
      .getByRole('button', { name: /^出す選手から.*を解除$/ })
      .first()
      .click();
    await expect(proposal.getByRole('status')).toContainText('出す選手 1名');
    await proposal.getByRole('button', { name: '提案をクリア', exact: true }).click();
    await expect(proposal.getByRole('status')).toContainText('出す選手 0名 ／ 獲得する選手 0名');
    expect(await storedState(page)).toEqual(before);
    expect(await page.evaluate(() => Reflect.get(window, 'tradeCommandCount'))).toBe(commandCount);
    await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24');
    expect(errors).toEqual([]);
  });
}

test('トレード提案：別プレイへの切替で下書きを破棄し、元の保存を保持', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'はじめから', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await page.getByRole('button', { name: 'はじめから', exact: true }).click();
  await page.getByRole('button', { name: '新しい日程を準備', exact: true }).click();
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24', {
    timeout: 30000,
  });
  const before = await storedState(page);
  const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
  await nav.getByRole('button', { name: 'チーム', exact: true }).click();
  await page.getByRole('button', { name: 'トレード', exact: true }).click();
  const proposal = page.getByRole('region', { name: 'トレード提案の作成', exact: true });
  await proposal
    .getByRole('combobox', { name: '相手球団', exact: true })
    .selectOption({ index: 1 });
  await proposal.getByLabel('提示金銭（円）').fill('2000000');
  await nav.getByRole('button', { name: 'システム', exact: true }).click();
  await page.getByRole('button', { name: 'タイトル画面へ', exact: true }).click();
  // 保存がある場合は、補足文を含む副操作として表示される。
  await page.getByRole('button', { name: /^はじめから/ }).click();
  await page
    .getByRole('combobox', { name: '新規プレイの担当球団', exact: true })
    .selectOption({ index: 1 });
  await page.getByRole('button', { name: '新しい日程を準備', exact: true }).click();
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24', {
    timeout: 30000,
  });
  await nav.getByRole('button', { name: 'チーム', exact: true }).click();
  await page.getByRole('button', { name: 'トレード', exact: true }).click();
  await expect(proposal.getByLabel('提示金銭（円）')).toHaveValue('0');
  await expect(proposal.getByRole('combobox', { name: '相手球団', exact: true })).toHaveValue('');
  await expect(proposal.getByRole('status')).toContainText('出す選手 0名 ／ 獲得する選手 0名');
  const after = await storedState(page);
  expect(after[0] as unknown[]).toEqual(expect.arrayContaining(before[0] as unknown[]));
  expect(after[1] as unknown[]).toEqual(expect.arrayContaining(before[1] as unknown[]));
});

for (const width of [1280, 320]) {
  test(`成立条件のWorker確認：不足・編成影響・下書き変更後の再確認・保存不変 (${width}px)`, async ({
    page,
  }) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: 'はじめから', exact: true }).click({ timeout: 30000 });
    await page.getByRole('button', { name: '新しい日程を準備', exact: true }).click();
    await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24', {
      timeout: 30000,
    });
    const before = await storedState(page);
    const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
    await nav.getByRole('button', { name: 'チーム', exact: true }).click();
    await page.getByRole('button', { name: 'トレードの提案を作る', exact: true }).click();
    const proposal = page.getByRole('region', { name: 'トレード提案の作成', exact: true });
    const inspect = proposal.getByRole('button', { name: '成立条件を確認', exact: true });
    await expect(inspect).toBeDisabled();
    await proposal
      .getByRole('combobox', { name: '相手球団', exact: true })
      .selectOption({ index: 1 });
    for (const side of ['出す選手', '獲得する選手']) {
      await proposal.getByRole('button', { name: `＋ ${side}を追加`, exact: true }).click();
      const picker = page.getByRole('dialog', { name: `${side}を選択`, exact: true });
      await picker.locator('tbody tr button').first().click();
      await picker.getByRole('button', { name: 'この選手を選ぶ', exact: true }).click();
    }
    await expect(inspect).toBeEnabled();
    await inspect.click();
    const result = proposal.getByRole('region', { name: '成立条件の確認結果', exact: true });
    await expect(result).toContainText('確定には準備が必要です');
    await expect(result).toContainText('資金・予算の記録がなく');
    await expect(result).toContainText('選手ごとの登録と編成への影響');
    await expect(
      proposal.getByRole('button', { name: '交渉する（工事中）', exact: true }),
    ).toBeDisabled();
    expect(await storedState(page)).toEqual(before);
    await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24');
    await proposal.getByLabel('提示金銭（円）').fill('100');
    await expect(result).toHaveCount(0);
    await inspect.click();
    await expect(result).toBeVisible();
    await proposal
      .getByRole('combobox', { name: '相手球団', exact: true })
      .selectOption({ index: 2 });
    await expect(result).toHaveCount(0);
    await expect(inspect).toBeDisabled();
    expect(await storedState(page)).toEqual(before);
  });
}
