import { verifySharedBlocks, putSharedBlocks } from './shared-blocks.ts';
import { exportStoredPlay, importStoredPlay, listStoredPlays } from './backup-storage.ts';
import { collectUnusedInTransaction } from './storage-gc.ts';
import { inspectWorldStorage } from './storage-inspection.ts';
import { canEditManagement } from './management.ts';
import { Dexie, type Table } from 'dexie';
import { ensure, integer } from '../engine/validation.ts';
import { canonicalJson, definitionsFor, sha256 } from '../storage/codec.ts';
import { WorldValidator } from './validation.ts';
import { compress } from './compression.ts';
import { decodeWorldSnapshot, validateSnapshot } from './snapshot-codec.ts';
import {
  formatFor,
  MAX_BYTES,
  MAX_ANNUAL_RAW_BYTES,
  type LocalWorld,
  type Slot,
  type Block,
  type Snapshot,
} from './save-format.ts';
import type { GameRecord } from '../game/types.ts';
import {
  emptyWorldSlots,
  type WorldSlotKind,
  type WorldSlots,
  type WorldStorageAdapter,
} from './storage.ts';
import type { WorldRecord } from './types.ts';

export const WORLD_DATABASE_NAME = 'BaseballSim-v02-worlds';
export const DEFAULT_LOCAL_WORLD = 'v02-local';
export class WorldDatabase extends Dexie {
  local_worlds!: Table<LocalWorld, string>;
  save_slots!: Table<Slot, [string, string, number]>;
  save_snapshots!: Table<Snapshot, string>;
  save_blocks!: Table<Block, string>;

  constructor(name = WORLD_DATABASE_NAME) {
    super(name);
    this.version(1).stores({
      local_worlds: '&localWorldId, worldId, updatedAt',
      save_slots: '&[localWorldId+slotKind+slotNo], localWorldId, snapshotId',
      save_snapshots: '&snapshotId, worldId, createdAt',
      save_blocks: '&blockId, [kind+schemaVersion]',
    });
  }
}

/** v0.1の終了試合保存とは別名前空間。4ストアの一括確定を継承する。 */
export class DexieWorldStorage implements WorldStorageAdapter {
  readonly database: WorldDatabase;
  private validator: WorldValidator = new WorldValidator();
  private gameBlocks = new WeakMap<GameRecord, Block>();

  readonly localWorldId: string;

  constructor(database = new WorldDatabase(), localWorldId = DEFAULT_LOCAL_WORLD) {
    this.database = database;
    this.localWorldId = localWorldId;
  }

  private slotKey(kind: WorldSlotKind): [string, string, number] {
    return [this.localWorldId, kind, 1];
  }

  private async readSlots(): Promise<WorldSlots> {
    const slots = emptyWorldSlots();
    slots.storageRevision =
      (await this.database.local_worlds.get(this.localWorldId))?.storageRevision ?? 0;
    for (const kind of ['auto', 'previousAuto', 'manual'] as const) {
      const row = await this.database.save_slots.get(this.slotKey(kind));
      if (row)
        slots[kind] = {
          snapshotId: row.snapshotId,
          gameDate: row.gameDate,
          updatedAt: row.updatedAt,
        };
    }
    return slots;
  }

  async listSlots(): Promise<WorldSlots> {
    const db = this.database;
    return db.transaction('r', db.local_worlds, db.save_slots, () => this.readSlots());
  }

  async exportSnapshot(kind: WorldSlotKind) {
    return exportStoredPlay(this.database, this.localWorldId, kind);
  }

  async importSnapshot(bytes: Uint8Array, requestId: string) {
    return importStoredPlay(this.database, bytes, requestId);
  }

  async listPlays() {
    return listStoredPlays(this.database);
  }

  async inspectStorage() {
    return inspectWorldStorage(this.database);
  }

