import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import {
  prepareTestAssets,
  fileManifest,
  listFiles,
  manifestName,
  outputName,
} from './prepare.mjs';
import { checkTestAssets } from './check.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'baseball-cf-test-'));
  t.after(async () => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(basename(root).startsWith('baseball-cf-test-'));
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(join(root, 'dist', 'assets'), { recursive: true });
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({ name: 'baseball-sim', version: '9.8.7' }),
  );
  await writeFile(
    join(root, 'dist', 'index.html'),
    '<html><head><title>野球</title><meta name="robots" content="index"></head><body><script src="/assets/game.js"></script></body></html>',
  );
  await writeFile(
    join(root, 'dist', 'assets', 'game.js'),
    'new Worker(new URL("./game-worker.js", import.meta.url));',
  );
  await writeFile(
    join(root, 'dist', 'assets', 'game-worker.js'),
    'self.onmessage = () => postMessage("ready");',
  );
  await writeFile(
    join(root, 'wrangler.test.jsonc'),
    JSON.stringify({
      name: 'baseball-sim-test',
      workers_dev: true,
      preview_urls: false,
      assets: {
        directory: './dist-cloudflare-test',
        not_found_handling: 'single-page-application',
      },
    }),
  );
  return root;
}

test('通常distとゲーム資産を保ち、現在の版にテスト表示・配信ヘッダーを付ける', async (t) => {
  const root = await fixture(t);
  const before = await fileManifest(join(root, 'dist'), await listFiles(join(root, 'dist')));
  const result = await prepareTestAssets(root);
  assert.equal(result.gameVersion, '9.8.7');
  assert.deepEqual(
    await fileManifest(join(root, 'dist'), await listFiles(join(root, 'dist'))),
    before,
  );
  const html = await readFile(join(root, outputName, 'index.html'), 'utf8');
  assert.match(html, /<title>\[テスト版\] 野球<\/title>/);
  assert.equal((html.match(/name="robots"/g) || []).length, 1);
  for (const file of before.filter((file) => file.path !== 'index.html')) {
    assert.deepEqual(
      await readFile(join(root, outputName, file.path)),
      await readFile(join(root, 'dist', file.path)),
    );
  }
  assert.equal((await checkTestAssets(root)).passed, true);
});

test('同じビルドからは同一の配信物・目録になる', async (t) => {
  const root = await fixture(t);
  await prepareTestAssets(root);
  const first = await fileManifest(join(root, outputName), await listFiles(join(root, outputName)));
  await prepareTestAssets(root);
  assert.deepEqual(
    await fileManifest(join(root, outputName), await listFiles(join(root, outputName))),
    first,
  );
});

test('既存ヘッダー・セーブ・環境設定の混入を止め、前回の出力を保つ', async (t) => {
  const root = await fixture(t);
  await prepareTestAssets(root);
  const previous = await readFile(join(root, outputName, manifestName));
  for (const name of ['_headers', 'backup.bssave', '.env.local', '.dev.vars', '.dev.vars.test']) {
    await writeFile(join(root, 'dist', name), 'must not publish');
    await assert.rejects(prepareTestAssets(root));
    assert.deepEqual(await readFile(join(root, outputName, manifestName)), previous);
    await rm(join(root, 'dist', name));
  }
});

test('リンクとindex欠落は配信フォルダに取り込まない', async (t) => {
  const root = await fixture(t);
  // Windowsでは管理者権限を要しないjunctionで、リンク拒否を実際に検査する。
  const linked = join(root, 'dist', 'linked');
  const outside = join(root, 'outside-dist');
  await mkdir(outside);
  await symlink(outside, linked, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(prepareTestAssets(root), /シンボリックリンク/);
  await rm(linked);
  await rm(join(root, 'dist', 'index.html'));
  await assert.rejects(prepareTestAssets(root), /index.html/);
});

test('生成後の改変・目録外ファイルを公開前に検出する', async (t) => {
  const root = await fixture(t);
  await prepareTestAssets(root);
  await writeFile(join(root, outputName, 'assets', 'game-worker.js'), 'changed');
  await assert.rejects(checkTestAssets(root), /生成後/);
  await prepareTestAssets(root);
  const manifestPath = join(root, outputName, manifestName);
  const metadata = JSON.parse(await readFile(manifestPath, 'utf8'));
  await writeFile(manifestPath, JSON.stringify({ ...metadata, gameVersion: '1.0.0' }));
  await assert.rejects(checkTestAssets(root), /ゲーム版/);
  await prepareTestAssets(root);
  await writeFile(join(root, outputName, 'extra.txt'), 'extra');
  await assert.rejects(checkTestAssets(root), /目録外/);
});

test('元のビルド変更と本番向け配信設定を検出する', async (t) => {
  const root = await fixture(t);
  await prepareTestAssets(root);
  await writeFile(join(root, 'dist', 'assets', 'game.js'), 'rebuilt');
  await assert.rejects(checkTestAssets(root), /通常ビルド/);
  await prepareTestAssets(root);
  const configPath = join(root, 'wrangler.test.jsonc');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  await writeFile(configPath, JSON.stringify({ ...config, name: 'baseball-sim' }));
  await assert.rejects(checkTestAssets(root), /テスト専用名/);
  await writeFile(configPath, JSON.stringify({ ...config, routes: ['example.com/*'] }));
  await assert.rejects(checkTestAssets(root), /静的テスト配信専用/);
});

test('再生成では古いアセットを残さず、新しい目録と全ファイルを照合する', async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, 'dist', 'assets', 'old.js'), 'old-only');
  await prepareTestAssets(root);
  await rm(join(root, 'dist', 'assets', 'old.js'));
  await writeFile(join(root, 'dist', 'assets', 'new.js'), 'new-only');
  await prepareTestAssets(root);
  const shipped = await listFiles(join(root, outputName));
  assert.equal(shipped.includes('assets/old.js'), false);
  assert.equal(shipped.includes('assets/new.js'), true);
  assert.equal((await checkTestAssets(root)).passed, true);
});
