import { PitchSession } from './engine/session.ts';
import type { Command, View } from './engine/session.ts';

export type WorkerResponse = { ok: true; view: View } | { ok: false; error: string };
const session = new PitchSession();
self.onmessage = (message: MessageEvent<Command | { kind: 'query' }>) => {
  try {
    const view = message.data.kind === 'query' ? session.query() : session.dispatch(message.data);
    self.postMessage({ ok: true, view } satisfies WorkerResponse);
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : '処理に失敗しました' } satisfies WorkerResponse);
  }
};
