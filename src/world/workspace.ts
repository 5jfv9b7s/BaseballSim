import { createPlayerProfileDefinitions } from '../data/world/player-profiles.ts';
import { ensure, integer } from '../engine/validation.ts';
import { canonicalJson } from '../storage/codec.ts';
import { createPitchProfileWorld } from './engine.ts';
import { DexieWorldStorage, WorldDatabase } from './dexie-storage.ts';
import { WorldController, type WorldCommand, type WorldView } from './controller.ts';
import type { StorageInspection } from './storage-inspection.ts';
import type { StoredPlay, WorldSlotKind, WorldSlots } from './storage.ts';

interface Context {
  localWorldId: string;
  expectedStateRevision: number;
}
export type WorkspaceRequest =
  | WorldCommand
  | { kind: 'query' }
  | { kind: 'inspectStorage' }
  | (Context & { kind: 'exportSnapshot'; slot: WorldSlotKind })
  | (Context & { kind: 'importSnapshot'; bytes: Uint8Array; requestId: string })
  | (Context & { kind: 'openPlay'; targetLocalWorldId: string; slot: WorldSlotKind });
export type WorkspaceResponse = ({ ok: true } | { ok: false; error: string }) & {
  view: WorldView;
  plays: StoredPlay[];
  playListError?: string;
  inspection?: StorageInspection;
  backup?: { bytes: Uint8Array; name: string };
  importedLocalWorldId?: string;
  createdLocalWorldId?: string;
};

/** Workerの直列キューから呼ぶ。切替の検証が失敗した場合は現行の正本を保持する。 */
export class WorldWorkspace {
  private storage: DexieWorldStorage;
  private controller: WorldController;
  private plays: StoredPlay[] = [];
  private playListError: string | undefined;

  private async refreshPlays() {
    try {
      this.plays = await this.storage.listPlays();
      this.playListError = undefined;
    } catch {
      this.playListError = '保存済みプレイの一覧を取得できません。一覧を更新してください。';
    }
  }

  private async createPlay(request: Extract<WorldCommand, { kind: 'new' }>, before: WorldView) {
    ensure(
      typeof request.commandId === 'string' &&
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(request.commandId),
      '新規作成指示IDが不正です',
    );
    integer(request.seed, 1, 0xffffffff, '世界seed');
    integer(request.expectedStateRevision, 0, Number.MAX_SAFE_INTEGER - 3, '状態版');
    ensure(
      request.calendar === undefined || ['short', 'annual'].includes(request.calendar),
      '日程種類が不正です',
    );

    // 同じseedでも別プレイ。指示IDはゲーム用の乱数を消費しない。
    const localWorldId = 'play-' + request.commandId;
    const fingerprint = canonicalJson(request);
    const existing = await this.storage.database.local_worlds.get(localWorldId);

    if (existing) {
      ensure(existing.creationFingerprint === fingerprint, '同じ新規作成指示IDの内容が異なります');
      // Worker再起動後の再送でも、進めたプレイを初期状態へ巻き戻さない。
      return localWorldId;
    }

    ensure(
      request.localWorldId === before.localWorldId &&
        request.expectedStateRevision === before.revision,
      '古いプレイ状態への指示です',
    );
    ensure(
      !before.unsavedChanges || before.revision === 0,
      '新規作成の前に現在の作業を手動保存してください',
    );

    const world = createPitchProfileWorld(
      request.seed,
      request.controlledSquadId,
      createPlayerProfileDefinitions(request.calendar),
    );
    const nextStorage = new DexieWorldStorage(this.storage.database, localWorldId);
    const nextRevision = before.revision + 1;
    let slots: WorldSlots;

    try {
      slots = await nextStorage.createPlay(world, nextRevision, fingerprint);
    } catch (error) {
      const reason = error instanceof Error ? error.message : '保存先を確認してください';
      throw new Error('初回保存に失敗しました。現在のプレイを保持しています。' + reason);
    }

    this.controller = WorldController.fromCommitted(
      nextStorage,
      localWorldId,
      nextRevision,
      world,
      slots,
    );
    this.storage = nextStorage;
    return localWorldId;
  }

  constructor(database = new WorldDatabase()) {
    this.storage = new DexieWorldStorage(database);
    this.controller = new WorldController(this.storage);
  }

  async initialize() {
    await this.controller.initialize();
  }

  async handle(request: WorkspaceRequest): Promise<WorkspaceResponse> {
    try {
      const before = this.controller.query();
      let dispatched: WorldView | undefined;
      let inspection: StorageInspection | undefined;
      let backup: WorkspaceResponse['backup'];
      let importedLocalWorldId: string | undefined;
      let createdLocalWorldId: string | undefined;
      if (
        request.kind === 'exportSnapshot' ||
        request.kind === 'importSnapshot' ||
        request.kind === 'openPlay'
      )
        ensure(
          request.localWorldId === before.localWorldId &&
            request.expectedStateRevision === before.revision,
          '古いプレイ状態への指示です',
        );
      if (request.kind === 'new') {
        createdLocalWorldId = await this.createPlay(request, before);
        await this.refreshPlays();
      } else if (request.kind === 'query') await this.refreshPlays();
      else if (request.kind === 'inspectStorage') inspection = await this.storage.inspectStorage();
      else if (request.kind === 'exportSnapshot') {
        const bytes = await this.storage.exportSnapshot(request.slot);
        backup = { bytes, name: 'BaseballSim-' + request.slot + '.bssave' };
      } else if (request.kind === 'importSnapshot') {
        importedLocalWorldId = await this.storage.importSnapshot(request.bytes, request.requestId);
        await this.refreshPlays();
      } else if (request.kind === 'openPlay') {
        ensure(
          !before.unsavedChanges || before.revision === 0,
          '切り替える前に現在の作業を手動保存してください',
        );
        const nextStorage = new DexieWorldStorage(
          this.storage.database,
          request.targetLocalWorldId,
        );
        const next = new WorldController(
          nextStorage,
          request.targetLocalWorldId,
          before.revision + 1,
        );
        await next.initialize();
        await next.dispatch({
          kind: 'load',
          slot: request.slot,
          commandId: crypto.randomUUID(),
          localWorldId: request.targetLocalWorldId,
          expectedStateRevision: before.revision + 1,
        });
        this.storage = nextStorage;
        this.controller = next;
        await this.refreshPlays();
      } else {
        ensure(
          request.kind === 'load' ||
            before.revision !== 0 ||
            !before.unsavedChanges ||
            before.slots.storageRevision === 0,
          '以前の保存があります。保存を読み込むか、新規プレイを作成してください',
        );
        const view = await this.controller.dispatch(request);
        dispatched = view;
        if (view.slots.storageRevision !== before.slots.storageRevision) await this.refreshPlays();
      }
      return {
        ok: true,
        view: dispatched ?? this.controller.query(),
        plays: this.plays,
        ...(this.playListError ? { playListError: this.playListError } : {}),
        ...(inspection ? { inspection } : {}),
        ...(backup ? { backup } : {}),
        ...(importedLocalWorldId ? { importedLocalWorldId } : {}),
        ...(createdLocalWorldId ? { createdLocalWorldId } : {}),
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : '保存の処理に失敗しました',
        view: this.controller.query(),
        plays: this.plays,
      };
    }
  }
}
