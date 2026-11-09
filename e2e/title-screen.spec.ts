import { selectSaveChoice } from './saved-play.ts';
import { expect, test, type Page } from '@playwright/test';

async function startPlay(page: Page) {
  await page.getByRole('button', { name: 'はじめから', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'はじめから', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '新しい日程を準備', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'クラブハウス', exact: true })).toBeVisible({
    timeout: 30000,
  });
}

async function system(page: Page) {
  await page
    .getByRole('navigation', { name: 'メインメニュー', exact: true })
    .getByRole('button', { name: 'システム', exact: true })
    .click();
}

/** 検査用ブラウザの四ストアを読取専用で比較する。ブロックはIDとハッシュを照合する。 */
async function storedState(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('BaseballSim-v02-worlds');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const names = ['local_worlds', 'save_slots', 'save_snapshots', 'save_blocks'];
      const tx = db.transaction(names, 'readonly');
      return await Promise.all(
        names.map(
          (name) =>
            new Promise((resolve, reject) => {
              const request = tx.objectStore(name).getAll();
              request.onsuccess = () =>
                resolve(
                  name === 'save_blocks'
                    ? request.result.map((block) => ({
                        blockId: block.blockId,
                        contentHash: block.contentHash,
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
  test(`タイトル：初回・キーボード・新規保存・表示幅 (${width}px)`, async ({ page }) => {
    test.setTimeout(90000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 760 });
    await page.goto('/');
    const start = page.getByRole('button', { name: 'はじめから', exact: true });
    // 初回Worker応答を待つ。画面全体の90秒上限と操作後の期待値は維持する。
    await expect(start).toBeEnabled({ timeout: 30000 });
    await expect(start).toBeFocused();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('button', { name: /^続きから/ })).toBeDisabled();
    await expect(page.getByText('保存されたプレイはまだありません。')).toBeVisible();
    expect(
      await start.evaluate((button) => button.getBoundingClientRect().bottom <= innerHeight),
    ).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const buttons = await page
      .locator('.title-screen button:visible')
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
    expect(buttons.every((height) => height >= 44)).toBe(true);
    await page.screenshot({ path: `.tmp/title-qa/first-${width}.png`, fullPage: true });
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: /^セーブファイルを取り込む/ })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: '設定・ヘルプ', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: '設定・ヘルプ', exact: true })).toBeFocused();
    await expect(page.getByRole('button', { name: '設定（工事中）', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '← タイトルへ戻る', exact: true }).click();
    await start.click();
    await page.getByRole('textbox', { name: '世界seed', exact: true }).fill('0');
    await page.getByRole('button', { name: '新しい日程を準備', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('seedは1');
    await expect(page.getByTestId('main-date')).toHaveCount(0);
    await page.getByRole('textbox', { name: '世界seed', exact: true }).fill('21');
    await page
      .getByRole('combobox', { name: '新規プレイの担当球団', exact: true })
      .selectOption({ index: 1 });
    const chosenClub = await page
      .getByRole('combobox', { name: '新規プレイの担当球団', exact: true })
      .locator('option:checked')
      .textContent();
    await page.screenshot({ path: `.tmp/title-qa/new-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: '新しい日程を準備', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'クラブハウス', exact: true })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24');
    await expect(page.locator('.save-badge')).toHaveText('保存済み');
    await system(page);
    const before = await storedState(page);
    await page.getByRole('button', { name: 'タイトル画面へ', exact: true }).click();
    await expect(page.getByRole('button', { name: '続きから', exact: true })).toBeFocused();
    await expect(page.getByText(/保存済み 1プレイ/)).toBeVisible();
    await expect(page.locator('.title-save-preview')).toContainText(chosenClub!);
    await expect(page.locator('.title-save-preview time')).toHaveAttribute(
      'datetime',
      '2026-09-24',
    );
    await page.screenshot({ path: `.tmp/title-qa/saved-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: '続きから', exact: true }).click();
    await expect(page.getByRole('group', { name: '保存済みプレイ', exact: true })).toBeVisible();
    await page
      .getByRole('group', { name: '保存済みプレイ', exact: true })
      .getByRole('radio')
      .first()
      .check();
    const point = page.getByRole('region', { name: '選んだ保存時点', exact: true });
    await expect(point).toBeVisible();
    const saved = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const request = indexedDB.open('BaseballSim-v02-worlds');
        request.onsuccess = () => resolve(request.result);
      });
      try {
        return await new Promise<{ gameDate: string; updatedAt: string }>((resolve) => {
          const request = db
            .transaction('save_slots', 'readonly')
            .objectStore('save_slots')
            .getAll();
          request.onsuccess = () =>
            resolve(request.result.find((slot) => slot.slotKind === 'auto'));
        });
      } finally {
        db.close();
      }
    });
    await expect(point.locator('time').nth(0)).toHaveAttribute('datetime', saved.gameDate);
    await expect(point.locator('time').nth(1)).toHaveAttribute('datetime', saved.updatedAt);
    await point.getByText('保存データの確認情報', { exact: true }).click();
    await expect(point).toContainText('v022-world-snapshot-v21');
    await expect(point).toContainText('world-prototype-v21');
    await expect(point).toContainText('記録なし');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `.tmp/save-point-qa/picker-${width}.png`, fullPage: true });
    expect(await storedState(page)).toEqual(before);
    await page.getByRole('button', { name: '開いているプレイへ戻る', exact: true }).click();
    expect(await storedState(page)).toEqual(before);
    await expect(page.getByRole('region', { name: '世界の保存', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('タイトル：再起動・破損枠の復元失敗・別の保存時点から回復', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/');
  await startPlay(page);
  await system(page);
  await page.getByRole('button', { name: '世界を手動保存', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('世界全体を手動保存', { timeout: 30000 });
  // 自分の検査用DBだけの自動枠を破損させ、手動枠が残る失敗条件を作る。
  const id = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('BaseballSim-v02-worlds');
      request.onsuccess = () => resolve(request.result);
    });
    try {
      return await new Promise<string>((resolve, reject) => {
        const tx = db.transaction('save_slots', 'readwrite');
        const store = tx.objectStore('save_slots');
        const request = store.getAll();
        let id = '';
        request.onsuccess = () => {
          const slot = request.result.find((slot) => slot.slotKind === 'auto');
          id = slot.localWorldId;
          store.put({ ...slot, snapshotId: 'missing-test-snapshot' });
        };
        tx.oncomplete = () => resolve(id);
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  });
  await page.reload();
  await page.getByRole('button', { name: '続きから', exact: true }).click();
  const plays = page.getByRole('group', { name: '保存済みプレイ', exact: true });
  await selectSaveChoice(plays, id);
  const slots = page.getByRole('group', { name: '開く保存枠', exact: true });
  await selectSaveChoice(slots, 'auto');
  const before = await storedState(page);
  await page.getByRole('button', { name: '選んだプレイを開く', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('heading', { name: '続きから', exact: true })).toBeVisible();
  expect(await storedState(page)).toEqual(before);
  await page.screenshot({ path: '.tmp/title-qa/restore-failed.png', fullPage: true });
  await selectSaveChoice(slots, 'manual');
  await page.getByRole('button', { name: '選んだプレイを開く', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'クラブハウス', exact: true })).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24');
});

test('タイトル：取り込み失敗で元保存を保持し、成功時は別プレイを選んで再開', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 760 });
  await page.goto('/');
  await startPlay(page);
  await system(page);
  await page.getByText('ファイルのバックアップ・別プレイの復元', { exact: true }).click();
  await selectSaveChoice(page.getByRole('group', { name: '書き出す保存枠', exact: true }), 'auto');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '保存ファイルを書き出す', exact: true }).click();
  const download = await downloadPromise;
  const { readFile } = await import('node:fs/promises');
  const bytes = await readFile((await download.path())!);
  const before = await storedState(page);
  await page.getByRole('button', { name: 'タイトル画面へ', exact: true }).click();
  await page.getByRole('button', { name: /^セーブファイルを取り込む/ }).click();
  const input = page.getByLabel('取り込む保存ファイル', { exact: true });
  await input.setInputFiles({
    name: 'broken.bssave',
    mimeType: 'application/zip',
    buffer: Buffer.from('broken'),
  });
  await page.getByRole('button', { name: '別プレイとして取り込む', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await storedState(page)).toEqual(before);
  await input.setInputFiles({ name: 'valid.bssave', mimeType: 'application/zip', buffer: bytes });
  await page.getByRole('button', { name: '別プレイとして取り込む', exact: true }).click();
  await expect(page.getByRole('heading', { name: '続きから', exact: true })).toBeVisible({
    timeout: 30000,
  });
  const plays = page.getByRole('group', { name: '保存済みプレイ', exact: true });
  await expect(plays.getByRole('radio')).toHaveCount(2);
  expect(await plays.locator('input:checked').inputValue()).toMatch(/^import-/);
  const after = await storedState(page);
  // 既存のプレイ行は維持し、新しい独立プレイを一つ追加する。
  expect(after[0] as unknown[]).toEqual(expect.arrayContaining(before[0] as unknown[]));
  await page.getByRole('button', { name: '選んだプレイを開く', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'クラブハウス', exact: true })).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24');
});

