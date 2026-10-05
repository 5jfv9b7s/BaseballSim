import { ensure } from '../engine/validation.ts';

export const MAX_PACKAGE_BYTES = 66 * 1024 * 1024;
const MAX_ENTRIES = 260;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255]!;
  return (crc ^ 0xffffffff) >>> 0;
}
function allowedName(name: string): boolean {
  return name === 'manifest.json' || /^blocks\/block-[a-f0-9]{64}\.bin$/.test(name);
}

/** .bssave v1用の限定ZIP。内部ブロックは既にgzipなのでZIPはSTOREのみ。 */
export function writeBackupZip(entries: Map<string, Uint8Array>): Uint8Array {
  ensure(entries.size > 0 && entries.size <= MAX_ENTRIES, '保存ファイルの件数が不正です');
  const files = [...entries].map(([name, payload]) => {
    ensure(allowedName(name), '保存ファイルに許可されていないパスがあります');
    return { name: encoder.encode(name), payload, crc: crc32(payload) };
  });
  const localSize = files.reduce((n, f) => n + 30 + f.name.length + f.payload.length, 0);
  const centralSize = files.reduce((n, f) => n + 46 + f.name.length, 0);
  ensure(localSize + centralSize + 22 <= MAX_PACKAGE_BYTES, '保存ファイルの容量上限を超えました');
  const bytes = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(bytes.buffer);
  const u16 = (p: number, v: number) => view.setUint16(p, v, true);
  const u32 = (p: number, v: number) => view.setUint32(p, v, true);
  let offset = 0,
    central = localSize;
  for (const f of files) {
    u32(offset, 0x04034b50);
    u16(offset + 4, 20);
    u16(offset + 6, 0x800);
    u16(offset + 12, 0x21); // ZIP日時は固定。ゲームの乱数・時間と分離する。
    u32(offset + 14, f.crc);
    u32(offset + 18, f.payload.length);
    u32(offset + 22, f.payload.length);
    u16(offset + 26, f.name.length);
    bytes.set(f.name, offset + 30);
    bytes.set(f.payload, offset + 30 + f.name.length);
    u32(central, 0x02014b50);
    u16(central + 4, 20);
    u16(central + 6, 20);
    u16(central + 8, 0x800);
    u16(central + 14, 0x21);
    u32(central + 16, f.crc);
    u32(central + 20, f.payload.length);
    u32(central + 24, f.payload.length);
    u16(central + 28, f.name.length);
    u32(central + 42, offset);
    bytes.set(f.name, central + 46);
    offset += 30 + f.name.length + f.payload.length;
    central += 46 + f.name.length;
  }
  u32(central, 0x06054b50);
  u16(central + 8, files.length);
  u16(central + 10, files.length);
  u32(central + 12, centralSize);
  u32(central + 16, localSize);
  return bytes;
}

/** ファイルへ展開せず、許可した名前のバイト列だけ返す。ZIP64等は版追加まで拒否する。 */
export function readBackupZip(bytes: Uint8Array): Map<string, Uint8Array> {
  ensure(
    bytes instanceof Uint8Array && bytes.length >= 22 && bytes.length <= MAX_PACKAGE_BYTES,
    '保存ファイルの容量が不正です',
  );
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const span = (p: number, n: number) =>
    ensure(Number.isSafeInteger(p) && p >= 0 && p + n <= bytes.length, 'ZIPが切断されています');
  const u16 = (p: number) => {
    span(p, 2);
    return view.getUint16(p, true);
  };
  const u32 = (p: number) => {
    span(p, 4);
    return view.getUint32(p, true);
  };
  const end = bytes.length - 22;
  ensure(
    u32(end) === 0x06054b50 && u16(end + 4) === 0 && u16(end + 6) === 0 && u16(end + 20) === 0,
    '未対応または破損したZIPです',
  );
  const count = u16(end + 10),
    centralStart = u32(end + 16);
  ensure(
    count > 0 &&
      count <= MAX_ENTRIES &&
      u16(end + 8) === count &&
      centralStart + u32(end + 12) === end,
    'ZIPの目録が不正です',
  );
  const entries = new Map<string, Uint8Array>();
  let central = centralStart,
    nextLocal = 0;
  for (let index = 0; index < count; index++) {
    span(central, 46);
    ensure(
      u32(central) === 0x02014b50 &&
        [10, 20].includes(u16(central + 6)) &&
        [0, 0x800].includes(u16(central + 8)) &&
        u16(central + 10) === 0,
      'ZIPの圧縮・暗号化方式は未対応です',
    );
    const nameSize = u16(central + 28),
      size = u32(central + 20),
      local = u32(central + 42);
    ensure(
      u32(central + 24) === size &&
        u16(central + 30) === 0 &&
        u16(central + 32) === 0 &&
        u16(central + 34) === 0 &&
        local === nextLocal,
      'ZIPの参照・追加情報が不正です',
    );
    ensure(
      central + 46 + nameSize <= end && local + 30 + nameSize + size <= centralStart,
      'ZIPの領域が重複または切断されています',
    );
    const name = decoder.decode(bytes.subarray(central + 46, central + 46 + nameSize));
    ensure(allowedName(name) && !entries.has(name), 'ZIPのパスが不正または重複しています');
    ensure(
      u32(local) === 0x04034b50 &&
        u16(local + 4) === u16(central + 6) &&
        u16(local + 6) === u16(central + 8) &&
        u16(local + 8) === 0 &&
        u32(local + 10) === u32(central + 12) &&
        u32(local + 14) === u32(central + 16) &&
        u32(local + 18) === size &&
        u32(local + 22) === size &&
        u16(local + 26) === nameSize &&
        u16(local + 28) === 0,
      'ZIPのヘッダーが一致しません',
    );
    ensure(
      decoder.decode(bytes.subarray(local + 30, local + 30 + nameSize)) === name,
      'ZIPの名前が一致しません',
    );
    const payload = bytes.subarray(local + 30 + nameSize, local + 30 + nameSize + size);
    ensure(crc32(payload) === u32(central + 16), 'ZIPのCRCが一致しません');
    entries.set(name, payload);
    nextLocal = local + 30 + nameSize + size;
    central += 46 + nameSize;
  }
  ensure(central === end && nextLocal === centralStart, 'ZIPに余分な領域があります');
  return entries;
}
