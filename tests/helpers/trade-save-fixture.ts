import {
  commitAcceptedTrade,
  type TradeCommitCommand,
} from '../../src/recruitment/trade-commit.ts';
import { createTradeApplicationPort } from '../../src/world/trade-application-port.ts';
import type { TradeSavedState } from '../../src/world/trade-save-validation.ts';
import { applicationFixture } from './trade-application-fixture.ts';

/** 0.56の架空会計fixtureを使う。ゲーム初期の契約・金額ではない。 */
export function tradeSaveFixture() {
  const f = applicationFixture();
  const initial: TradeSavedState = {
    localWorldId: 'test-trade-candidate',
    worldId: f.world.worldId,
    stateRevision: 2,
    storageRevision: 1,
    currentDate: f.world.currentDate,
    seasonId: f.world.initialDefinitions.seasonId,
    state: f.world,
    tradeReceipts: [],
  };
  f.world.tradeApprovals.push({
    approvalId: 'test-save-approval',
    acceptedStateRevision: 2,
    approvedForClubId: f.request.clubIds[0],
    acceptedAt: { ...f.world.rosterAsOf },
    validThrough: { date: f.world.currentDate, order: 10 },
    request: structuredClone(f.request),
    appliedTransactionId: null,
  });
  const command: TradeCommitCommand = {
    kind: 'commitAcceptedTrade',
    commandId: 'test-save-command',
    localWorldId: initial.localWorldId,
    worldId: initial.worldId,
    expectedStateRevision: initial.stateRevision,
    approvalId: 'test-save-approval',
  };
  return { ...f, initial, command };
}

export async function committedTradeSaveFixture() {
  const f = tradeSaveFixture();
  const result = await commitAcceptedTrade(
    f.command,
    createTradeApplicationPort({
      async read() {
        return structuredClone(f.initial);
      },
      async commit() {
        /* DBを使わない候補生成用。 */
      },
    }),
  );
  if (result.status !== 'committed') throw new Error('試験用の適用候補を作成できません');
  return { ...f, candidate: result.snapshot };
}
