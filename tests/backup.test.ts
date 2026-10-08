import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DexieWorldStorage, WorldDatabase } from '../src/world/dexie-storage.ts';
import { WorldWorkspace } from '../src/world/workspace.ts';
import {
  createWorld,
  createBullpenWorld,
  advanceWorld,
  completeDay,
  worldPhase,
} from '../src/world/engine.ts';
import { decodeBackup } from '../src/world/backup-package.ts';
import { crc32, readBackupZip, writeBackupZip } from '../src/world/backup-zip.ts';
import { canonicalJson, sha256 } from '../src/storage/codec.ts';
import { decompress } from '../src/world/compression.ts';
import type { WorldRecord } from '../src/world/types.ts';

const encoder = new TextEncoder(),
  decoder = new TextDecoder();
async function database(run: (db: WorldDatabase, storage: DexieWorldStorage) => Promise<void>) {
  const db = new WorldDatabase('backup-' + crypto.randomUUID());
  try {
    await run(db, new DexieWorldStorage(db));
  } finally {
    await db.delete();
  }
}
async function dump(db: WorldDatabase) {
  return {
    local: await db.local_worlds.toArray(),
    slots: await db.save_slots.toArray(),
    snapshots: await db.save_snapshots.toArray(),
    blocks: await db.save_blocks.toArray(),
  };
}
function finishDay(world: WorldRecord) {
  while (worldPhase(world) === 'playing') world = advanceWorld(world, 25);
  return completeDay(world, world.currentDate);
}
// 不正入力を作る試験専用。ハッシュも再計算し、単なるCRCエラーより奥の検査へ到達させる。
async function rewrite(
  bytes: Uint8Array,
  edit: (manifest: any, entries: Map<string, Uint8Array>) => void | Promise<void>,
  rehashSnapshot = false,
) {
  const entries = readBackupZip(bytes);
  const manifest = JSON.parse(decoder.decode(entries.get('manifest.json')));
  await edit(manifest, entries);
  if (rehashSnapshot) {
    const {
      formatVersion: _format,
      payloads: _payloads,
      packageHash: _packageHash,
      manifestHash: _hash,
      ...body
    } = manifest;
    manifest.manifestHash = await sha256(canonicalJson(body));
  }
  const { packageHash: _hash, ...body } = manifest;
  manifest.packageHash = await sha256(canonicalJson(body));
  entries.set('manifest.json', encoder.encode(JSON.stringify(manifest)));
  return writeBackupZip(entries);
}

test('ZIP互換：Pythonで生成したSTORE ZIPを読み、既知CRCと標準ヘッダーで出力する', () => {
  const independent = new Uint8Array(
    readFileSync(new URL('./fixtures/backup-store.zip', import.meta.url)),
  );
  assert.equal(decoder.decode(readBackupZip(independent).get('manifest.json')), '{}\n');
  assert.equal(crc32(encoder.encode('123456789')), 0xcbf43926);
  const file = writeBackupZip(new Map([['manifest.json', encoder.encode('{}\n')]]));
  assert.deepEqual(readBackupZip(file), readBackupZip(independent));
});

