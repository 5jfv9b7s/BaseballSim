import { Dexie, type Table } from 'dexie';
import { ensure, integer } from '../engine/validation.ts';
import { canonicalJson, definitionsFor, sha256 } from '../storage/codec.ts';
import { validateWorld } from './validation.ts';
import {
  emptyWorldSlots,
  type WorldSlotKind,
  type WorldSlots,
  type WorldStorageAdapter,
} from './storage.ts';
import type { WorldRecord } from './types.ts';

export const WORLD_DATABASE_NAME = 'BaseballSim-v02-worlds';
const LOCAL_WORLD = 'v02-local';
const FORMAT = 'v02-world-snapshot-v1';
const MAX_BYTES = 64 * 1024 * 1024;

interface LocalWorld {
  localWorldId: string;
  worldId: string;
  storageRevision: number;
  selectedSnapshotId: string;
  updatedAt: string;
}
interface Slot {
  localWorldId: string;
  slotKind: WorldSlotKind;
  slotNo: number;
  snapshotId: string;
  gameDate: string;
  updatedAt: string;
}
interface BlockRef {
  logicalKey: string;
  blockId: string;
  kind: string;
  schemaVersion: typeof FORMAT;
  contentHash: string;
  rawBytes: number;
}
interface Block extends BlockRef {
  codec: 'none';
  payloadBytes: Uint8Array;
}
interface Snapshot {
  snapshotId: string;
  worldId: string;
  parentSnapshotId: string | null;
  createdAt: string;
  gameDate: string;
  stateRevision: number;
  saveKind: 'dailyAuto' | 'manual';
  versions: { saveFormatVersion: typeof FORMAT; simulationVersion: 'world-prototype-v1' };
  blockRefs: BlockRef[];
  manifestHash: string;
}

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

const slotKey = (kind: WorldSlotKind): [string, string, number] => [LOCAL_WORLD, kind, 1];

/** v0.1の終了試合保存とは別名前空間。4ストアの一括確定を継承する。 */
export class DexieWorldStorage implements WorldStorageAdapter {
  readonly database: WorldDatabase;

  constructor(database = new WorldDatabase()) {
    this.database = database;
  }

