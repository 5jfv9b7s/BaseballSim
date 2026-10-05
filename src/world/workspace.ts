import { ensure } from '../engine/validation.ts';
import { DexieWorldStorage, WorldDatabase } from './dexie-storage.ts';
import { WorldController, type WorldCommand, type WorldView } from './controller.ts';
import type { StorageInspection } from './storage-inspection.ts';
import type { StoredPlay, WorldSlotKind } from './storage.ts';

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
      if (request.kind === 'query') await this.refreshPlays();
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
