// 公開前に、配信範囲・目録・テスト専用設定を確認する。通信やデプロイは行わない。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileManifest, listFiles, manifestName, outputName, sha256 } from './prepare.mjs';

export async function checkTestAssets(projectRoot) {
  const root = resolve(projectRoot);
  const config = JSON.parse(await readFile(join(root, 'wrangler.test.jsonc'), 'utf8'));
  const allowed = new Set([
    '$schema',
    'name',
    'compatibility_date',
    'workers_dev',
    'preview_urls',
    'send_metrics',
    'assets',
    'account_id',
  ]);
  assert.ok(
    Object.keys(config).every((key) => allowed.has(key)),
    'このキットは静的テスト配信専用です。追加の設定は別途確認してください。',
  );
  assert.match(
    config.name,
    /^[a-z0-9][a-z0-9-]*-test$/,
    'Worker名は-testで終わるテスト専用名にしてください。',
  );
  assert.equal(config.workers_dev, true);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.assets, {
    directory: `./${outputName}`,
    not_found_handling: 'single-page-application',
  });
  const folder = join(root, outputName);
  const metadata = JSON.parse(await readFile(join(folder, manifestName), 'utf8'));
  assert.equal(metadata.formatVersion, 'baseball-cloudflare-test-assets-v1');
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.equal(metadata.packageName, pkg.name, '配信目録のプロジェクト名が一致しません。');
  assert.equal(
    metadata.gameVersion,
    pkg.version,
    '配信目録のゲーム版が一致しません。作り直してください。',
  );
  const actualNames = (await listFiles(folder)).filter((name) => name !== manifestName).sort();
  assert.deepEqual(
    actualNames,
    metadata.files.map((file) => file.path).sort(),
    '配信目録外のファイルがあります。',
  );
  assert.deepEqual(
    await fileManifest(folder, actualNames),
    metadata.files,
    '生成後にファイルが変わっています。作り直してください。',
  );
  assert.equal(metadata.buildHash, sha256(JSON.stringify(metadata.files)));
  const current = await fileManifest(join(root, 'dist'), await listFiles(join(root, 'dist')));
  assert.deepEqual(
    current,
    metadata.sourceFiles,
    '通常ビルドとテスト配信用ファイルが食い違います。',
  );
  for (const file of metadata.sourceFiles) {
    if (file.path === 'index.html') continue;
    const shipped = metadata.files.find((entry) => entry.path === file.path);
    assert.ok(shipped, `元のアセットが欠けています: ${file.path}`);
    assert.equal(shipped.sha256, file.sha256, `ゲームのアセットを書き換えています: ${file.path}`);
  }
  const html = await readFile(join(folder, 'index.html'), 'utf8');
  assert.match(html, /<title>\[テスト版\]/);
  assert.match(html, /name="robots" content="noindex, nofollow"/);
  assert.equal(
    await readFile(join(folder, '_headers'), 'utf8'),
    await readFile(new URL('./headers.txt', import.meta.url), 'utf8'),
  );
  return {
    passed: true,
    gameVersion: metadata.gameVersion,
    assets: metadata.files.length,
    buildHash: metadata.buildHash,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(
      JSON.stringify(
        await checkTestAssets(resolve(dirname(fileURLToPath(import.meta.url)), '..')),
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(`テスト公開前の検査に失敗: ${error.message}`);
    process.exitCode = 1;
  }
}