test('タイトル：保存先を開けない場合は新規作成に失敗し、ホームへ入らない', async ({ page }) => {
  test.setTimeout(90000);
  await page.route('**/assets/world-worker-*.js', async (route) => {
    const response = await route.fetch();
    const code = await response.text();
    await route.fulfill({
      response,
      body:
        "IDBFactory.prototype.open = function () { throw new DOMException('storage disabled for test', 'SecurityError'); };\n" +
        code,
    });
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('保存先を開けません', { timeout: 30000 });
  await expect(page.getByText('保存されたプレイはまだありません。', { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByText('保存一覧を取得できません。一覧を更新してください。', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'はじめから', exact: true }).click();
  await page.getByRole('button', { name: '新しい日程を準備', exact: true }).click();
  await expect(page.getByRole('button', { name: '新しい日程を準備', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'はじめから', exact: true })).toBeVisible();
  await expect(page.getByTestId('main-date')).toHaveCount(0);
});

test('タイトル：Workerエラー通知後も現在のプレイを保持し、元の保存画面に戻れる', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.addInitScript(() => {
    const original = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (
      message: unknown,
      options?: Transferable[] | StructuredSerializeOptions,
    ) {
      if (
        message &&
        typeof message === 'object' &&
        'kind' in message &&
        message.kind === 'openPlay' &&
        Reflect.get(window, 'failTitleOpen')
      ) {
        Reflect.set(window, 'failTitleOpen', false);
        // 一回だけ要求を送らず、実Workerのエラー通知経路を通す。保存や応答は作らない。
        queueMicrotask(() =>
          this.dispatchEvent(new ErrorEvent('error', { message: 'test worker error' })),
        );
        return;
      }
      original.call(this, message, options as StructuredSerializeOptions);
    };
  });
  await page.goto('/');
  await startPlay(page);
  await system(page);
  await page.getByRole('button', { name: '世界を手動保存', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('世界全体を手動保存', { timeout: 30000 });
  const before = await storedState(page);
  await page.getByRole('button', { name: 'タイトル画面へ', exact: true }).click();
  await page.getByRole('button', { name: '続きから', exact: true }).click();
  const plays = page.getByRole('group', { name: '保存済みプレイ', exact: true });
  await plays.getByRole('radio').first().check();
  await selectSaveChoice(page.getByRole('group', { name: '開く保存枠', exact: true }), 'auto');
  await page.evaluate(() => Reflect.set(window, 'failTitleOpen', true));
  await page.getByRole('button', { name: '選んだプレイを開く', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('日次Workerでエラーが発生しました');
  expect(await storedState(page)).toEqual(before);
  await page.getByRole('button', { name: '開いているプレイへ戻る', exact: true }).click();
  await page.getByRole('button', { name: '手動保存を読み込む', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('保存した世界を読み込みました', {
    timeout: 30000,
  });
  await expect(page.getByRole('region', { name: '世界の保存', exact: true })).toBeVisible();
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24');
});
