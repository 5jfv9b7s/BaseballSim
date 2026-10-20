import { format, resolveConfig } from 'prettier';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { ensure } from '../src/engine/validation.ts';
import { parseCandidateProjection, parseCandidateDataset } from '../src/initial-data/validation.ts';

/** 元資料は読取専用。研究資料・実在名・成績・URLは出力しない。 */
export async function planCandidateImport(sourceDirectory: string) {
  const load = async (name: string) => {
    const bytes = await readFile(join(sourceDirectory, name));
    return {
      data: JSON.parse(bytes.toString('utf8')),
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  };
  const [projection, locations, physics, source, regression, baseline] = await Promise.all([
    load('data/player-candidates-v0.11.json'),
    load('data/region-catalog.json'),
    load('data/pitching-physics-rule-v0.5.json'),
    load('data/manifest.json'),
    load('growth-completion-regression-verification.json'),
    load('research/regression-baseline-v0.10.json'),
  ]);
  ensure(
    regression.data.passed === true &&
      regression.data.hashes['data/player-candidates-v0.11.json'] === projection.sha256 &&
      baseline.data.fileHashes['data/region-catalog.json'] === locations.sha256 &&
      baseline.data.fileHashes['data/pitching-physics-rule-v0.5.json'] === physics.sha256,
    '資料の検証ハッシュと取込元が一致しません',
  );
  const draft = parseCandidateProjection(projection.data);
  ensure(
    source.data.datasetVersion === draft.datasetVersion &&
      source.data.activePlayerCount === draft.players.length &&
      source.data.readyForGameImport === false,
    '元資料の名簿数・版・候補状態が一致しません',
  );
  const metadata = {
    formatVersion: 'initial-candidate-package-v1',
    datasetVersion: draft.datasetVersion,
    status: draft.status,
    sourceDraft: draft.sourceDraft,
    readyForGameImport: false,
    asOfDate: source.data.updatedOn,
    club: source.data.fictionalClub,
    sourceHashes: {
      projection: projection.sha256,
      locations: locations.sha256,
      physicsRule: physics.sha256,
    },
  };
  parseCandidateDataset({ ...metadata, locations: locations.data, players: draft.players });
  const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
  const files = new Map<string, string>([
    ['metadata.json', json(metadata)],
    ['locations.json', json(locations.data)],
  ]);
  const imports: string[] = [],
    names: string[] = [];
  for (const player of draft.players) {
    ensure(
      /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(player.playerId),
      'ファイル名として安全な固定選手IDが必要です',
    );
    const name = 'player_' + player.playerId.replaceAll('-', '_');
    const path = 'players/' + player.playerId + '.json';
    files.set(path, json(player));
    names.push(name);
    imports.push(`import ${name} from './${path}' with { type: 'json' };`);
  }
  const extra = ['twoSeamer', 'shuuto', 'knuckleCurve', 'palmBall'];
  const templates = Object.fromEntries(
    extra.map((code) => {
      const template = physics.data.templates[code];
      ensure(template?.status === 'authored-not-measured', '球種テンプレートの仮設定が必要です');
      return [code, template];
    }),
  );
  files.set(
    'preview-templates.json',
    json({ generationVersion: physics.data.generationVersion, templates }),
  );
  files.set(
    'index.ts',
    await format(
      [
        "import metadata from './metadata.json' with { type: 'json' };",
        "import locations from './locations.json' with { type: 'json' };",
        "import { parseCandidateDataset } from '../../../initial-data/validation.ts';",
        ...imports,
        '',
        '/** 候補値と未決定状態をそのまま検査・複製する。世界の名簿には投入しない。 */',
        'export function createSeibuCandidateDataset() {',
        '  return parseCandidateDataset({ ...metadata, locations, players: [',
        ...names.map((name) => '    ' + name + ','),
        '  ] });',
        '}',
        '',
      ].join('\n'),
      { ...(await resolveConfig(fileURLToPath(import.meta.url))), parser: 'typescript' },
    ),
  );
  return files;
}

async function main() {
  const args = process.argv.slice(2),
    flag = args.indexOf('--source');
  ensure(flag >= 0 && args[flag + 1], '--source にinitial-data-2026フォルダを指定してください');
  ensure(
    args.every((a, i) => i === flag || i === flag + 1 || a === '--check'),
    '未対応の引数です',
  );
  const planned = await planCandidateImport(resolve(args[flag + 1]!));
  const output = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/initial-2026/seibu');
  const check = args.includes('--check');
  // 手編集された候補を再取込で上書きしない。削除・再生成は自動実行しない。
  const mismatches: string[] = [];
  for (const [name, contents] of planned) {
    const path = join(output, name);
    let old: string | undefined;
    try {
      old = await readFile(path, 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    if (
      old !== undefined &&
      (name.endsWith('.json')
        ? JSON.stringify(JSON.parse(old)) === JSON.stringify(JSON.parse(contents))
        : old.replaceAll('\r\n', '\n') === contents)
    )
      continue;
    if (check || old !== undefined) mismatches.push(name);
  }
  const existing = await readdir(join(output, 'players')).catch((e) => {
    if (e.code === 'ENOENT') return [];
    throw e;
  });
  for (const name of existing)
    if (!planned.has('players/' + name)) mismatches.push('余分な選手ファイル: ' + name);
  ensure(mismatches.length === 0, '取込元との差分（既存入力は保全）: ' + mismatches.join(', '));
  if (!check) {
    for (const [name, contents] of planned) {
      const path = join(output, name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, contents, { encoding: 'utf8', flag: 'wx' }).catch((e) => {
        if (e.code !== 'EEXIST') throw e;
      });
    }
  }
  console.log(
    `${check ? '取込元との一致' : '初期候補の取込'}: ${planned.size}ファイル（研究資料・旧名簿は変更なし）`,
  );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
