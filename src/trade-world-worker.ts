import { WorldDatabase } from './world/dexie-storage.ts';
import { DexieTradeApplicationStorage } from './world/trade-dexie-storage.ts';
import { TradeGameSession } from './world/trade-game-session.ts';
import { listTradeCandidates } from './world/trade-candidate-index.ts';
import { TradeWorkerWorkspace } from './world/trade-worker-workspace.ts';

/** 候補専用Worker。新規会計の仮データ生成や通常セーブの変換は行わない。 */
const database = new WorldDatabase();
const workspace = new TradeWorkerWorkspace({
  open: (id) => TradeGameSession.open(new DexieTradeApplicationStorage(database, id)),
  list: () => listTradeCandidates(database),
});
self.onmessage = async (event: MessageEvent<unknown>) => {
  const response = await workspace.handle(event.data);
  self.postMessage(response);
};
