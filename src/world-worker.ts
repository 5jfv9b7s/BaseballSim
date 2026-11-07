import {
  WorldWorkspace,
  type WorkspaceRequest,
  type WorkspaceResponse,
} from './world/workspace.ts';

export type WorldWorkerResponse = WorkspaceResponse;
const workspace = new WorldWorkspace();
let queue = workspace.initialize();

self.onmessage = (message: MessageEvent<WorkspaceRequest>) => {
  queue = queue.then(async () => {
    const response = await workspace.handle(message.data);
    // 書き出したファイルだけ所有権をUIへ渡す。世界の正本はWorkerに保持する。
    self.postMessage(response, {
      transfer: response.backup ? [response.backup.bytes.buffer as ArrayBuffer] : [],
    });
  });
};