  private async readSlots(): Promise<WorldSlots> {
    const slots = emptyWorldSlots();
    slots.storageRevision =
      (await this.database.local_worlds.get(LOCAL_WORLD))?.storageRevision ?? 0;
    for (const kind of ['auto', 'previousAuto', 'manual'] as const) {
      const row = await this.database.save_slots.get(slotKey(kind));
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

  async save(
    world: WorldRecord,
    stateRevision: number,
    kind: 'auto' | 'manual',
    expectedStorageRevision: number,
  ): Promise<WorldSlots> {
    ensure(kind === 'auto' || kind === 'manual', '保存枠が不正です');
    integer(stateRevision, 0, Number.MAX_SAFE_INTEGER, '状態版');
    integer(expectedStorageRevision, 0, Number.MAX_SAFE_INTEGER - 1, '保存世代');
    validateWorld(world);
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
    for (const [logicalKey, blockKind, value] of values) {
      const text = canonicalJson(value);
      const payloadBytes = new TextEncoder().encode(text);
      bytes += payloadBytes.length;
      ensure(bytes <= MAX_BYTES, '試作の保存上限64MiBを超えました');
      const contentHash = await sha256(blockKind + ':' + FORMAT + ':' + text);
      blocks.push({
        logicalKey,
        kind: blockKind,
        blockId: 'block-' + contentHash,
        schemaVersion: FORMAT,
        contentHash,
        rawBytes: payloadBytes.length,
        codec: 'none',
        payloadBytes,
      });
    }

    const previous = await this.listSlots();
    const manifest: Omit<Snapshot, 'manifestHash'> = {
      snapshotId: crypto.randomUUID(),
      worldId: world.worldId,
      parentSnapshotId: previous[kind]?.snapshotId ?? null,
      createdAt: new Date().toISOString(),
      gameDate: world.currentDate,
      stateRevision,
      saveKind: kind === 'auto' ? 'dailyAuto' : 'manual',
      versions: { saveFormatVersion: FORMAT, simulationVersion: 'world-prototype-v1' },
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
        for (const block of blocks) {
          const existing = await db.save_blocks.get(block.blockId);
          if (existing) {
            const { payloadBytes: savedBytes, ...savedMetadata } = existing;
            const { payloadBytes: newBytes, ...newMetadata } = block;
            ensure(
              canonicalJson(savedMetadata) === canonicalJson(newMetadata) &&
                savedBytes.length === newBytes.length &&
                savedBytes.every((byte, index) => byte === newBytes[index]),
              '既存の保存ブロックが破損しています',
            );
          } else await db.save_blocks.add(block);
        }
        await db.save_snapshots.add(snapshot);
        if (kind === 'auto' && current.auto) {
          const oldAuto = await db.save_slots.get(slotKey('auto'));
          await db.save_slots.put({ ...oldAuto!, slotKind: 'previousAuto' });
        }
        await db.save_slots.put({
          localWorldId: LOCAL_WORLD,
          slotKind: kind,
          slotNo: 1,
          snapshotId: snapshot.snapshotId,
          gameDate: world.currentDate,
          updatedAt: snapshot.createdAt,
        });
        await db.local_worlds.put({
          localWorldId: LOCAL_WORLD,
          worldId: world.worldId,
          selectedSnapshotId: snapshot.snapshotId,
          storageRevision: current.storageRevision + 1,
          updatedAt: snapshot.createdAt,
        });
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
        ensure(
          snapshot.blockRefs.length >= 3 && snapshot.blockRefs.length <= 35,
          '保存ブロック数が不正です',
        );
        const blocks = await db.save_blocks.bulkGet(snapshot.blockRefs.map((ref) => ref.blockId));
        return { slots, snapshot, blocks };
      },
    );
    const { snapshot, blocks, slots } = captured;
    const { manifestHash, ...manifest } = snapshot;
    ensure(
      (await sha256(canonicalJson(manifest))) === manifestHash,
      '保存目録のハッシュが一致しません',
    );
    ensure(
      snapshot.versions.saveFormatVersion === FORMAT &&
        snapshot.versions.simulationVersion === 'world-prototype-v1',
      '未対応の世界保存形式です',
    );
    const values = new Map<string, unknown>();
    let bytes = 0;
    for (let index = 0; index < blocks.length; index++) {
      const block = blocks[index];
      const ref = snapshot.blockRefs[index]!;
      ensure(
        block && block.codec === 'none' && block.schemaVersion === FORMAT,
        '保存ブロックがありません、または未対応です',
      );
      ensure(!values.has(ref.logicalKey), '保存ブロックの役割が重複しています');
      const { payloadBytes, codec: _codec, ...metadata } = block;
      ensure(canonicalJson(metadata) === canonicalJson(ref), '保存ブロックの参照が一致しません');
      bytes += payloadBytes.length;
      ensure(bytes <= MAX_BYTES && ref.rawBytes === payloadBytes.length, '保存容量が不正です');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(payloadBytes);
      ensure(
        (await sha256(block.kind + ':' + FORMAT + ':' + text)) === ref.contentHash &&
          ref.blockId === 'block-' + ref.contentHash,
        '保存ブロックのハッシュが一致しません',
      );
      values.set(ref.logicalKey, JSON.parse(text));
    }
    const definitions = values.get('definitions') as {
      world: WorldRecord['definitions'];
      engine: unknown;
    };
    ensure(
      definitions && values.has('world') && values.has('stats'),
      '世界保存の必須ブロックが不足しています',
    );
    const games: WorldRecord['games'] = {};
    for (const [key, value] of values) {
      if (key.startsWith('game/')) games[key.slice(5)] = value as WorldRecord['games'][string];
      else ensure(['world', 'stats', 'definitions'].includes(key), '未対応の保存ブロックです');
    }
    const world = {
      ...(values.get('world') as object),
      ...(values.get('stats') as object),
      definitions: definitions.world,
      games,
    };
    validateWorld(world);
    ensure(
      canonicalJson(definitions.engine) ===
        canonicalJson(
          definitionsFor(
            'game-prototype-v10',
            world.definitions.matchConfig,
            world.definitions.errorConfig,
          ),
        ),
      '試合の計算定義が一致しません',
    );
    ensure(
      snapshot.worldId === world.worldId && snapshot.gameDate === world.currentDate,
      '保存目録と世界が一致しません',
    );
    const latest = await this.listSlots();
    ensure(
      latest.storageRevision === slots.storageRevision,
      '読込中に別タブの保存が更新されました',
    );
    return { world, slots };
  }
}
