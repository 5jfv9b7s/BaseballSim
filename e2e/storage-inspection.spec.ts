import { test, expect } from '@playwright/test';

for (const width of [1280, 390]) {
  test('保存容量：読み取り専用診断・履歴保持・再読込 (' + width + 'px)', async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
    const panel = page.getByRole('region', { name: '世界の保存', exact: true });
    await panel.getByText('保存容量と履歴を確認', { exact: true }).click();
    const inspect = panel.getByRole('button', { name: '保存容量を診断', exact: true });
    await inspect.click();
    const report = panel.getByTestId('storage-inspection');
    await expect(report).toContainText('保存履歴：0件');
    await expect(panel).toContainText('未保存の変更');
    for (let i = 0; i < 3; i++) {
      await panel.getByRole('button', { name: '世界を手動保存', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('世界全体を手動保存', {
        timeout: 30000,
      });
    }
    const records = () =>
      page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('BaseballSim-v02-worlds');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          return await new Promise<string>((resolve, reject) => {
            const stores = ['local_worlds', 'save_slots', 'save_snapshots', 'save_blocks'];
            const tx = db.transaction(stores, 'readonly');
            const rows: Record<string, unknown> = {};
            for (const name of stores) {
              const request =
                name === 'save_blocks'
                  ? tx.objectStore(name).getAllKeys()
                  : tx.objectStore(name).getAll();
              request.onsuccess = () => {
                rows[name] = request.result;
              };
            }
            tx.oncomplete = () => resolve(JSON.stringify(rows));
            tx.onabort = () => reject(tx.error);
          });
        } finally {
          db.close();
        }
      });
    const before = await records();
    await inspect.click();
    await expect(report).toContainText('保存履歴：1件（保護対象：1件）');
    await expect(report).toContainText('未参照の履歴：0件');
    await expect(panel).toContainText('現在の作業状態は保存済み');
    expect(await records()).toEqual(before);
    await inspect.click();
    await expect(report).toContainText('保存履歴：1件');
    expect(await records()).toEqual(before);
    await panel.screenshot({ path: 'test-results/storage-inspection-' + width + '.png' });
    await page.getByRole('button', { name: '1日を自動進行', exact: true }).click();
    await expect(inspect).toBeDisabled();
    await expect(page.getByTestId('world-date')).toHaveText('2026-09-25', { timeout: 60000 });
    await expect(report).toHaveCount(0);
    await page.reload();
    await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
    await panel.getByRole('button', { name: '自動保存を読み込む', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('読み込みました', { timeout: 30000 });
    await panel.getByText('保存容量と履歴を確認', { exact: true }).click();
    await inspect.click();
    await expect(report).toContainText('保存履歴：2件（保護対象：2件）');
    await expect(page.getByTestId('world-date')).toHaveText('2026-09-25');
    // 日次保存をさらに進めても、自動・直前自動・手動の3枠は読み戻せる。
    await page.getByRole('button', { name: '1日を自動進行', exact: true }).click();
    await expect(page.getByTestId('world-date')).toHaveText('2026-09-26', { timeout: 60000 });
    await inspect.click();
    await expect(report).toContainText('保存履歴：3件（保護対象：3件）');
    await expect(report).toContainText('未参照の共有データ：0件');
    await panel.getByRole('button', { name: '直前の自動保存を読み込む', exact: true }).click();
    await expect(page.getByTestId('world-date')).toHaveText('2026-09-25', { timeout: 30000 });
    await panel.getByRole('button', { name: '手動保存を読み込む', exact: true }).click();
    await expect(page.getByTestId('world-date')).toHaveText('2026-09-24', { timeout: 30000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  });
}
