// 通常のdistを保ったまま、テスト配信専用のフォルダを作る。
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const outputName = 'dist-cloudflare-test';
export const manifestName = 'cloudflare-test-build.json';
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const forbiddenDirectories = new Set(['.git', '.tmp', 'node_modules', 'docs', 'research']);
const forbiddenExtensions = /\.(?:bssave|sqlite3?|db)$/i;

export async function listFiles(folder, prefix = '') {
  const files = [];
  const entries = await readdir(folder, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const path = join(folder, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`配信フォルダ内のシンボリックリンクは扱えません: ${relative}`);
    if (entry.isDirectory()) {
      if (forbiddenDirectories.has(entry.name.toLowerCase()))
        throw new Error(`配信対象外のフォルダです: ${relative}`);
      files.push(...(await listFiles(path, relative)));
    } else if (entry.isFile()) {
      if (
        /^(?:\.env|\.dev\.vars)(?:\.|$)/i.test(entry.name) ||
        forbiddenExtensions.test(entry.name)
      ) {
        throw new Error(`配信対象外のファイルです: ${relative}`);
      }
      files.push(relative);
    } else {
      throw new Error(`通常ファイル以外が含まれています: ${relative}`);
    }
  }
  return files;
}

export async function fileManifest(folder, names) {
  const result = [];
  for (const path of [...names].sort()) {
    const bytes = await readFile(join(folder, path));
    result.push({ path, bytes: bytes.length, sha256: sha256(bytes) });
  }
  return result;
}

// Windowsでの一時的なファイル占有だけを短時間再試行し、恒久エラーはそのまま返す。
const removeGenerated = (folder) =>
  rm(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });

// ディレクトリの権限をコピーせず、確認したファイルの内容だけを複製する。
async function copyFiles(source, target, names) {
  for (const name of names) {
    const destination = join(target, name);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, await readFile(join(source, name)));
  }
}

async function publishFiles(staging, target) {
  const names = await listFiles(staging);
  const wanted = new Set(names);
  await mkdir(target, { recursive: true });
  const oldNames = await listFiles(target);
  // 更新途中の配信物が、前回の検査済み目録で受理されないようにする。
  if (oldNames.includes(manifestName)) await unlink(join(target, manifestName));
  for (const name of oldNames) {
    if (name !== manifestName && !wanted.has(name)) await unlink(join(target, name));
  }
  await copyFiles(
    staging,
    target,
    names.filter((name) => name !== manifestName),
  );
  await copyFiles(staging, target, [manifestName]);
  const expected = await fileManifest(staging, names);
  const actual = await fileManifest(target, await listFiles(target));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('配信用フォルダへのコピーが一致しません。配信せず作り直してください。');
  }
}

export async function prepareTestAssets(projectRoot) {
  const root = resolve(projectRoot);
  const source = join(root, 'dist');
  const target = join(root, outputName);
  const sourceStat = await lstat(source);
  if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink())
    throw new Error('distは通常のフォルダである必要があります。');
  const names = await listFiles(source);
  if (!names.includes('index.html'))
    throw new Error('dist/index.htmlがありません。先に通常のビルドを実行してください。');
  if (names.includes('_headers') || names.includes(manifestName)) {
    throw new Error(
      'distに既存の_headersまたはテスト目録があります。上書きせず、既存設定との統合を確認してください。',
    );
  }
  const html = await readFile(join(source, 'index.html'), 'utf8');
  if (!/<title>[^]*?<\/title>/i.test(html) || !/<\/head>/i.test(html))
    throw new Error('index.htmlのhead/titleを確認できません。');
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const sourceFiles = await fileManifest(source, names);
  try {
    const stat = await lstat(target);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error('テスト出力先は通常のフォルダである必要があります。');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const temporaryRoot = resolve(tmpdir());
  const staging = await mkdtemp(join(temporaryRoot, 'baseball-cloudflare-stage-'));
  // 削除対象は、この処理専用のOS一時フォルダだけ。配信先のディレクトリは削除しない。
  if (
    dirname(resolve(target)) !== root ||
    dirname(resolve(staging)) !== temporaryRoot ||
    !basename(staging).startsWith('baseball-cloudflare-stage-')
  ) {
    throw new Error('生成物の対象パスが想定したフォルダの外を指しています。');
  }

  let failure;
  try {
    await copyFiles(source, staging, names);
    const marked = html
      .replace(
        /<title>([^]*?)<\/title>/i,
        (_, title) => `<title>[テスト版] ${title.replace(/^\[テスト版\]\s*/, '')}</title>`,
      )
      .replace(/<meta\b(?=[^>]*\bname\s*=\s*["']robots["'])[^>]*>\s*/gi, '')
      .replace(/<\/head>/i, '  <meta name="robots" content="noindex, nofollow" />\n  </head>');
    await writeFile(join(staging, 'index.html'), marked, 'utf8');
    await writeFile(
      join(staging, '_headers'),
      await readFile(new URL('./headers.txt', import.meta.url)),
    );
    const files = await fileManifest(staging, await listFiles(staging));
    const manifest = {
      formatVersion: 'baseball-cloudflare-test-assets-v1',
      packageName: pkg.name,
      gameVersion: pkg.version,
      buildHash: sha256(JSON.stringify(files)),
      sourceFiles,
      files,
    };
    await writeFile(join(staging, manifestName), JSON.stringify(manifest, null, 2) + '\n');
    // 生成中はローカル配信を停止する。成功した全件照合とcheckの後に配信する。
    await publishFiles(staging, target);
    return {
      outputDirectory: outputName,
      gameVersion: pkg.version,
      assetCount: files.length,
      buildHash: manifest.buildHash,
    };
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    try {
      await removeGenerated(staging);
    } catch (cleanupError) {
      if (failure)
        throw new AggregateError(
          [failure, cleanupError],
          '配信物の作成と一時フォルダの片付けに失敗しました',
        );
      throw cleanupError;
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  try {
    console.log(JSON.stringify(await prepareTestAssets(root), null, 2));
  } catch (error) {
    const detail =
      error instanceof AggregateError
        ? error.errors.map((e) => e.message).join(' / ')
        : error.message;
    console.error(`テスト配信フォルダの作成に失敗: ${detail}`);
    process.exitCode = 1;
  }
}
