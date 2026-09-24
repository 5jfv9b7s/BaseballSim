import { ensure } from '../engine/validation.ts';

/** 圧縮・展開はIndexedDBトランザクションの外で行う。 */
export async function compress(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([new Uint8Array(bytes)])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** 壊れた圧縮データでも宣言容量を超えて展開しない。 */
export async function decompress(bytes: Uint8Array, expectedBytes: number): Promise<Uint8Array> {
  ensure(
    Number.isSafeInteger(expectedBytes) && expectedBytes >= 0 && expectedBytes <= 16 * 1024 * 1024,
    '展開するブロック容量が不正です',
  );
  const reader = new Blob([new Uint8Array(bytes)])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'))
    .getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      ensure(size <= expectedBytes, '保存ブロックの展開容量を超えました');
      chunks.push(value);
    }
    ensure(size === expectedBytes, '保存ブロックの展開容量が一致しません');
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
