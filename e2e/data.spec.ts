import 'fake-indexeddb/auto';
import { test, expect } from '@playwright/test';
import { createCurrentFixture } from '../src/data/datasets/current.ts';
import { createGame, runToCompletion } from '../src/game/engine.ts';
import { finalizeGame } from '../src/game/results.ts';
import { DexieStorageAdapter, GameDatabase } from '../src/storage/dexie-adapter.ts';

test('保存した独自名簿の球団・選手ID・名前を表示し、新規試合は現在のデータへ戻る', async ({
  page,
}) => {
  const fixture = createCurrentFixture();
  const player = fixture.players[0]!;
  const previousId = player.playerId;
  player.playerId = 'saved-player-a-01';
  player.familyName = '保存名簿';
  player.givenName = '確認';
  fixture.teams.away.name = '保存名簿フォックス';
  fixture.teams.away.lineup[0]!.playerId = player.playerId;
  const club = fixture.clubs.find((club) => club.clubId === fixture.teams.away.clubId)!;
  club.name = fixture.teams.away.name;
  club.playerIds = club.playerIds.map((id) => (id === previousId ? player.playerId : id));
  const record = createGame(20260923, fixture);
  runToCompletion(record);
  finalizeGame(record);

  // Node側の試験専用DBで正式な保存を生成し、専用ブラウザへ渡す。
  const db = new GameDatabase('e2e-custom-roster-' + crypto.randomUUID());
  const tables: Record<string, Record<string, unknown>[]> = {};
  try {
    await new DexieStorageAdapter(db).commitSnapshot(record, 0);
    for (const table of db.tables) {
      tables[table.name] = (await table.toArray()).map((row) => ({
        ...row,
        ...(row.payloadBytes ? { payloadBytes: [...row.payloadBytes] } : {}),
      }));
    }
  } finally {
    await db.delete();
  }

  await page.goto('/');
  await expect(page.getByRole('button', { name: '1試合を自動進行', exact: true })).toBeEnabled();
  await page.evaluate(async (tables) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('BaseballSim-v01-results');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(Object.keys(tables), 'readwrite');
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
        for (const [name, rows] of Object.entries(tables)) {
          for (const row of rows) {
            transaction.objectStore(name).put({
              ...row,
              ...(row.payloadBytes
                ? { payloadBytes: new Uint8Array(row.payloadBytes as number[]) }
                : {}),
            });
          }
        }
      });
    } finally {
      db.close();
    }
  }, tables);

  await page.reload();
  await page.getByRole('button', { name: '保存した試合を読み込む', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('読み込みました');
  const statistics = page.getByRole('region', { name: '試合成績' });
  await expect(statistics).toContainText('保存名簿フォックス');
  await expect(statistics).toContainText('保存名簿 確認');
  await expect(statistics).not.toContainText('汐見 航');
  await expect(page.getByRole('alert')).toHaveCount(0);

  await page.getByRole('button', { name: '新しい試合を準備', exact: true }).click();
  await page.getByRole('button', { name: '1試合を自動進行', exact: true }).click();
  await expect(statistics).toContainText('汐見 航');
  await expect(statistics).toContainText('星原フォックス');
  await expect(statistics).not.toContainText('保存名簿 確認');
});
