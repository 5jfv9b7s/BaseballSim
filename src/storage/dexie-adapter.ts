import { Dexie } from 'dexie';
import type { Table } from 'dexie';
import type { GameRecord } from '../game/types.ts';
import { ensure, integer } from '../engine/validation.ts';
import {
  canonicalJson,
  definitionsFor,
  MAX_SAVE_BYTES,
  sha256,
  validateCompletedRecord,
  versionsFor,
} from './codec.ts';
import { gameModel } from '../game/model-registry.ts';
import type { LoadedGame, SaveSlotInfo, StorageAdapter } from './adapter.ts';

const LOCAL_WORLD = 'v01-local';
const WORLD = 'v01-fictional-world';
const SLOT_KEY: [string, string, number] = [LOCAL_WORLD, 'manual', 1];
interface LocalWorld {
  localWorldId: string;
  worldId: string;
  name: string;
  selectedSnapshotId: string;
  storageRevision: number;
  updatedAt: string;
  protectedReferences: string[];
}
interface Slot {
  localWorldId: string;
  slotKind: string;
  slotNo: number;
  snapshotId: string;
  updatedAt: string;
  label: string;
}
interface BlockRef {
  logicalKey: string;
  blockId: string;
  kind: string;
  schemaVersion: string;
  contentHash: string;
  rawBytes: number;
}
interface Snapshot {
  snapshotId: string;
  worldId: string;
  parentSnapshotId: string | null;
  createdAt: string;
  gameDate: string;
  stateRevision: number;
  saveKind: 'manual';
  versions: ReturnType<typeof versionsFor>;
  blockRefs: BlockRef[];
  manifestHash: string;
}
interface Block {
  blockId: string;
  kind: string;
  schemaVersion: string;
  codec: 'none';
  rawBytes: number;
  storedBytes: number;
  contentHash: string;
  payloadBytes: Uint8Array;
}

export class GameDatabase extends Dexie {
  local_worlds!: Table<LocalWorld, string>;
  save_slots!: Table<Slot, [string, string, number]>;
  save_snapshots!: Table<Snapshot, string>;
  save_blocks!: Table<Block, string>;

  constructor(name = 'BaseballSim-v01-results') {
    super(name);
    this.version(1).stores({
      local_worlds: '&localWorldId, worldId, updatedAt',
      save_slots: '&[localWorldId+slotKind+slotNo], localWorldId, snapshotId',
      save_snapshots: '&snapshotId, worldId, createdAt',
      save_blocks: '&blockId, [kind+schemaVersion]',
    });
  }
}

export class DexieStorageAdapter implements StorageAdapter {
  readonly database: GameDatabase;
  constructor(database = new GameDatabase()) {
    this.database = database;
  }

  async listSlots(): Promise<SaveSlotInfo> {
    const db = this.database;
    return db.transaction('r', db.local_worlds, db.save_slots, db.save_snapshots, async () => {
      const world = await db.local_worlds.get(LOCAL_WORLD);
      const slot = await db.save_slots.get(SLOT_KEY);
      const snapshot = slot ? await db.save_snapshots.get(slot.snapshotId) : undefined;
      return {
        snapshotId: slot?.snapshotId ?? null,
        previousSnapshotId: snapshot?.parentSnapshotId ?? null,
        storageRevision: world?.storageRevision ?? 0,
        updatedAt: slot?.updatedAt ?? null,
      };
    });
  }

  async commitSnapshot(record: GameRecord, expectedStorageRevision: number): Promise<SaveSlotInfo> {
    integer(expectedStorageRevision, 0, Number.MAX_SAFE_INTEGER - 1, '保存世代');
    validateCompletedRecord(record);
    const version = gameModel(record.state.simulationVersion).version;
    const versions = versionsFor(version);
    const db = this.database;
    // ハッシュ・直列化はIndexedDBトランザクションの外で完了させる。
    const blocks: Block[] = [];
    const refs: BlockRef[] = [];
    for (const [kind, value] of [
      ['definitions', definitionsFor(version, record.state.config, record.state.errorConfig)],
      ['game', record],
    ] as const) {
      const text = canonicalJson(value);
      const payloadBytes = new TextEncoder().encode(text);
      const schemaVersion = versions.dataSchemaVersion;
      const contentHash = await sha256(kind + ':' + schemaVersion + ':' + text);
      const blockId = 'block-' + contentHash;
      blocks.push({
        blockId,
        kind,
        schemaVersion,
        codec: 'none',
        rawBytes: payloadBytes.byteLength,
        storedBytes: payloadBytes.byteLength,
        contentHash,
        payloadBytes,
      });
      refs.push({
        logicalKey: kind,
        blockId,
        kind,
        schemaVersion,
        contentHash,
        rawBytes: payloadBytes.byteLength,
      });
    }
    const previous = await this.listSlots();
    const snapshotId = crypto.randomUUID(); // 保存ID専用。試合用乱数ではない。
    const createdAt = new Date().toISOString(); // 保存操作時刻だけに使用。
    const manifest = {
      snapshotId,
      worldId: WORLD,
      parentSnapshotId: previous.snapshotId,
      createdAt,
      gameDate: '2026-09-23',
      stateRevision: record.state.nextEventSeq - 1,
      saveKind: 'manual' as const,
      versions,
      blockRefs: refs,
    };
    const snapshot: Snapshot = { ...manifest, manifestHash: await sha256(canonicalJson(manifest)) };

    return db.transaction(
      'rw',
      db.local_worlds,
      db.save_slots,
      db.save_snapshots,
      db.save_blocks,
      async () => {
        const world = await db.local_worlds.get(LOCAL_WORLD);
        ensure(
          (world?.storageRevision ?? 0) === expectedStorageRevision,
          '別タブで保存が更新されました。読み込み直して確認してください',
        );
        const slot = await db.save_slots.get(SLOT_KEY);
        ensure((slot?.snapshotId ?? null) === previous.snapshotId, '保存先が変更されました');
        for (const block of blocks) {
          const existing = await db.save_blocks.get(block.blockId);
          if (existing) {
            ensure(
              existing.contentHash === block.contentHash &&
                existing.codec === block.codec &&
                existing.rawBytes === block.rawBytes &&
                existing.payloadBytes.length === block.payloadBytes.length &&
                existing.payloadBytes.every((byte, i) => byte === block.payloadBytes[i]),
              '既存の保存ブロックが破損しています',
            );
          } else await db.save_blocks.add(block);
        }
        await db.save_snapshots.add(snapshot);
        await db.save_slots.put({
          localWorldId: LOCAL_WORLD,
          slotKind: 'manual',
          slotNo: 1,
          snapshotId,
          updatedAt: createdAt,
          label: 'v0.1 終了試合',
        });
        await db.local_worlds.put({
          localWorldId: LOCAL_WORLD,
          worldId: WORLD,
          name: 'v0.1 架空2球団',
          selectedSnapshotId: snapshotId,
          storageRevision: expectedStorageRevision + 1,
          updatedAt: createdAt,
          protectedReferences: [],
        });
        // 全4ストアを1トランザクションで確定。途中失敗はブロックも含めロールバック。
        return {
          snapshotId,
          previousSnapshotId: previous.snapshotId,
          storageRevision: expectedStorageRevision + 1,
          updatedAt: createdAt,
        };
      },
    );
  }

