import { ensure } from '../engine/validation.ts';
import { canonicalJson, sha256 } from '../storage/codec.ts';
import { decompress } from './compression.ts';
import type { WorldDatabase } from './dexie-storage.ts';
import type { Block } from './save-format.ts';

export function sameStoredBlock(a: Block, b: Block): boolean {
  const { payloadBytes: aBytes, ...aMeta } = a;
  const { payloadBytes: bBytes, ...bMeta } = b;
  return (
    canonicalJson(aMeta) === canonicalJson(bMeta) &&
    aBytes instanceof Uint8Array &&
    bBytes instanceof Uint8Array &&
    aBytes.length === bBytes.length &&
    aBytes.every((byte, i) => byte === bBytes[i])
  );
}

/** 圧縮方式・圧縮バイトが違う共有ブロックだけ、DB確定の前に内容を照合する。 */
export async function verifySharedBlocks(
  db: WorldDatabase,
  blocks: Block[],
): Promise<Map<string, Block>> {
  const captured = await db.save_blocks.bulkGet(blocks.map((b) => b.blockId));
  const verified = new Map<string, Block>();
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!,
      existing = captured[i];
    if (!existing || sameStoredBlock(existing, block)) continue;
    const { payloadBytes, codec, ...metadata } = existing;
    const { payloadBytes: _bytes, codec: _codec, ...expected } = block;
    ensure(
      canonicalJson(metadata) === canonicalJson(expected) &&
        payloadBytes instanceof Uint8Array &&
        ['none', 'gzip'].includes(codec),
      '既存の保存ブロックが破損しています',
    );
    let raw: Uint8Array;
    try {
      raw = codec === 'gzip' ? await decompress(payloadBytes, existing.rawBytes) : payloadBytes;
    } catch {
      // 圧縮ライブラリの空のTypeErrorではなく、保存を直すための理由を表示する。
      throw new Error('既存の保存ブロックが破損しています');
    }
    ensure(
      raw.length === existing.rawBytes &&
        (await sha256(
          existing.kind +
            ':' +
            existing.schemaVersion +
            ':' +
            new TextDecoder('utf-8', { fatal: true }).decode(raw),
        )) === existing.contentHash,
      '既存の保存ブロックのハッシュが一致しません',
    );
    verified.set(block.blockId, existing);
  }
  return verified;
}

/** 4ストア確定中に再確認。先行検査後の改変・別内容との競合を上書きしない。 */
export async function putSharedBlocks(
  db: WorldDatabase,
  blocks: Block[],
  verified: Map<string, Block>,
) {
  for (const block of blocks) {
    const current = await db.save_blocks.get(block.blockId);
    if (current) {
      const checked = verified.get(block.blockId);
      ensure(
        sameStoredBlock(current, block) || (checked && sameStoredBlock(current, checked)),
        '既存の保存ブロックが変更・破損しています。再試行してください',
      );
    } else await db.save_blocks.add(block);
  }
}
