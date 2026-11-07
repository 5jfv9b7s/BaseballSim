import type { WorkProgress, WorldWorkerProgress } from './world/work-progress.ts';
import {
  WorldWorkspace,
  type WorkspaceRequest,
  type WorkspaceResponse,
} from './world/workspace.ts';

export type WorldWorkerResponse = WorkspaceResponse;
export type WorldWorkerMessage = WorkspaceResponse | WorldWorkerProgress;
const workspace = new WorldWorkspace();
let queue = workspace.initialize();

self.onmessage = (message: MessageEvent<WorkspaceRequest>) => {
  queue = queue.then(async () => {
    let previousStage = '';
    let lastReport = -Infinity;
    const report =
      message.data.kind === 'advance'
        ? undefined
        : (progress: WorkProgress) => {
            const now = performance.now();
            // 表示用の通知だけを抑制する。計算・RNG・日次の境界には使わない。
            if (
              progress.stage === previousStage &&
              progress.completed !== progress.total &&
              now - lastReport < 120
            )
              return;
            previousStage = progress.stage;
            lastReport = now;
            self.postMessage({
              kind: 'workProgress',
              operation: message.data.kind,
              progress,
            } satisfies WorldWorkerProgress);
          };
    const response = await workspace.handle(message.data, report);
    // 書き出したファイルだけ所有権をUIへ渡す。世界の正本はWorkerに保持する。
    self.postMessage(response, {
      transfer: response.backup ? [response.backup.bytes.buffer as ArrayBuffer] : [],
    });
  });
};
