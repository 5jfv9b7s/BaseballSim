import { ensure, integer } from '../engine/validation.ts';
import type { TradeCommitContext } from '../recruitment/trade-commit.ts';
import type { TradeApplicationStorage } from './trade-application-port.ts';
import { validateTradeSavedState, type TradeSavedState } from './trade-save-validation.ts';
import {
  applyTradeGameCommand,
  MAX_GAME_COMMANDS_PER_SAVE,
  type TradeGameCommand,
} from './trade-game-commands.ts';

/**
 * 候補の作業状態を一つだけ所有する内部コーディネーター。通常Worker/UIへの登録は別工程。
 * executeは保存しない。明示したsaveManualだけが手動1枠を確定する。
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
