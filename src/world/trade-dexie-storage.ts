import type { TradeCreationOptions } from './trade-creation-types.ts';
import type { Table } from 'dexie';
import { ensure } from '../engine/validation.ts';
import type { TradeCommitContext } from '../recruitment/trade-commit.ts';
import type { TradeApplicationStorage } from './trade-application-port.ts';
import { DEFAULT_LOCAL_WORLD, WorldDatabase } from './dexie-storage.ts';
import { putSharedBlocks, verifySharedBlocks } from './shared-blocks.ts';
import { decodeTradeSnapshot, encodeTradeSnapshot } from './trade-snapshot-codec.ts';
import {
  TRADE_STORAGE_PROFILE,
  validateTradeManifest,
  type TradeStoredSnapshot,
} from './trade-save-format.ts';
import { validateTradeSavedState, type TradeSavedState } from './trade-save-validation.ts';
import { validateTradeSaveTransition } from './trade-save-transition.ts';

type CandidateSlot = 'auto' | 'previousAuto' | 'manual';
type CandidateRead = CandidateSlot | 'selected';

/**
 * 移籍候補の全状態と確定記録を、既存の4ストアへ原子的に保存する。
 * 通常Workerの保存とは別profile。実行可能な世界v22へ移行したものではない。
 */
export class DexieTradeApplicationStorage implements TradeApplicationStorage {
  readonly database: WorldDatabase;
  readonly localWorldId: string;
  private readonly snapshots: Table<TradeStoredSnapshot, string>;

  constructor(database: WorldDatabase, localWorldId: string) {
    ensure(
      typeof localWorldId === 'string' && localWorldId.trim().length > 0,
      '候補保存のローカルIDが必要です',
    );
    ensure(localWorldId !== DEFAULT_LOCAL_WORLD, '通常起動の既定保存IDは候補に使えません');
    this.database = database;
    this.localWorldId = localWorldId;
    // 同じ物理表への型付きの入口。旧Snapshotの世界版unionは変更しない。
    this.snapshots = database.table<TradeStoredSnapshot, string>('save_snapshots');
  }

  private key(kind: CandidateSlot): [string, string, number] {
    return [this.localWorldId, kind, 1];
  }

  private async capture(kind: CandidateRead) {
    const db = this.database;
    return db.transaction(
      'r',
      db.local_worlds,
      db.save_slots,
      this.snapshots,
      db.save_blocks,
      async () => {
        const local = await db.local_worlds.get(this.localWorldId);
        ensure(
          local?.storageProfile === TRADE_STORAGE_PROFILE,
          'このローカルIDには移籍候補保存がありません',
        );
        const selected =
          kind === 'selected'
            ? (
                await db.save_slots.where('localWorldId').equals(this.localWorldId).toArray()
              ).filter((s) => s.snapshotId === local.selectedSnapshotId)
            : null;
        if (selected) ensure(selected.length === 1, '現在保存の枠を一意に解決できません');
        const slot = selected
          ? selected[0]
          : await db.save_slots.get(this.key(kind as CandidateSlot));
        ensure(slot, 'この枠には候補保存がありません');
        ensure(
          slot.slotNo === 1 &&
            ['auto', 'previousAuto', 'manual'].includes(slot.slotKind) &&
            (kind !== 'selected' || slot.slotKind !== 'previousAuto'),
          '候補の保存枠参照が不正です',
        );
        const snapshot = await this.snapshots.get(slot.snapshotId);
        validateTradeManifest(snapshot);
        ensure(
          snapshot.worldId === local.worldId &&
            snapshot.gameDate === slot.gameDate &&
            (slot.slotKind === 'manual'
              ? snapshot.saveKind === 'manual'
              : snapshot.saveKind === 'actionAuto' || snapshot.saveKind === 'dailyAuto') &&
            (kind !== 'selected' || local.selectedSnapshotId === slot.snapshotId),
          '候補保存の管理参照が一致しません',
        );
        const blocks = await db.save_blocks.bulkGet(snapshot.blockRefs.map((r) => r.blockId));
        return { local, slot, snapshot, blocks };
      },
    );
  }

