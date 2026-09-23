import { ensure, id, integer } from '../engine/validation.ts';
import { createGame, stepRecord } from './engine.ts';
import { finalizeGame } from './results.ts';
import type { GameEvent, GameResult, GameState } from './types.ts';
import type { SaveSlotInfo, StorageAdapter } from '../storage/adapter.ts';

export type GameCommand = {
  commandId: string;
  expectedStateRevision: number;
} & (
  | { kind: 'new'; seed: number }
  | { kind: 'advance'; count: number }
  | { kind: 'save' }
  | { kind: 'load'; previous: boolean }
);
export interface GameView {
  revision: number;
  seed: number;
  state: GameState;
  result: GameResult | null;
  recentEvents: GameEvent[];
  slots: SaveSlotInfo;
  storageError: string | null;
}

/** UIから独立した状態所有者。Workerはdispatchを直列実行する。 */
export class GameController {
  private record = createGame();
  private revision = 0;
  private slots: SaveSlotInfo = {
    snapshotId: null,
    previousSnapshotId: null,
    storageRevision: 0,
    updatedAt: null,
  };
  private storageError: string | null = null;
  private processed = new Map<string, { fingerprint: string; result: GameView }>();
  private storage: StorageAdapter;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  async initialize(): Promise<GameView> {
    try {
      this.slots = await this.storage.listSlots();
    } catch {
      this.storageError = '保存先を開けません。試合は進行できますが、保存は利用できません。';
    }
    return this.query();
  }
  query(): GameView {
    return structuredClone({
      revision: this.revision,
      seed: this.record.seed,
      state: this.record.state,
      result: this.record.result,
      recentEvents: this.record.events.slice(-8),
      slots: this.slots,
      storageError: this.storageError,
    });
  }
  async dispatch(command: GameCommand): Promise<GameView> {
    id(command.commandId);
    integer(command.expectedStateRevision, 0, Number.MAX_SAFE_INTEGER - 1, '状態版');
    ensure(['new', 'advance', 'save', 'load'].includes(command.kind), '未対応の試合指示です');
    if (command.kind === 'new') integer(command.seed, 1, 0xffffffff, 'seed');
    if (command.kind === 'advance') integer(command.count, 1, 25, '進行イベント数');
    if (command.kind === 'load')
      ensure(typeof command.previous === 'boolean', '読込指定が不正です');
    const fingerprint = JSON.stringify(command);
    const prior = this.processed.get(command.commandId);
    if (prior) {
      ensure(prior.fingerprint === fingerprint, '同じ指示IDの内容が異なります');
      return structuredClone(prior.result);
    }
    ensure(command.expectedStateRevision === this.revision, '古い試合状態への指示です');
    ensure(this.processed.size < 10000, '指示上限です。保存後に再読み込みしてください');

    if (command.kind === 'new') this.record = createGame(command.seed);
    if (command.kind === 'advance') {
      ensure(
        this.record.state.phase !== 'gameComplete' && this.record.state.phase !== 'aborted',
        '終了した試合です',
      );
      const next = { ...this.record, state: this.record.state, events: [...this.record.events] };
      for (let i = 0; i < command.count; i++) {
        stepRecord(next);
        if (next.state.phase === 'gameComplete') {
          finalizeGame(next);
          break;
        }
        if (next.state.phase === 'aborted') break;
      }
      this.record = next;
    }
    if (command.kind === 'save') {
      ensure(this.record.result, '正常終了した試合だけ保存できます');
      this.slots = await this.storage.commitSnapshot(this.record, this.slots.storageRevision);
      this.storageError = null;
    }
    if (command.kind === 'load') {
      const loaded = await this.storage.loadSnapshot(command.previous);
      // 読込検査が成功してから正本を置換する。
      const slots = await this.storage.listSlots();
      ensure(
        slots.storageRevision === loaded.storageRevision,
        '読込中に別タブの保存が更新されました',
      );
      this.record = loaded.record;
      this.slots = slots;
      this.storageError = null;
    }
    this.revision++;
    const view = this.query();
    this.processed.set(command.commandId, { fingerprint, result: view });
    return structuredClone(view);
  }
}
