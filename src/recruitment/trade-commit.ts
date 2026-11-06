import { canonicalJson } from '../storage/codec.ts';
import { financeId, requireFinance } from '../finance/validation.ts';
import {
  planTradeChangeSet,
  type TradeChangeSetInput,
  type TradeChangeSetResult,
} from './trade-change-set.ts';

export interface TradeCommitCommand {
  kind: 'commitAcceptedTrade';
  commandId: string;
  localWorldId: string;
  worldId: string;
  expectedStateRevision: number;
  approvalId: string;
}

export interface TradeCommitContext {
  localWorldId: string;
  worldId: string;
  stateRevision: number;
  storageRevision: number;
}

/** 発生元に残す永続記録。一時的なWorkerのMapだけでは代用しない。 */
export interface TradeCommitReceipt {
  commandId: string;
  fingerprint: string;
  approvalId: string;
  transactionId: string;
  committedStateRevision: number;
}

/** 新世界の全保存ルートを包む境界。現行v21の保存へ渡してはならない。 */
export interface TradeCommitSnapshot<State> extends TradeCommitContext {
  currentDate: string;
  seasonId: string;
  state: State;
  tradeReceipts: TradeCommitReceipt[];
}

type ReadyTrade = Extract<TradeChangeSetResult, { status: 'ready' }>;

export interface AcceptedTrade {
  approvalId: string;
  /** 承認後に編成・会計等が変わった場合は再審査を要求する。 */
  stateRevision: number;
  input: TradeChangeSetInput;
}

export interface TradeCommitPort<State> {
  /** 現行作業状態と永続した発生元を読む。Workerの直列キューから呼ぶ。 */
  read(): Promise<TradeCommitSnapshot<State>>;
  /** 保存内の承認・権限・期限・条件を照合。UIのacceptedフラグを受理しない。 */
  acceptedTrade(snapshot: TradeCommitSnapshot<State>, approvalId: string): AcceptedTrade | null;
  /** 分離された候補だけを変更。原記録・RNG等を保持するのは新世界adapterの責務。 */
  applyChanges(state: State, plan: ReadyTrade): State;
  /**
   * 全状態とreceiptを同一トランザクションへ保存し、両revisionを比較してから確定。
   * 正本を公開しない。保存後の任意整理は成否に混ぜない。
   * abortまたは成否不明でreject。成否不明の場合は他の更新を止め、
   * 再読込・同一指示の再送で永続receiptを照合してから再開する。
   */
  commit(expected: TradeCommitContext, candidate: TradeCommitSnapshot<State>): Promise<void>;
}

export type TradeCommitResult<State> = { modelVersion: 'trade-commit-v1' } & (
  | { status: 'blocked'; reason: 'approvalRequired' | 'approvalChanged' }
  | {
      status: 'blocked';
      reason: 'conditions';
      details: Extract<TradeChangeSetResult, { status: 'blocked' }>;
    }
  | { status: 'replayed'; receipt: TradeCommitReceipt }
  | { status: 'committed'; receipt: TradeCommitReceipt; snapshot: TradeCommitSnapshot<State> }
);

function revision(value: number): void {
  requireFinance(
    Number.isSafeInteger(value) && value >= 0,
    'トレード確定の状態版・保存版が不正です',
  );
}

/**
 * 保存成功後だけ候補を返す。現行Workerへは未接続。
 * 呼出元はcommittedだけを正本へ公開し、失敗・blockedでは現行状態を保持する。
 */
export async function commitAcceptedTrade<State>(
  command: TradeCommitCommand,
  port: TradeCommitPort<State>,
): Promise<TradeCommitResult<State>> {
  // await中に呼出元が指示を書き換えても、指紋と適用条件を分離させない。
  command = structuredClone(command);
  requireFinance(command?.kind === 'commitAcceptedTrade', 'トレード確定指示が不正です');
  for (const value of [
    command.commandId,
    command.localWorldId,
    command.worldId,
    command.approvalId,
  ])
    financeId(value);
  revision(command.expectedStateRevision);
  const fingerprint = canonicalJson(command);
  const snapshot = structuredClone(await port.read());
  revision(snapshot.stateRevision);
  revision(snapshot.storageRevision);
  requireFinance(
    command.localWorldId === snapshot.localWorldId && command.worldId === snapshot.worldId,
    '別プレイ・別世界へのトレード指示です',
  );
  const prior = snapshot.tradeReceipts.filter((r) => r.commandId === command.commandId);
  requireFinance(prior.length <= 1, 'トレードの確定記録が重複しています');
  // 同一入力の再送は古いrevisionでも既存結果を返す。状態を過去へ戻さない。
  if (prior.length) {
    requireFinance(prior[0]!.fingerprint === fingerprint, '同じトレード指示IDの内容が異なります');
    return {
      modelVersion: 'trade-commit-v1',
      status: 'replayed',
      receipt: structuredClone(prior[0]!),
    };
  }
  requireFinance(
    command.expectedStateRevision === snapshot.stateRevision,
    '古い状態へのトレード指示です',
  );
  requireFinance(
    !snapshot.tradeReceipts.some((r) => r.approvalId === command.approvalId),
    'この承認済みトレードは既に適用されています',
  );

  const accepted = port.acceptedTrade(structuredClone(snapshot), command.approvalId);
  if (!accepted)
    return { modelVersion: 'trade-commit-v1', status: 'blocked', reason: 'approvalRequired' };
  requireFinance(accepted.approvalId === command.approvalId, '承認の参照先が異なります');
  if (accepted.stateRevision !== snapshot.stateRevision)
    return { modelVersion: 'trade-commit-v1', status: 'blocked', reason: 'approvalChanged' };
  const input = structuredClone(accepted.input);
  requireFinance(
    input.finance.effectiveAt.date === snapshot.currentDate &&
      input.finance.seasonId === snapshot.seasonId,
    '承認済み取引の日付・シーズンが現行状態と異なります',
  );
  requireFinance(
    !snapshot.tradeReceipts.some((r) => r.transactionId === input.finance.transactionId),
    '同じ取引は既に適用されています',
  );
  const plan = planTradeChangeSet(input);
  if (plan.status === 'blocked')
    return {
      modelVersion: 'trade-commit-v1',
      status: 'blocked',
      reason: 'conditions',
      details: plan,
    };

  requireFinance(
    snapshot.stateRevision < Number.MAX_SAFE_INTEGER &&
      snapshot.storageRevision < Number.MAX_SAFE_INTEGER,
    '状態版・保存版を増やせる範囲を超えます',
  );
  const receipt: TradeCommitReceipt = {
    commandId: command.commandId,
    fingerprint,
    approvalId: command.approvalId,
    transactionId: plan.transactionId,
    committedStateRevision: snapshot.stateRevision + 1,
  };
  const candidate: TradeCommitSnapshot<State> = {
    ...snapshot,
    stateRevision: snapshot.stateRevision + 1,
    storageRevision: snapshot.storageRevision + 1,
    state: port.applyChanges(structuredClone(snapshot.state), plan),
    tradeReceipts: [...snapshot.tradeReceipts, receipt],
  };
  const expected: TradeCommitContext = {
    localWorldId: snapshot.localWorldId,
    worldId: snapshot.worldId,
    stateRevision: snapshot.stateRevision,
    storageRevision: snapshot.storageRevision,
  };
  // portへ渡す値と返却値も分離し、非同期保存中の共有参照を残さない。
  await port.commit(expected, structuredClone(candidate));
  return {
    modelVersion: 'trade-commit-v1',
    status: 'committed',
    receipt: structuredClone(receipt),
    snapshot: candidate,
  };
}
