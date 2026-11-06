import { compareMoments, requireFinance, validateMoment } from '../finance/validation.ts';
import { planTradeChangeSet } from '../recruitment/trade-change-set.ts';
import type {
  TradeCommitPort,
  TradeCommitSnapshot,
  TradeCommitContext,
} from '../recruitment/trade-commit.ts';
import type { TradeApplicationWorld } from './trade-application-types.ts';
import { applyWorldTrade, tradeApplicationInput } from './trade-application.ts';
import { sameTradeValue } from './trade-application-state.ts';

/** 新保存の実装が必要。現行v21のWorldStorageAdapterでは代用しない。 */
export interface TradeApplicationStorage {
  read(): Promise<TradeCommitSnapshot<TradeApplicationWorld>>;
  commit(
    expected: TradeCommitContext,
    candidate: TradeCommitSnapshot<TradeApplicationWorld>,
  ): Promise<void>;
}

/**
 * 0.55の確定境界を、実際の名簿・方針・個人状態を持つ候補へ接続する。
 * 保存portの実装、承認の生成と通常Workerへの公開は別工程。
 */
export function createTradeApplicationPort(
  storage: TradeApplicationStorage,
): TradeCommitPort<TradeApplicationWorld> {
  return {
    read: () => storage.read(),
    acceptedTrade(snapshot, approvalId) {
      const world = snapshot.state;
      requireFinance(
        snapshot.worldId === world.worldId &&
          snapshot.currentDate === world.currentDate &&
          snapshot.seasonId === world.initialDefinitions.seasonId,
        '保存ルートと移籍適用候補の世界・日付が異なります',
      );
      const records = world.tradeApprovals.filter((a) => a.approvalId === approvalId);
      requireFinance(records.length <= 1, '内部適用承認IDが重複しています');
      const approval = records[0];
      if (!approval || approval.appliedTransactionId !== null) return null;
      validateMoment(approval.acceptedAt);
      validateMoment(approval.validThrough);
      const controlled = world.initialDefinitions.squads.find(
        (s) => s.squadId === world.management.controlledSquadId,
      );
      const at = approval.request.effectiveAt;
      requireFinance(
        controlled?.team.clubId === approval.approvedForClubId &&
          approval.request.clubIds.includes(approval.approvedForClubId),
        '担当球団の権限と内部適用承認が一致しません',
      );
      requireFinance(
        compareMoments(approval.acceptedAt, at) <= 0 &&
          compareMoments(at, approval.validThrough) <= 0,
        '内部適用承認の有効期間外です',
      );
      return {
        approvalId,
        stateRevision: approval.acceptedStateRevision,
        input: tradeApplicationInput(world, approval.request),
      };
    },
    applyChanges(world, plan) {
      const approvals = world.tradeApprovals.filter(
        (a) => a.request.transactionId === plan.transactionId,
      );
      requireFinance(
        approvals.length === 1 && approvals[0]!.appliedTransactionId === null,
        '適用する取引の内部承認を一意に参照できません',
      );
      const approval = approvals[0]!;
      // 審査した案と現在候補の入力を結び、別案をapplyChangesだけから適用しない。
      const fresh = planTradeChangeSet(tradeApplicationInput(world, approval.request));
      requireFinance(sameTradeValue(fresh, plan), '審査済み案と現在の変更案が異なります');
      const result = applyWorldTrade(world, approval.request);
      requireFinance(result.status === 'ready', '現在の状態では移籍案を反映できません');
      result.world.tradeApprovals.find(
        (a) => a.approvalId === approval.approvalId,
      )!.appliedTransactionId = plan.transactionId;
      return result.world;
    },
    commit: (expected, candidate) => storage.commit(expected, candidate),
  };
}