test('ZIP境界：切断・サイズ偽装・暗号化・圧縮・CRC不一致・パス不正を拒否する', () => {
  const file = writeBackupZip(new Map([['manifest.json', encoder.encode('{}\n')]]));
  const mutations: ((bytes: Uint8Array, view: DataView, central: number) => void)[] = [
    (_b, v, c) => v.setUint16(c + 8, 1, true),
    (_b, v, c) => v.setUint16(c + 10, 8, true),
    (_b, v, c) => v.setUint32(c + 24, 0xffffffff, true),
    (_b, v, c) => v.setUint32(c + 42, 1, true),
    (b) => {
      b[43] = b[43]! ^ 1;
    },
    (b, _v, c) => {
      b.set(encoder.encode('../ifest.json'), 30);
      b.set(encoder.encode('../ifest.json'), c + 46);
    },
    (_b, v) => v.setUint16(file.length - 12, 65535, true),
  ];
  for (const change of mutations) {
    const bytes = new Uint8Array(file),
      v = new DataView(bytes.buffer);
    change(bytes, v, v.getUint32(bytes.length - 6, true));
    assert.throws(() => readBackupZip(bytes));
  }
  const duplicate = writeBackupZip(
    new Map([
      ['manifest.json', encoder.encode('{}')],
      ['blocks/block-' + '0'.repeat(64) + '.bin', encoder.encode('x')],
      ['blocks/block-' + '1'.repeat(64) + '.bin', encoder.encode('x')],
    ]),
  );
  const directory = new DataView(duplicate.buffer);
  let central = directory.getUint32(duplicate.length - 6, true);
  for (let i = 0; i < 2; i++) central += 46 + directory.getUint16(central + 28, true);
  const local = directory.getUint32(central + 42, true);
  const repeatedName = encoder.encode('blocks/block-' + '0'.repeat(64) + '.bin');
  duplicate.set(repeatedName, central + 46);
  duplicate.set(repeatedName, local + 30);
  assert.throws(() => readBackupZip(duplicate), /重複/);
  assert.throws(() => readBackupZip(file.slice(0, -1)));
  assert.throws(() => writeBackupZip(new Map([['../outside', new Uint8Array(1)]])));
});

test('書き出し：旧版none・現行gzipの途中状態が自己完結し、DB・原状態・乱数を変えない', async () => {
  for (const world of [advanceWorld(createWorld(), 1), advanceWorld(createBullpenWorld(), 1)]) {
    await database(async (db, storage) => {
      await storage.save(world, 1, 'manual', 0);
      const before = await dump(db),
        original = structuredClone(world);
      const bytes = await storage.exportSnapshot('manual');
      assert.deepEqual(bytes, await storage.exportSnapshot('manual'));
      assert.deepEqual((await decodeBackup(bytes)).world, world);
      assert.deepEqual(await dump(db), before);
      assert.deepEqual(world, original);
      await database(async (target, targetStorage) => {
        const id = await targetStorage.importSnapshot(bytes, crypto.randomUUID());
        assert.notEqual(id, 'v02-local');
        const imported = new DexieWorldStorage(target, id);
        assert.deepEqual((await imported.load('manual')).world, world);
        assert.deepEqual(
          advanceWorld((await imported.load('manual')).world, 25),
          advanceWorld(world, 25),
        );
      });
    });
  }
});

test('全保存枠：自動・直前・途中手動をそれぞれファイルへ保持し、元履歴回収後も復元できる', async () => {
  await database(async (db, storage) => {
    const manual = advanceWorld(createBullpenWorld(), 1);
    await storage.save(manual, 0, 'manual', 0);
    const previous = finishDay(manual);
    await storage.save(previous, 1, 'auto', 1);
    const auto = finishDay(previous);
    await storage.save(auto, 2, 'auto', 2);
    const backups = [];
    for (const slot of ['manual', 'previousAuto', 'auto'] as const)
      backups.push(await storage.exportSnapshot(slot));
    await storage.save(createWorld(88), 3, 'manual', 3);
    await storage.save(finishDay(auto), 4, 'auto', 4);
    for (const [index, bytes] of backups.entries())
      assert.deepEqual((await decodeBackup(bytes)).world, [manual, previous, auto][index]);
    assert.equal((await storage.inspectStorage()).candidateBlockIds.length, 0);
    assert((await db.save_snapshots.count()) <= 3);
  });
});