  async loadSnapshot(previous = false): Promise<LoadedGame> {
    const db = this.database;
    const data = await db.transaction(
      'r',
      db.local_worlds,
      db.save_slots,
      db.save_snapshots,
      db.save_blocks,
      async () => {
        const world = await db.local_worlds.get(LOCAL_WORLD);
        const slot = await db.save_slots.get(SLOT_KEY);
        ensure(world && slot, '保存した試合がありません');
        let snapshot = await db.save_snapshots.get(slot.snapshotId);
        ensure(snapshot, '保存マニフェストがありません');
        if (previous) {
          ensure(snapshot.parentSnapshotId, '前の保存はありません');
          snapshot = await db.save_snapshots.get(snapshot.parentSnapshotId);
          ensure(snapshot, '前の保存マニフェストがありません');
        }
        ensure(
          Array.isArray(snapshot.blockRefs) && snapshot.blockRefs.length === 2,
          '保存の参照数が不正です',
        );
        const blocks = await Promise.all(
          snapshot.blockRefs.map((ref) => db.save_blocks.get(ref.blockId)),
        );
        return { world, snapshot, blocks };
      },
    );
    const { snapshot, blocks } = data;
    const { manifestHash, ...manifest } = snapshot;
    const version = gameModel(snapshot.versions.simulationVersion).version;
    const versions = versionsFor(version);
    ensure(
      snapshot.worldId === WORLD && canonicalJson(snapshot.versions) === canonicalJson(versions),
      '未対応の保存形式・モデル版です',
    );
    ensure(
      (await sha256(canonicalJson(manifest))) === manifestHash,
      '保存マニフェストが破損しています',
    );
    const payloads: Record<string, unknown> = {};
    for (const [i, ref] of snapshot.blockRefs.entries()) {
      ensure(
        ref.logicalKey === ref.kind && ['definitions', 'game'].includes(ref.logicalKey),
        '未対応の保存キーです',
      );
      const block = blocks[i];
      ensure(
        block &&
          block.codec === 'none' &&
          block.kind === ref.kind &&
          block.schemaVersion === ref.schemaVersion &&
          ref.schemaVersion === versions.dataSchemaVersion,
        '保存ブロックが不正です',
      );
      ensure(
        ref.rawBytes <= MAX_SAVE_BYTES &&
          ref.rawBytes === block.payloadBytes.byteLength &&
          block.rawBytes === ref.rawBytes &&
          block.storedBytes === ref.rawBytes,
        '保存サイズが不正です',
      );
      const text = new TextDecoder('utf-8', { fatal: true }).decode(block.payloadBytes);
      const hash = await sha256(block.kind + ':' + block.schemaVersion + ':' + text);
      ensure(
        hash === block.contentHash && hash === ref.contentHash,
        '保存ブロックが破損しています',
      );
      ensure(!Object.hasOwn(payloads, ref.logicalKey), '保存キーが重複しています');
      payloads[ref.logicalKey] = JSON.parse(text);
    }
    validateCompletedRecord(payloads.game);
    const record = payloads.game;
    ensure(
      canonicalJson(payloads.definitions) ===
        canonicalJson(definitionsFor(version, record.state.config, record.state.errorConfig)),
      'モデル定義が一致しません',
    );
    ensure(
      gameModel(payloads.game.state.simulationVersion).version === version,
      '保存の版と試合の版が一致しません',
    );
    ensure(
      snapshot.stateRevision === payloads.game.state.nextEventSeq - 1,
      '保存時点が一致しません',
    );
    return {
      record: payloads.game,
      storageRevision: data.world.storageRevision,
      snapshotId: snapshot.snapshotId,
    };
  }
}
