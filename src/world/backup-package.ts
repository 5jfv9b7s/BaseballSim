import { ensure, integer } from '../engine/validation.ts';
import { canonicalJson, sha256 } from '../storage/codec.ts';
import { decodeWorldSnapshot, exactKeys, validateSnapshot } from './snapshot-codec.ts';
import { MAX_BYTES, type Snapshot, type Block } from './save-format.ts';
import { MAX_PACKAGE_BYTES, readBackupZip, writeBackupZip } from './backup-zip.ts';

export const BACKUP_FORMAT = 'bssave-v1';
const MAX_MANIFEST_BYTES = 1024 * 1024;
interface PackageManifest extends Snapshot {
  formatVersion: typeof BACKUP_FORMAT;
  payloads: { blockId: string; codec: Block['codec']; bytes: number }[];
  packageHash: string;
}

export async function encodeBackup(snapshot: Snapshot, blocks: Block[]): Promise<Uint8Array> {
  // 壊れた保存を正常なバックアップとして出力しない。
  await decodeWorldSnapshot(snapshot, blocks);
  const body = {
    ...snapshot,
    formatVersion: BACKUP_FORMAT,
    payloads: blocks.map((b) => ({
      blockId: b.blockId,
      codec: b.codec,
      bytes: b.payloadBytes.length,
    })),
  };
  const manifest = { ...body, packageHash: await sha256(canonicalJson(body)) };
  const json = new TextEncoder().encode(JSON.stringify(manifest, null, 2) + '\n');
  ensure(json.length <= MAX_MANIFEST_BYTES, 'バックアップ目録が大きすぎます');
  return writeBackupZip(
    new Map([
      ['manifest.json', json],
      ...blocks.map((b): [string, Uint8Array] => ['blocks/' + b.blockId + '.bin', b.payloadBytes]),
    ]),
  );
}

export async function decodeBackup(input: Uint8Array) {
  ensure(
    input instanceof Uint8Array && input.length <= MAX_PACKAGE_BYTES,
    '保存ファイルの容量上限を超えました',
  );
  // 検査中に呼出元が入力を書き換えても、確定するバイト列は変わらない。
  const entries = readBackupZip(new Uint8Array(input));
  const bytes = entries.get('manifest.json');
  ensure(
    bytes && bytes.length <= MAX_MANIFEST_BYTES,
    'バックアップ目録がありません、または大きすぎます',
  );
  const manifest = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(bytes),
  ) as PackageManifest;
  ensure(manifest && manifest.formatVersion === BACKUP_FORMAT, '未対応のバックアップ形式です');
  const { formatVersion: _format, payloads, packageHash, ...snapshot } = manifest;
  validateSnapshot(snapshot);
  ensure(
    typeof packageHash === 'string' && /^[a-f0-9]{64}$/.test(packageHash),
    'バックアップのハッシュが不正です',
  );
  const { packageHash: _hash, ...body } = manifest;
  ensure(
    (await sha256(canonicalJson(body))) === packageHash,
    'バックアップのハッシュが一致しません',
  );
  ensure(
    Array.isArray(payloads) &&
      payloads.length === snapshot.blockRefs.length &&
      entries.size === payloads.length + 1,
    'バックアップのブロック数が不正です',
  );
  let total = 0;
  const blocks: Block[] = snapshot.blockRefs.map((ref, index) => {
    const payload = payloads[index]!;
    exactKeys(payload, ['blockId', 'codec', 'bytes'], 'バックアップ容量目録');
    ensure(
      payload.blockId === ref.blockId && ['none', 'gzip'].includes(payload.codec),
      'バックアップの圧縮方式・参照は未対応です',
    );
    integer(payload.bytes, 1, MAX_BYTES, 'バックアップの格納容量');
    total += payload.bytes;
    ensure(total <= MAX_BYTES, 'バックアップの格納容量上限を超えました');
    const data = entries.get('blocks/' + ref.blockId + '.bin');
    ensure(data && data.length === payload.bytes, 'バックアップのブロックが欠損・容量不一致です');
    // ZIP内のviewのままだと、IndexedDBが各レコードにZIP全体のbufferを複製する。
    // 保存するブロックの範囲だけを所有するバイト列へ切り離す。
    return { ...ref, codec: payload.codec, payloadBytes: new Uint8Array(data) };
  });
  const world = await decodeWorldSnapshot(snapshot, blocks);
  return { snapshot, blocks, world, packageHash };
}
