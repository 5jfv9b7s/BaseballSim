import { WorldController, type WorldCommand, type WorldView } from './world/controller.ts';
import { DexieWorldStorage } from './world/dexie-storage.ts';

export type WorldWorkerResponse =
  { ok: true; view: WorldView } | { ok: false; error: string; view: WorldView };

const controller = new WorldController(new DexieWorldStorage());
let queue = controller.initialize();

self.onmessage = (message: MessageEvent<WorldCommand | { kind: 'query' }>) => {
  queue = queue.then(async () => {
    try {
      const view =
        message.data.kind === 'query'
          ? controller.query()
          : await controller.dispatch(message.data);
      self.postMessage({ ok: true, view } satisfies WorldWorkerResponse);
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