  /** 過去枠は読取だけ。過去の保存版を現在版へ付け替えたり自動復旧したりしない。 */
  private async loadCaptured(kind: CandidateRead) {
    ensure(['auto', 'previousAuto', 'manual', 'selected'].includes(kind), '候補の保存枠が不正です');
    const captured = await this.capture(kind);
    const saved = await decodeTradeSnapshot(captured.snapshot, captured.blocks);
    ensure(
      saved.localWorldId === this.localWorldId &&
        saved.worldId === captured.local.worldId &&
        saved.storageRevision <= captured.local.storageRevision &&
        (captured.slot.snapshotId !== captured.local.selectedSnapshotId ||
          saved.storageRevision === captured.local.storageRevision),
      '候補保存のローカルID・保存版が不一致です',
    );
    const db = this.database;
    await db.transaction('r', db.local_worlds, db.save_slots, async () => {
      const current = await db.local_worlds.get(this.localWorldId);
      const slot = await db.save_slots.get([this.localWorldId, captured.slot.slotKind, 1]);
      ensure(
        current?.storageProfile === TRADE_STORAGE_PROFILE &&
          current.worldId === captured.local.worldId &&
          current.storageRevision === captured.local.storageRevision &&
          current.selectedSnapshotId === captured.local.selectedSnapshotId &&
          slot?.snapshotId === captured.slot.snapshotId,
        '候補の読込中に別タブの保存が更新されました',
      );
    });
    return { saved, captured };
  }

  async load(kind: CandidateSlot = 'auto'): Promise<TradeSavedState> {
    return (await this.loadCaptured(kind)).saved;
  }

  async read(): Promise<TradeSavedState> {
    return (await this.loadCaptured('selected')).saved;
  }

  /** 初期契約等を明示して準備した、未適用の候補だけを新しいローカルIDへ保存する。 */
  async create(
    input: TradeSavedState,
    optionsInput?: TradeCreationOptions,
  ): Promise<'created' | 'replayed'> {
    const initial = structuredClone(input);
    const options = optionsInput ? structuredClone(optionsInput) : undefined;
    if (options)
      ensure(
        /^[a-f0-9]{64}$/.test(options.fingerprint) &&
          options.source.localWorldId !== this.localWorldId &&
          typeof options.displayName === 'string' &&
          options.displayName.length <= 240,
        '候補作成の参照が不正です',
      );
    validateTradeSavedState(initial);
    ensure(
      initial.localWorldId === this.localWorldId &&
        initial.storageRevision === 1 &&
        initial.tradeReceipts.length === 0 &&
        (initial.gameReceipts?.length ?? 0) === 0 &&
        (initial.dayReceipts?.length ?? 0) === 0 &&
        (initial.rosterReceipts?.length ?? 0) === 0 &&
        initial.state.transactions.length === 0,
      '初回候補は保存版1・未適用の状態が必要です',
    );
    const encoded = await encodeTradeSnapshot(initial, null);
    const verified = await verifySharedBlocks(this.database, encoded.blocks);
    const db = this.database;
    return db.transaction(
      'rw',
      db.local_worlds,
      db.save_slots,
      this.snapshots,
      db.save_blocks,
      async () => {
        const prior = await db.local_worlds.get(this.localWorldId);
        if (options && prior) {
          ensure(
            prior.storageProfile === TRADE_STORAGE_PROFILE &&
              prior.worldId === initial.worldId &&
              prior.creationFingerprint === options.fingerprint,
            '同じ作成IDの内容が異なるか、既存プレイと衝突しています',
          );
          return 'replayed' as const; // 進行済みの保存枠・状態は巻き戻さない。
        }
        if (options) {
          const source = await db.local_worlds.get(options.source.localWorldId);
          const slot = await db.save_slots.get([
            options.source.localWorldId,
            options.source.slotKind,
            1,
          ]);
          ensure(
            source &&
              !source.storageProfile &&
              source.storageRevision === options.source.storageRevision &&
              source.worldId === initial.worldId &&
              slot?.snapshotId === options.source.snapshotId,
            '元保存が更新されました。初期入力を最新の保存で確認し直してください',
          );
        }
        ensure(
          !(await db.local_worlds.get(this.localWorldId)) &&
            !(await db.save_slots.where('localWorldId').equals(this.localWorldId).count()),
          '既存のプレイ・候補には初回保存を上書きできません',
        );
        await putSharedBlocks(db, encoded.blocks, verified);
        await this.snapshots.add(encoded.snapshot);
        await db.save_slots.add({
          localWorldId: this.localWorldId,
          slotKind: 'auto',
          slotNo: 1,
          snapshotId: encoded.snapshot.snapshotId,
          gameDate: initial.currentDate,
          updatedAt: encoded.snapshot.createdAt,
        });
        await db.local_worlds.add({
          localWorldId: this.localWorldId,
          worldId: initial.worldId,
          storageProfile: TRADE_STORAGE_PROFILE,
          displayName: options?.displayName ?? '移籍の内部候補',
          ...(options ? { creationFingerprint: options.fingerprint } : {}),
          storageRevision: 1,
          selectedSnapshotId: encoded.snapshot.snapshotId,
          updatedAt: encoded.snapshot.createdAt,
        });
        return 'created' as const;
      },
    );
  }