  async save(
    world: WorldRecord,
    stateRevision: number,
    kind: 'auto' | 'manual' | 'action',
    expectedStorageRevision: number,
  ): Promise<WorldSlots> {
    ensure(['auto', 'manual', 'action'].includes(kind), '保存枠が不正です');
    const slotKind = kind === 'manual' ? 'manual' : 'auto';
    const format = formatFor(world.version);
    integer(stateRevision, 0, Number.MAX_SAFE_INTEGER, '状態版');
    integer(expectedStorageRevision, 0, Number.MAX_SAFE_INTEGER - 1, '保存世代');
    this.validator.validate(world);
    if (kind === 'action') ensure(canEditManagement(world), '編成自動保存は試合開始前だけ可能です');
    if (kind === 'auto') {
      ensure(
        world.lastCompletedDate !== null &&
          world.dayPlan.cursor === 0 &&
          world.dayPlan.gameIds.every((id) => !world.games[id]),
        '自動保存は日次完了直後だけ可能です',
      );
    }

    const { definitions, games, stats, contributions, statApplicationMarkers, ...core } = world;
    const values: [string, string, unknown][] = [
      [
        'definitions',
        'definitions',
        {
          world: definitions,
          engine: definitionsFor(
            'game-prototype-v10',
            definitions.matchConfig,
            definitions.errorConfig,
          ),
        },
      ],
      ['world', 'world', core],
      ['stats', 'stats', { stats, contributions, statApplicationMarkers }],
      ...Object.entries(games).map(([gameId, game]): [string, string, unknown] => [
        'game/' + gameId,
        'game',
        game,
      ]),
    ];
    const blocks: Block[] = [];
    let bytes = 0;
    let storedBytes = 0;
    for (const [logicalKey, blockKind, value] of values) {
      const cached = blockKind === 'game' ? this.gameBlocks.get(value as GameRecord) : undefined;
      if (cached?.schemaVersion === format && cached.logicalKey === logicalKey) {
        bytes += cached.rawBytes;
        storedBytes += cached.payloadBytes.length;
        ensure(
          bytes <= ('seasonSummary' in world ? MAX_ANNUAL_RAW_BYTES : MAX_BYTES) &&
            storedBytes <= MAX_BYTES,
          '年間保存の容量上限を超えました',
        );
        blocks.push(cached);
        continue;
      }
      const text = canonicalJson(value);
      const raw = new TextEncoder().encode(text);
      bytes += raw.length;
      const compressed = 'seasonSummary' in world;
      ensure(!compressed || raw.length <= 16 * 1024 * 1024, '保存ブロックが16MiBを超えました');
      ensure(
        bytes <= (compressed ? MAX_ANNUAL_RAW_BYTES : MAX_BYTES),
        '保存の展開容量上限を超えました',
      );
      const payloadBytes = compressed ? await compress(raw) : raw;
      storedBytes += payloadBytes.length;
      ensure(storedBytes <= MAX_BYTES, '試作の保存上限64MiBを超えました');
      const contentHash = await sha256(blockKind + ':' + format + ':' + text);
      const block: Block = {
        logicalKey,
        kind: blockKind,
        blockId: 'block-' + contentHash,
        schemaVersion: format,
        contentHash,
        rawBytes: raw.length,
        codec: compressed ? 'gzip' : 'none',
        payloadBytes,
      };
      blocks.push(block);
      if (blockKind === 'game' && Object.isFrozen(value))
        this.gameBlocks.set(value as GameRecord, block);
    }

    const verified = await verifySharedBlocks(this.database, blocks);
    const previous = await this.listSlots();
    const manifest: Omit<Snapshot, 'manifestHash'> = {
      snapshotId: crypto.randomUUID(),
      worldId: world.worldId,
      parentSnapshotId: previous[slotKind]?.snapshotId ?? null,
      createdAt: new Date().toISOString(),
      gameDate: world.currentDate,
      stateRevision,
      saveKind: kind === 'auto' ? 'dailyAuto' : kind === 'action' ? 'actionAuto' : 'manual',
      versions: { saveFormatVersion: format, simulationVersion: world.version },
      blockRefs: blocks.map(({ payloadBytes: _bytes, codec: _codec, ...ref }) => ref),
    };
    const snapshot: Snapshot = { ...manifest, manifestHash: await sha256(canonicalJson(manifest)) };
    const db = this.database;

    return db.transaction(
      'rw',
      db.local_worlds,
      db.save_slots,
      db.save_snapshots,
      db.save_blocks,
      async () => {
        const current = await this.readSlots();
        ensure(
          current.storageRevision === expectedStorageRevision &&
            current.storageRevision === previous.storageRevision,
          '別タブで保存が更新されました。保存を読み込み直してください',
        );
        await putSharedBlocks(db, blocks, verified);
        await db.save_snapshots.add(snapshot);
        if (kind !== 'manual' && current.auto) {
          const oldAuto = await db.save_slots.get(this.slotKey('auto'));
          await db.save_slots.put({ ...oldAuto!, slotKind: 'previousAuto' });
        }
        await db.save_slots.put({
          localWorldId: this.localWorldId,
          slotKind,
          slotNo: 1,
          snapshotId: snapshot.snapshotId,
          gameDate: world.currentDate,
          updatedAt: snapshot.createdAt,
        });
        await db.local_worlds.put({
          ...(await db.local_worlds.get(this.localWorldId)),
          localWorldId: this.localWorldId,
          worldId: world.worldId,
          selectedSnapshotId: snapshot.snapshotId,
          storageRevision: current.storageRevision + 1,
          updatedAt: snapshot.createdAt,
        });
        await collectUnusedInTransaction(db);
        return this.readSlots();
      },
    );
  }

  async load(kind: WorldSlotKind): Promise<{ world: WorldRecord; slots: WorldSlots }> {
    ensure(['auto', 'previousAuto', 'manual'].includes(kind), '保存枠が不正です');
    const db = this.database;
    const captured = await db.transaction(
      'r',
      db.local_worlds,
      db.save_slots,
      db.save_snapshots,
      db.save_blocks,
      async () => {
        const slots = await this.readSlots();
        const slot = slots[kind];
        ensure(slot, 'この枠には保存がありません');
        const snapshot = await db.save_snapshots.get(slot.snapshotId);
        ensure(snapshot, '保存の目録がありません');
        validateSnapshot(snapshot);
        ensure(
          snapshot.blockRefs.length >= 3 &&
            snapshot.blockRefs.length <=
              ([
                'world-prototype-v3',
                'world-prototype-v4',
                'world-prototype-v5',
                'world-prototype-v6',
                'world-prototype-v7',
                'world-prototype-v8',
                'world-prototype-v9',
                'world-prototype-v10',
                'world-prototype-v11',
                'world-prototype-v12',
                'world-prototype-v13',
                'world-prototype-v14',
              ].includes(snapshot.versions.simulationVersion)
                ? 259
                : 35),
          '保存ブロック数が不正です',
        );
        const blocks = await db.save_blocks.bulkGet(snapshot.blockRefs.map((ref) => ref.blockId));
        return { slots, snapshot, blocks };
      },
    );
    const { snapshot, blocks, slots } = captured;
    const world = await decodeWorldSnapshot(snapshot, blocks, this.validator);
    const latest = await this.listSlots();
    ensure(
      latest.storageRevision === slots.storageRevision,
      '読込中に別タブの保存が更新されました',
    );
    return { world, slots };
  }
}
