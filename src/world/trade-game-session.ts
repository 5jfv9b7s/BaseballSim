import { ensure, integer } from '../engine/validation.ts';
import { canonicalJson } from '../storage/canonical.ts';
import {
  commitAcceptedTrade,
  type TradeCommitContext,
  type TradeCommitCommand,
} from '../recruitment/trade-commit.ts';
import {
  createTradeApplicationPort,
  type TradeApplicationStorage,
} from './trade-application-port.ts';
import {
  receiptCommand,
  validateTradeSavedState,
  type TradeSavedState,
} from './trade-save-validation.ts';
import { applyTradeRosterCommand, type TradeRosterCommand } from './trade-roster-commands.ts';
import { applyTradeDayCommand, type TradeDayCommand } from './trade-day-commands.ts';
import {
  applyTradeGameCommand,
  MAX_GAME_COMMANDS_PER_SAVE,
  type TradeGameCommand,
} from './trade-game-commands.ts';

/**
 * 候補専用Workerが使う、作業状態を一つだけ所有するコーディネーター。通常UIへの登録は別工程。
 * executeは保存しない。saveManualは手動枠、completeDayは翌日と日次autoを一緒に確定する。
 */
export class TradeGameSession {
  private readonly storage: TradeApplicationStorage;
  private working: TradeSavedState;
  private persisted: TradeCommitContext;
  private pending = 0;
  private busy = false;
  private uncertain = false;

  private constructor(storage: TradeApplicationStorage, saved: TradeSavedState) {
    this.storage = storage;
    this.working = structuredClone(saved);
    this.persisted = this.context(saved);
  }

  static async open(storage: TradeApplicationStorage): Promise<TradeGameSession> {
    const saved = await storage.read();
    validateTradeSavedState(saved);
    return new TradeGameSession(storage, saved);
  }

  private context(saved: TradeSavedState): TradeCommitContext {
    return {
      localWorldId: saved.localWorldId,
      worldId: saved.worldId,
      stateRevision: saved.stateRevision,
      storageRevision: saved.storageRevision,
    };
  }

  /** 表示側へ内部正本の参照を渡さない。 */
  read() {
    return {
      snapshot: structuredClone(this.working),
      pendingCommands: this.pending,
      saving: this.busy,
      reloadRequired: this.uncertain,
    };
  }

  execute(command: TradeGameCommand) {
    ensure(!this.busy && !this.uncertain, '保存中・成否不明です。再読込まで試合指示を停止します');
    const result = applyTradeGameCommand(this.working, command);
    if (result.status === 'applied') {
      ensure(this.pending < MAX_GAME_COMMANDS_PER_SAVE, '続きを処理する前に手動保存してください');
      this.working = result.snapshot;
      this.pending++;
    }
    return { status: result.status, receipt: structuredClone(result.receipt) };
  }

  /** 途中のアニメーションではなく、解決済みイベント境界の全状態を手動保存する。 */
  async saveManual(): Promise<'saved' | 'unchanged'> {
    ensure(!this.busy && !this.uncertain, '保存中・成否不明です。再読込が必要です');
    if (!this.pending) return 'unchanged';
    integer(this.persisted.storageRevision, 1, Number.MAX_SAFE_INTEGER - 1, '保存版');
    this.busy = true;
    const candidate = structuredClone(this.working);
    candidate.storageRevision = this.persisted.storageRevision + 1;
    try {
      await this.storage.commit(structuredClone(this.persisted), structuredClone(candidate));
      this.working = candidate;
      this.persisted = this.context(candidate);
      this.pending = 0;
      return 'saved';
    } catch (error) {
      // 書込後の通信失敗もあり得る。推測して後続指示や二度目の書込を続けない。
      this.uncertain = true;
      throw error;
    } finally {
      this.busy = false;
    }
  }

