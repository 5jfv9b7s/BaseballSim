import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { checkTestAssets } from './check.mjs';
import { sha256, manifestName, outputName } from './prepare.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

async function savePanel(page) {
  await page
    .getByRole('navigation', { name: 'メインメニュー', exact: true })
    .getByRole('button', { name: 'システム', exact: true })
    .click();
  const panel = page.getByRole('region', { name: '世界の保存', exact: true });
  const summary = panel.getByText('ファイルのバックアップ・別プレイの復元', { exact: true });
  if ((await summary.locator('..').getAttribute('open')) === null) await summary.click();
  return panel;
}

async function openManual(page, panel, playId) {
  await panel.getByRole('combobox', { name: '保存済みプレイ', exact: true }).selectOption(playId);
  await panel.getByRole('combobox', { name: '開く保存枠', exact: true }).selectOption('manual');
  await panel.getByRole('button', { name: '選んだプレイを開く', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('保存した世界を読み込みました', {
    timeout: 30000,
  });
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-25');
}

test('静的配信：HTML・全アセット・WorkerのMIME/ハッシュ・検索抑制・深いパス', async ({
  request,
}) => {
  const checked = await checkTestAssets(root);
  expect(checked.gameVersion).toBe(pkg.version);
  const metadata = JSON.parse(await readFile(join(root, outputName, manifestName), 'utf8'));
  for (const file of metadata.files) {
    if (file.path === '_headers') continue;
    const response = await request.get('/' + file.path, {
      headers: { Accept: file.path === 'index.html' ? 'text/html' : '*/*' },
    });
    expect(response.status(), file.path).toBe(200);
    expect(sha256(await response.body()), file.path).toBe(file.sha256);
    const headers = response.headers();
    expect(headers['x-robots-tag'], file.path).toBe('noindex, nofollow');
    expect(headers['cache-control'], file.path).toBe('no-cache');
    expect(headers['x-content-type-options'], file.path).toBe('nosniff');
    if (file.path.endsWith('.js'))
      expect(headers['content-type']).toMatch(/(?:javascript|ecmascript)/);
    if (file.path.endsWith('.css')) expect(headers['content-type']).toMatch(/^text\/css/);
    if (file.path.endsWith('.svg')) expect(headers['content-type']).toMatch(/^image\/svg\+xml/);
    if (file.path.endsWith('.html')) expect(headers['content-type']).toMatch(/^text\/html/);
  }
  const index = metadata.files.find((file) => file.path === 'index.html');
  for (const path of ['/', '/calendar/review']) {
    const response = await request.get(path, {
      headers: { Accept: 'text/html', 'Sec-Fetch-Mode': 'navigate' },
    });
    expect(response.status()).toBe(200);
    expect(sha256(await response.body())).toBe(index.sha256);
  }
  const remoteManifest = await request.get('/' + manifestName);
  expect(await remoteManifest.json()).toEqual(metadata);
  const hidden = await request.get('/_headers', { headers: { Accept: 'text/plain' } });
  expect(await hidden.text()).not.toBe(await readFile(join(root, outputName, '_headers'), 'utf8'));
  expect(await hidden.text()).not.toContain('X-Robots-Tag: noindex, nofollow');
});

for (const width of [1280, 390]) {
  test(`テスト配信：新規プレイ・日次・保存復帰・別保存領域へのバックアップ (${width}px)`, async ({
    page,
    browser,
  }) => {
    await page.setViewportSize({ width, height: 960 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page).toHaveTitle(
      new RegExp('^\\[テスト版\\].*' + pkg.version.replaceAll('.', '\\.')),
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow',
    );
    await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24');
    const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
    await nav.getByRole('button', { name: '編成', exact: true }).click();
    await expect(page.locator('.formation-editor').first()).toBeVisible();
    await nav.getByRole('button', { name: '日程', exact: true }).click();
    await page.getByRole('button', { name: 'カレンダー', exact: true }).click();
    await expect(page.getByRole('region', { name: '月別カレンダー', exact: true })).toBeVisible();

    await nav.getByRole('button', { name: 'システム', exact: true }).click();
    await page.getByRole('button', { name: '新規プレイ', exact: true }).click();
    await page.getByText('新規日程・担当球団と試作の範囲', { exact: true }).click();
    await page.getByRole('textbox', { name: '世界seed', exact: true }).fill('20261020');
    await page.getByRole('button', { name: '新しい日程を準備', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('初回保存が完了', { timeout: 30000 });
    await nav.getByRole('button', { name: '日程', exact: true }).click();
    await page.getByRole('button', { name: '今日の進行', exact: true }).click();
    await page.getByRole('button', { name: '1日を自動進行', exact: true }).click();
    await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-25', {
      timeout: 60000,
    });

    let panel = await savePanel(page);
    await panel.getByRole('button', { name: '世界を手動保存', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('世界全体を手動保存', { timeout: 30000 });
    const plays = panel.getByRole('combobox', { name: '保存済みプレイ', exact: true });
    await expect(plays.locator('option')).toHaveCount(2);
    const playId = await plays.locator('option').nth(1).getAttribute('value');
    expect(playId).toMatch(/^play-/);
    const downloadPromise = page.waitForEvent('download');
    await panel.getByRole('button', { name: '保存ファイルを書き出す', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('BaseballSim-manual.bssave');
    const bytes = await readFile(await download.path());
    expect(bytes.subarray(0, 4).toString('hex')).toBe('504b0304');
    await page.reload();
    panel = await savePanel(page);
    await openManual(page, panel, playId);
    await nav.getByRole('button', { name: 'ホーム', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `.tmp/cloudflare-test-qa/home-${width}.png`, fullPage: true });

    // 別ContextはIndexedDBを共有しない。ファイルだけを渡して復元する。
    const independent = await browser.newContext({ viewport: { width, height: 960 } });
    try {
      const receiver = await independent.newPage();
      receiver.on('pageerror', (error) => errors.push(error.message));
      await receiver.goto(new URL('/', page.url()).href);
      const importedPanel = await savePanel(receiver);
      await importedPanel.getByLabel('取り込む保存ファイル', { exact: true }).setInputFiles({
        name: 'cloudflare-test-backup.bssave',
        mimeType: 'application/zip',
        buffer: bytes,
      });
      await importedPanel
        .getByRole('button', { name: '別プレイとして取り込む', exact: true })
        .click();
      await expect(receiver.getByRole('status')).toContainText('別プレイとして取り込みました', {
        timeout: 30000,
      });
      const importedId = await importedPanel
        .getByRole('combobox', { name: '保存済みプレイ', exact: true })
        .inputValue();
      expect(importedId).toMatch(/^import-/);
      await openManual(receiver, importedPanel, importedId);
      await receiver.screenshot({
        path: `.tmp/cloudflare-test-qa/import-${width}.png`,
        fullPage: true,
      });
    } finally {
      await independent.close();
    }
    expect(errors).toEqual([]);
  });
}