  async commit(expectedInput: TradeCommitContext, candidateInput: TradeSavedState): Promise<void> {
    const expected = structuredClone(expectedInput),
      candidate = structuredClone(candidateInput);
    validateTradeSavedState(candidate);
    ensure(
      expected.localWorldId === this.localWorldId &&
        candidate.localWorldId === this.localWorldId &&
        candidate.worldId === expected.worldId &&
        candidate.stateRevision > expected.stateRevision &&
        candidate.storageRevision === expected.storageRevision + 1,
      '候補保存の指示と版の進め方が不正です',
    );
    const { saved: previous, captured: anchor } = await this.loadCaptured('selected');
    ensure(
      previous.worldId === expected.worldId &&
        previous.stateRevision === expected.stateRevision &&
        previous.storageRevision === expected.storageRevision,
      '古い状態・別タブの候補保存への指示です',
    );
    const transition = await validateTradeSaveTransition(previous, candidate);
    const manual = transition === 'gameManual';
    const encoded = await encodeTradeSnapshot(
      candidate,
      anchor.snapshot.snapshotId,
      manual ? 'manual' : transition === 'dayAuto' ? 'dailyAuto' : 'actionAuto',
    );
    const verified = await verifySharedBlocks(this.database, encoded.blocks);
    const db = this.database;
    await db.transaction(
      'rw',
      db.local_worlds,
      db.save_slots,
      this.snapshots,
      db.save_blocks,
      async () => {
        const local = await db.local_worlds.get(this.localWorldId);
        const oldAuto = await db.save_slots.get(this.key('auto'));
        const selected = await db.save_slots.get([this.localWorldId, anchor.slot.slotKind, 1]);
        ensure(
          local?.storageProfile === TRADE_STORAGE_PROFILE &&
            local.worldId === expected.worldId &&
            local.storageRevision === expected.storageRevision &&
            local.selectedSnapshotId === anchor.snapshot.snapshotId &&
            oldAuto &&
            selected?.snapshotId === anchor.snapshot.snapshotId,
          '別タブで候補保存が更新されました',
        );
        const current = await this.snapshots.get(local.selectedSnapshotId);
        validateTradeManifest(current);
        ensure(
          current.stateRevision === expected.stateRevision &&
            current.manifestHash === anchor.snapshot.manifestHash,
          '候補保存の状態版・目録が変更されています',
        );
        await putSharedBlocks(db, encoded.blocks, verified);
        await this.snapshots.add(encoded.snapshot);
        if (!manual) await db.save_slots.put({ ...oldAuto, slotKind: 'previousAuto' });
        await db.save_slots.put({
          localWorldId: this.localWorldId,
          slotKind: manual ? 'manual' : 'auto',
          slotNo: 1,
          snapshotId: encoded.snapshot.snapshotId,
          gameDate: candidate.currentDate,
          updatedAt: encoded.snapshot.createdAt,
        });
        await db.local_worlds.put({
          ...local,
          storageRevision: candidate.storageRevision,
          selectedSnapshotId: encoded.snapshot.snapshotId,
          updatedAt: encoded.snapshot.createdAt,
        });
        // 任意の整理は実行しない。保存確定後の整理失敗を取引の失敗へ混ぜない。
      },
    );
  }
}