  /** 登録・固定希望と監査をactionAutoへ確定。保留理由つきの希望も保存できる。 */
  async changeRoster(command: TradeRosterCommand) {
    ensure(!this.busy && !this.uncertain, '保存中・成否不明です。再読込まで編成指示を停止します');
    const result = applyTradeRosterCommand(this.working, command);
    if (result.status !== 'applied') return result;
    ensure(this.pending === 0, '未保存の試合指示があります。編成変更の前に手動保存してください');
    integer(this.persisted.storageRevision, 1, Number.MAX_SAFE_INTEGER - 1, '編成保存版');
    const candidate = structuredClone(result.snapshot);
    candidate.storageRevision = this.persisted.storageRevision + 1;
    this.busy = true;
    try {
      await this.storage.commit(structuredClone(this.persisted), structuredClone(candidate));
      this.working = candidate;
      this.persisted = this.context(candidate);
      return { status: 'committed' as const, receipt: structuredClone(result.receipt) };
    } catch (error) {
      this.uncertain = true;
      throw error;
    } finally {
      this.busy = false;
    }
  }

  /** 保存内の内部承認だけを使う。交渉成立フラグや会計入力を画面から受け取らない。 */
  async commitTrade(value: TradeCommitCommand) {
    ensure(!this.busy && !this.uncertain, '保存中・成否不明です。再読込まで移籍指示を停止します');
    const command = receiptCommand(canonicalJson(structuredClone(value)));
    ensure(
      ![
        ...(this.working.gameReceipts ?? []),
        ...(this.working.dayReceipts ?? []),
        ...(this.working.rosterReceipts ?? []),
      ].some((r) => r.commandId === command.commandId),
      '別の種類の指示IDは再使用できません',
    );
    ensure(
      this.pending === 0 ||
        this.working.tradeReceipts.some((r) => r.commandId === command.commandId),
      '未保存の試合指示があります。移籍確定の前に手動保存してください',
    );
    let attempted = false;
    this.busy = true;
    try {
      const result = await commitAcceptedTrade(
        command,
        createTradeApplicationPort({
          read: async () => structuredClone(this.working),
          commit: async (expected, candidate) => {
            attempted = true;
            await this.storage.commit(expected, candidate);
          },
        }),
      );
      if (result.status === 'committed') {
        this.working = structuredClone(result.snapshot);
        this.persisted = this.context(result.snapshot);
      }
      return result;
    } catch (error) {
      // 入力・承認の不成立と、保存を試みた後の成否不明を区別する。
      if (attempted) this.uncertain = true;
      throw error;
    } finally {
      this.busy = false;
    }
  }

  /** 全試合後の日次更新を、未保存試合指示と一緒にautoへ確定してから公開する。 */
  async completeDay(command: TradeDayCommand) {
    ensure(!this.busy && !this.uncertain, '保存中・成否不明です。再読込まで日次指示を停止します');
    const result = applyTradeDayCommand(this.working, command);
    if (result.status === 'replayed')
      return { status: 'replayed' as const, receipt: structuredClone(result.receipt) };
    integer(this.persisted.storageRevision, 1, Number.MAX_SAFE_INTEGER - 1, '日次保存版');
    const candidate = structuredClone(result.snapshot);
    candidate.storageRevision = this.persisted.storageRevision + 1;
    this.busy = true;
    try {
      await this.storage.commit(structuredClone(this.persisted), structuredClone(candidate));
      this.working = candidate;
      this.persisted = this.context(candidate);
      this.pending = 0;
      return { status: 'committed' as const, receipt: structuredClone(result.receipt) };
    } catch (error) {
      // 翌日候補はまだ公開しない。永続側で確定済みかは明示reloadで照合する。
      this.uncertain = true;
      throw error;
    } finally {
      this.busy = false;
    }
  }

  /** 呼出元が明示した再読込。未保存作業を破棄し、永続receiptから再送照合を再開する。 */
  async reload(): Promise<void> {
    ensure(!this.busy, '保存中は再読込できません');
    this.busy = true;
    try {
      const saved = await this.storage.read();
      validateTradeSavedState(saved);
      ensure(
        saved.localWorldId === this.persisted.localWorldId &&
          saved.worldId === this.persisted.worldId,
        '再読込先のプレイ・世界が異なります',
      );
      this.working = structuredClone(saved);
      this.persisted = this.context(saved);
      this.pending = 0;
      this.uncertain = false;
    } catch (error) {
      this.uncertain = true;
      throw error;
    } finally {
      this.busy = false;
    }
  }
}
