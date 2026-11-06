import { planTradeFinances } from './trade-finance.ts';
import { planTradeRosters } from './trade-roster.ts';
import type { TradeFinanceInput, TradeFinanceResult } from './trade-finance-types.ts';
import type { TradeRosterInput, TradeRosterResult } from './trade-roster-types.ts';

export interface TradeChangeSetInput {
  finance: TradeFinanceInput;
  /** 取引ID・時点・移動選手・2球団はfinanceから共有し、二重入力しない。 */
  roster: Omit<TradeRosterInput, 'transactionId' | 'effectiveAt' | 'clubIds' | 'moves'>;
}

export type TradeChangeSetResult = {
  modelVersion: 'trade-change-set-v1';
  transactionId: string;
} & (
  | {
      status: 'blocked';
      stage: 'roster';
      issues: Extract<TradeRosterResult, { status: 'blocked' }>['issues'];
    }
  | {
      status: 'blocked';
      stage: 'finance';
      blockers: Extract<TradeFinanceResult, { status: 'blocked' }>['blockers'];
    }
  | {
      status: 'ready';
      roster: Extract<TradeRosterResult, { status: 'ready' }>;
      finance: Extract<TradeFinanceResult, { status: 'ready' }>;
    }
);

/** 全検査が通った場合だけ両案を一緒に返す。Worker適用・交渉承認・DB保存は別工程。 */
export function planTradeChangeSet(input: TradeChangeSetInput): TradeChangeSetResult {
  const base = {
    modelVersion: 'trade-change-set-v1' as const,
    transactionId: input.finance.transactionId,
  };
  const roster = planTradeRosters({
    ...input.roster,
    transactionId: input.finance.transactionId,
    effectiveAt: input.finance.effectiveAt,
    clubIds: input.finance.clubIds,
    moves: input.finance.moves,
  });
  if (roster.status === 'blocked')
    return { ...base, status: 'blocked', stage: 'roster', issues: roster.issues };
  const finance = planTradeFinances(input.finance);
  if (finance.status === 'blocked')
    return { ...base, status: 'blocked', stage: 'finance', blockers: finance.blockers };
  return { ...base, status: 'ready', roster, finance };
}
