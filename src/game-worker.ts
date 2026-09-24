import { GameController } from './game/controller.ts';
import type { GameCommand, GameView } from './game/controller.ts';
import { DexieStorageAdapter } from './storage/dexie-adapter.ts';

export type GameWorkerResponse = { ok: true; view: GameView } | { ok: false; error: string };
const controller = new GameController(new DexieStorageAdapter());
let queue = controller.initialize();
self.onmessage = (message: MessageEvent<GameCommand | { kind: 'query' }>) => {
  queue = queue.then(async () => {
    try {
      const view =
        message.data.kind === 'query'
          ? controller.query()
          : await controller.dispatch(message.data);
      self.postMessage({ ok: true, view } satisfies GameWorkerResponse);
      return view;
    } catch (error) {
      self.postMessage({
        ok: false,
        error: error instanceof Error ? error.message : '試合処理に失敗しました',
      } satisfies GameWorkerResponse);
      return controller.query();
    }
  });
};