test('不正ファイル：未知版・欠損・超過宣言・ハッシュ・再実行で不正な世界を拒否し4ストアを維持', async () => {
  await database(async (db, storage) => {
    await storage.save(advanceWorld(createWorld(), 1), 1, 'manual', 0);
    const bytes = await storage.exportSnapshot('manual'),
      before = await dump(db);
    const badFiles = [
      bytes.slice(0, -1),
      await rewrite(bytes, (m) => {
        m.formatVersion = 'future';
      }),
      await rewrite(bytes, (m) => {
        m.payloads[0].codec = 'future';
      }),
      await rewrite(bytes, (m) => {
        m.blockRefs[0].rawBytes = 16 * 1024 * 1024 + 1;
      }),
      await rewrite(bytes, (m, e) => {
        e.delete('blocks/' + m.blockRefs[0].blockId + '.bin');
      }),
      await rewrite(bytes, (m) => {
        m.manifestHash = '0'.repeat(64);
      }),
      await rewrite(
        bytes,
        async (m, e) => {
          const i = m.blockRefs.findIndex((r: any) => r.logicalKey === 'world'),
            ref = m.blockRefs[i];
          const oldPath = 'blocks/' + ref.blockId + '.bin';
          const core = JSON.parse(decoder.decode(e.get(oldPath)));
          core.dayPlan.cursor = 999;
          const text = canonicalJson(core),
            raw = encoder.encode(text);
          ref.contentHash = await sha256(ref.kind + ':' + ref.schemaVersion + ':' + text);
          ref.blockId = 'block-' + ref.contentHash;
          ref.rawBytes = raw.length;
          m.payloads[i] = { blockId: ref.blockId, codec: 'none', bytes: raw.length };
          e.delete(oldPath);
          e.set('blocks/' + ref.blockId + '.bin', raw);
        },
        true,
      ),
    ];
    for (const file of badFiles) {
      await assert.rejects(storage.importSnapshot(file, crypto.randomUUID()));
      assert.deepEqual(await dump(db), before);
    }
  });
});

test('別プレイ：同じ世界IDの取り込みを上書きせず、再送・保存・GC・再接続でも元と複製を保持', async () => {
  await database(async (db, storage) => {
    const world = advanceWorld(createWorld(), 1);
    await storage.save(world, 1, 'manual', 0);
    const bytes = await storage.exportSnapshot('manual'),
      requestId = crypto.randomUUID();
    const id = await storage.importSnapshot(bytes, requestId);
    const imported = new DexieWorldStorage(db, id);
    const next = advanceWorld(world, 25);
    await imported.save(next, 2, 'manual', 1);
    assert.equal(await storage.importSnapshot(bytes, requestId), id);
    assert.deepEqual((await imported.load('manual')).world, next);
    assert.deepEqual((await storage.load('manual')).world, world);
    const plays = await storage.listPlays();
    assert.equal(plays.length, 2);
    assert(plays.find((p) => p.localWorldId === id)!.label.includes('取り込み'));
    await storage.save(createWorld(99), 2, 'manual', 1);
    assert.deepEqual((await imported.load('manual')).world, next);
    assert.equal((await storage.inspectStorage()).candidateBlockIds.length, 0);
    const connection = new WorldDatabase(db.name);
    try {
      assert.deepEqual((await new DexieWorldStorage(connection, id).load('manual')).world, next);
    } finally {
      connection.close();
    }
  });
});

test('取込失敗：途中の枠追加失敗は4ストアを戻し、同じ指示の再試行は一度だけ確定', async () => {
  await database(async (_source, source) => {
    await source.save(createWorld(), 0, 'manual', 0);
    const bytes = await source.exportSnapshot('manual');
    await database(async (db, storage) => {
      await storage.save(createWorld(99), 0, 'manual', 0);
      const before = await dump(db),
        requestId = crypto.randomUUID();
      const fail = () => {
        throw new Error('injected import failure');
      };
      db.save_slots.hook('creating', fail);
      await assert.rejects(storage.importSnapshot(bytes, requestId), /import failure/);
      db.save_slots.hook('creating').unsubscribe(fail);
      assert.deepEqual(await dump(db), before);
      const id = await storage.importSnapshot(bytes, requestId);
      assert.equal(await storage.importSnapshot(bytes, requestId), id);
      assert.equal(await db.local_worlds.count(), 2);
      const other = await storage.exportSnapshot('manual'),
        after = await dump(db);
      await assert.rejects(storage.importSnapshot(other, requestId), /指示ID/);
      assert.deepEqual(await dump(db), after);
    });
  });
});

