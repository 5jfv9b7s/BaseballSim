import { test, expect } from '@playwright/test';

test('MVP-03/04: 自動進行の一時停止・表示切替・再開でも同じ結果になる', async ({ page }) => {
  // Workerへの配送だけを遅らせ、一時停止を確実に操作できる時間を作る。
  // 計算・乱数・Workerからの応答内容には手を加えない。
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (
      message: unknown,
      options: Transferable[] | StructuredSerializeOptions = [],
    ) {
      const deliver = () =>
        post.call(this, message, Array.isArray(options) ? { transfer: options } : options);
      if (message && typeof message === 'object' && 'kind' in message && message.kind === 'advance')
        setTimeout(deliver, 60);
      else deliver();
    };
  });

  await page.goto('/');
  const run = page.getByRole('button', { name: '1試合を自動進行', exact: true });
  const pause = page.getByRole('button', { name: '一時停止', exact: true });
  const step = page.getByRole('button', { name: '1イベント進める', exact: true });
  const save = page.getByRole('button', { name: '試合結果を保存', exact: true });
  const reset = page.getByRole('button', { name: '新しい試合を準備', exact: true });
  const progress = page.locator('.game-progress');
  const statistics = page.getByRole('region', { name: '試合成績' });

  await expect(run).toBeEnabled();
  await page.getByLabel('試合seed', { exact: true }).fill('3668339987');
  await reset.click();
  await run.click();
  await pause.click();
  await expect(step).toBeEnabled();
  await expect(save).toBeDisabled();
  const stopped = await progress.innerText();

  await page.getByRole('button', { name: '1球の検証', exact: true }).click();
  await page.getByRole('button', { name: '1試合シミュレーション', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 960 });
  await expect(progress).toHaveText(stopped);
  await run.click();
  await expect(save).toBeEnabled();
  const resumed = await statistics.innerText();

  await reset.click();
  await run.click();
  await expect(save).toBeEnabled();
  await expect(statistics).toHaveText(resumed, { useInnerText: true });
  await expect(progress).toHaveText('終了：275球 / 75打席');
});

test('MVP-06/07: 壊れた最新保存を読み込んでも画面を保ち、前保存を復元できる', async ({ page }) => {
  await page.goto('/');
  const run = page.getByRole('button', { name: '1試合を自動進行', exact: true });
  const save = page.getByRole('button', { name: '試合結果を保存', exact: true });
  const reset = page.getByRole('button', { name: '新しい試合を準備', exact: true });
  const statistics = page.getByRole('region', { name: '試合成績' });

  await run.click();
  await expect(save).toBeEnabled();
  const first = await statistics.innerText();
  await save.click();
  await expect(page.getByRole('status')).toContainText('保存しました');

  await page.getByLabel('試合seed', { exact: true }).fill('3668339987');
  await reset.click();
  await run.click();
  await expect(save).toBeEnabled();
  const second = await statistics.innerText();
  await save.click();
  await expect(page.getByRole('status')).toContainText('保存しました');

  // この試験専用ブラウザコンテキストの最新gameブロックだけを壊す。
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('BaseballSim-v01-results');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(
          ['save_slots', 'save_snapshots', 'save_blocks'],
          'readwrite',
        );
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
        transaction.onerror = () => reject(transaction.error);
        const slot = transaction.objectStore('save_slots').get(['v01-local', 'manual', 1]);
        slot.onsuccess = () => {
          const snapshot = transaction.objectStore('save_snapshots').get(slot.result.snapshotId);
          snapshot.onsuccess = () => {
            const ref = snapshot.result.blockRefs.find(
              (entry: { kind: string }) => entry.kind === 'game',
            );
            const blocks = transaction.objectStore('save_blocks');
            const block = blocks.get(ref.blockId);
            block.onsuccess = () => {
              block.result.payloadBytes[0] = 0;
              blocks.put(block.result);
            };
          };
        };
      });
    } finally {
      db.close();
    }
  });

  await page.getByRole('button', { name: '保存した試合を読み込む', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('破損');
  await expect(statistics).toHaveText(second, { useInnerText: true });
  await expect(run).toBeDisabled();
  await page.getByRole('button', { name: '前の保存を読み込む', exact: true }).click();
  await expect(statistics).toHaveText(first, { useInnerText: true });
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('読み込みました');
});
