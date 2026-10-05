import type { StorageInspection } from './world/storage-inspection.ts';
import { WorldController, type WorldCommand, type WorldView } from './world/controller.ts';
import { DexieWorldStorage } from './world/dexie-storage.ts';

export type WorldWorkerResponse = (
  { ok: true; view: WorldView } | { ok: false; error: string; view: WorldView }
) & { inspection?: StorageInspection };

const storage = new DexieWorldStorage();
const controller = new WorldController(storage);
let queue = controller.initialize();

self.onmessage = (
  message: MessageEvent<WorldCommand | { kind: 'query' } | { kind: 'inspectStorage' }>,
) => {
  queue = queue.then(async () => {
    try {
      const inspection =
        message.data.kind === 'inspectStorage' ? await storage.inspectStorage() : undefined;
      const view =
        message.data.kind === 'query' || message.data.kind === 'inspectStorage'
          ? controller.query()
          : await controller.dispatch(message.data);
      self.postMessage({
        ok: true,
        view,
        ...(inspection ? { inspection } : {}),
      } satisfies WorldWorkerResponse);
      return view;
    } catch (error) {
      const view = controller.query();
      self.postMessage({
        ok: false,
        error: error instanceof Error ? error.message : '日次処理に失敗しました',
        view,
      } satisfies WorldWorkerResponse);
      return view;
    }
  });
};