test('保存ID衝突：同じsnapshotIdの別内容を上書きせず、共有ブロック追加も取り消す', async () => {
  await database(async (db, storage) => {
    await storage.save(createWorld(1), 0, 'manual', 0);
    const original = await storage.exportSnapshot('manual');
    await database(async (_other, second) => {
      await second.save(createWorld(2), 0, 'manual', 0);
      const id = (await decodeBackup(original)).snapshot.snapshotId;
      const conflict = await rewrite(
        await second.exportSnapshot('manual'),
        (m) => {
          m.snapshotId = id;
        },
        true,
      );
      const before = await dump(db);
      await assert.rejects(storage.importSnapshot(conflict, crypto.randomUUID()), /保存ID/);
      assert.deepEqual(await dump(db), before);
    });
  });
});

test('圧縮互換：gzipとnoneで内容が同じなら共有し、none取り込み後も通常保存とGCを継続', async () => {
  await database(async (db, storage) => {
    const world = advanceWorld(createBullpenWorld(), 1);
    await storage.save(world, 0, 'manual', 0);
    const compressed = await storage.exportSnapshot('manual');
    const plain = await rewrite(compressed, async (m, e) => {
      for (let i = 0; i < m.blockRefs.length; i++) {
        const r = m.blockRefs[i],
          p = 'blocks/' + r.blockId + '.bin';
        const raw = await decompress(e.get(p)!, r.rawBytes);
        e.set(p, raw);
        m.payloads[i] = { blockId: r.blockId, codec: 'none', bytes: raw.length };
      }
    });
    const before = await db.save_blocks.toArray();
    await storage.importSnapshot(plain, crypto.randomUUID());
    assert.deepEqual(await db.save_blocks.toArray(), before);
    await database(async (target, receiver) => {
      const id = await receiver.importSnapshot(plain, crypto.randomUUID()),
        imported = new DexieWorldStorage(target, id);
      await imported.save(world, 1, 'manual', 1);
      assert.deepEqual((await imported.load('manual')).world, world);
      await receiver.importSnapshot(compressed, crypto.randomUUID());
      assert.equal(await target.local_worlds.count(), 2);
      assert.deepEqual((await imported.load('manual')).world, world);
    });
  });
});

test('競合：別接続の保存回収と取り込み・書き出しを直列化し、各保存を完全復元', async () => {
  await database(async (db, storage) => {
    const original = createWorld(1),
      next = createWorld(2);
    await storage.save(original, 0, 'manual', 0);
    const bytes = await storage.exportSnapshot('manual'),
      connection = new WorldDatabase(db.name);
    try {
      const other = new DexieWorldStorage(connection);
      const [id, file] = await Promise.all([
        storage.importSnapshot(bytes, crypto.randomUUID()),
        storage.exportSnapshot('manual'),
        other.save(next, 1, 'manual', 1),
      ]);
      assert.deepEqual((await new DexieWorldStorage(db, id).load('manual')).world, original);
      assert.deepEqual((await storage.load('manual')).world, next);
      assert([1, 2].includes((await decodeBackup(file)).world.seed));
      assert.equal((await storage.inspectStorage()).candidateBlockIds.length, 0);
    } finally {
      connection.close();
    }
  });
});

test('Worker境界：未保存の取込は正本を変えず、切替時は保存を要求し、古い指示を拒否', async () => {
  await database(async (db, storage) => {
    await storage.save(createWorld(123), 0, 'manual', 0);
    const file = await storage.exportSnapshot('manual');
    const workspace = new WorldWorkspace(db);
    await workspace.initialize();
    const context = (view: { localWorldId: string; revision: number }) => ({
      localWorldId: view.localWorldId,
      expectedStateRevision: view.revision,
    });
    let result = await workspace.handle({ kind: 'query' });
    result = await workspace.handle({
      kind: 'advance',
      count: 1,
      commandId: crypto.randomUUID(),
      ...context(result.view),
    });
    const before = result.view;
    result = await workspace.handle({
      kind: 'importSnapshot',
      bytes: file,
      requestId: crypto.randomUUID(),
      ...context(before),
    });
    assert(result.ok);
    assert.deepEqual(result.view, before);
    const id = result.importedLocalWorldId!;
    result = await workspace.handle({
      kind: 'openPlay',
      targetLocalWorldId: id,
      slot: 'manual',
      ...context(result.view),
    });
    assert.equal(result.ok, false);
    assert.deepEqual(result.view, before);
    result = await workspace.handle({
      kind: 'save',
      commandId: crypto.randomUUID(),
      ...context(result.view),
    });
    assert(result.ok);
    const saved = result.view;
    result = await workspace.handle({
      kind: 'openPlay',
      targetLocalWorldId: id,
      slot: 'manual',
      ...context(saved),
    });
    assert(result.ok);
    assert.equal(result.view.seed, 123);
    assert.equal(result.view.unsavedChanges, false);
    result = await workspace.handle({
      kind: 'openPlay',
      targetLocalWorldId: 'v02-local',
      slot: 'manual',
      ...context(result.view),
    });
    assert(result.ok);
    assert(result.view.revision > saved.revision);
    assert.equal(result.view.seed, saved.seed);
    result = await workspace.handle({
      kind: 'advance',
      count: 1,
      commandId: crypto.randomUUID(),
      ...context(before),
    });
    assert.equal(result.ok, false);
    const after = result.view;
    result = await workspace.handle({
      kind: 'openPlay',
      targetLocalWorldId: 'missing',
      slot: 'manual',
      ...context(after),
    });
    assert.equal(result.ok, false);
    assert.deepEqual(result.view, after);
  });
});

test('一覧障害：取込確定後の一覧読取失敗を取込失敗と誤表示せず、再取得できる', async () => {
  await database(async (db, storage) => {
    await storage.save(createWorld(), 0, 'manual', 0);
    const bytes = await storage.exportSnapshot('manual');
    const workspace = new WorldWorkspace(db);
    await workspace.initialize();
    const before = (await workspace.handle({ kind: 'query' })).view;
    const original = db.local_worlds.toArray;
    db.local_worlds.toArray = () => {
      throw new Error('list unavailable');
    };
    const result = await workspace.handle({
      kind: 'importSnapshot',
      bytes,
      requestId: crypto.randomUUID(),
      localWorldId: before.localWorldId,
      expectedStateRevision: before.revision,
    });
    db.local_worlds.toArray = original;
    assert(result.ok);
    assert(result.playListError);
    assert(result.importedLocalWorldId);
    assert.deepEqual(result.view, before);
    const refreshed = await workspace.handle({ kind: 'query' });
    assert.equal(refreshed.playListError, undefined);
    assert.equal(refreshed.plays.length, 2);
  });
});

test('Worker再送：直近の同じ指示には当時の応答を返し、世界を二重に進めない', async () => {
  await database(async (db) => {
    const workspace = new WorldWorkspace(db);
    await workspace.initialize();
    const command = {
      kind: 'advance' as const,
      count: 1,
      commandId: crypto.randomUUID(),
      localWorldId: 'v02-local',
      expectedStateRevision: 0,
    };
    const first = await workspace.handle(command);
    assert(first.ok);
    const second = await workspace.handle({
      ...command,
      commandId: crypto.randomUUID(),
      expectedStateRevision: first.view.revision,
    });
    assert(second.ok);
    assert.deepEqual((await workspace.handle(command)).view, first.view);
    assert.deepEqual((await workspace.handle({ kind: 'query' })).view, second.view);
  });
});

test('ファイル取込：IndexedDBの各ブロックにZIP全体のバッファを複製しない', async () => {
  await database(async (_source, storage) => {
    await storage.save(createBullpenWorld(), 0, 'manual', 0);
    const file = await storage.exportSnapshot('manual');
    await database(async (target, receiver) => {
      const id = await receiver.importSnapshot(file, crypto.randomUUID());
      const blocks = await target.save_blocks.toArray();
      assert(blocks.length > 1);
      const payloadBytes = blocks.reduce((sum, block) => sum + block.payloadBytes.byteLength, 0);
      const allocatedBytes = blocks.reduce(
        (sum, block) => sum + block.payloadBytes.buffer.byteLength,
        0,
      );
      assert.equal(allocatedBytes, payloadBytes, '保存時の複製は各ブロックの必要なバイトだけ');
      assert.deepEqual(
        (await new DexieWorldStorage(target, id).load('manual')).world,
        createBullpenWorld(),
      );
    });
  });
});
