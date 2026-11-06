import { ensure, integer, validateRng } from '../engine/validation.ts';
import { canonicalJson } from '../storage/codec.ts';
import {
  compareMoments,
  dateDays,
  financeId,
  uniqueFinanceIds,
  validateMoment,
} from '../finance/validation.ts';
import { validateTradeRegistrations } from '../recruitment/trade-roster-registration.ts';
import type { TradeCommitSnapshot, TradeCommitCommand } from '../recruitment/trade-commit.ts';
import { createPitchLearningWorld } from './engine.ts';
import { exactKeys } from './snapshot-codec.ts';
import { validateApplicationSalaries } from './trade-application-finance.ts';
import { tradeSquadRoster } from './trade-squad-roster.ts';
import { allWorldSquads } from './squads.ts';
import type { TradeApplicationWorld } from './trade-application-types.ts';
import type { RngState } from '../engine/types.ts';

import type { TradeGameReceipt } from './trade-game-commands.ts';
import { validateTradeGameJournal } from './trade-game-journal.ts';

export type TradeSavedState = TradeCommitSnapshot<TradeApplicationWorld> & {
  /** v2候補保存だけの指示履歴。v1では項目自体を持たない。 */
  gameReceipts?: TradeGameReceipt[];
};

export const TRADE_WORLD_KEYS = [
  'worldId',
  'seed',
  'currentDate',
  'dayPlan',
  'completedDates',
  'lastCompletedDate',
  'games',
  'contributions',
  'statApplicationMarkers',
  'stats',
  'version',
  'camp',
  'growth',
  'reliefControl',
  'fielderRest',
  'condition',
  'restControl',
  'physical',
  'management',
  'seasonSummary',
  'farmSummary',
  'gameLineups',
  'registration',
  'rosterControl',
  'initialDefinitions',
  'rosterAsOf',
  'playerFacts',
  'finance',
  'transactions',
  'tradeApprovals',
] satisfies (keyof TradeApplicationWorld)[];

function object(value: unknown, name: string): asserts value is Record<string, unknown> {
  ensure(value !== null && typeof value === 'object' && !Array.isArray(value), name + 'が不正です');
}

/** JSONの全枝を保ち、含まれる完全な乱数状態は版・word・消費数を検査する。 */
function validateRngTree(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  if ('algorithmVersion' in value && 'fullState' in value) validateRng(value as RngState);
  for (const child of Object.values(value)) validateRngTree(child);
}

/** 再送記録は保存内の指示そのものと照合する。指紋を認証署名とはみなさない。 */
export function receiptCommand(fingerprint: string): TradeCommitCommand {
  ensure(typeof fingerprint === 'string' && fingerprint.length <= 16384, '確定指紋が不正です');
  const value = JSON.parse(fingerprint) as TradeCommitCommand;
  exactKeys(
    value,
    ['kind', 'commandId', 'localWorldId', 'worldId', 'expectedStateRevision', 'approvalId'],
    '確定指示',
  );
  ensure(
    value.kind === 'commitAcceptedTrade' && canonicalJson(value) === fingerprint,
    '確定指紋の内容が不正です',
  );
  for (const id of [value.commandId, value.localWorldId, value.worldId, value.approvalId])
    financeId(id);
  integer(value.expectedStateRevision, 0, Number.MAX_SAFE_INTEGER - 1, '確定指示の状態版');
  return value;
}

/**
 * 内部候補の保存境界。モデル版、名簿/給与/承認/receiptの参照と完全なRNGを検査する。
 * 過去試合・日次成長の全再シミュレーションではなく、通常世界の再開許可でもない。
 */
export function validateTradeSavedState(value: unknown): asserts value is TradeSavedState {
  object(value, '候補保存');
  exactKeys(
    value,
    [
      'localWorldId',
      'worldId',
      'stateRevision',
      'storageRevision',
      'currentDate',
      'seasonId',
      'state',
      'tradeReceipts',
      ...(Object.hasOwn(value, 'gameReceipts') ? ['gameReceipts'] : []),
    ],
    '候補保存',
  );
  canonicalJson(value); // 未定義・非有限値・負のゼロ・非JSON・過度な深さを拒否。
  const saved = value as unknown as TradeSavedState;
  for (const id of [saved.localWorldId, saved.worldId, saved.seasonId]) financeId(id);
  integer(saved.stateRevision, 0, Number.MAX_SAFE_INTEGER, '候補の状態版');
  integer(saved.storageRevision, 1, Number.MAX_SAFE_INTEGER, '候補の保存版');
  dateDays(saved.currentDate);
  exactKeys(saved.state, TRADE_WORLD_KEYS, '移籍適用候補');
  const world = saved.state;
  ensure(
    world.version === 'trade-application-world-v1' &&
      world.worldId === saved.worldId &&
      world.currentDate === saved.currentDate &&
      world.initialDefinitions.seasonId === saved.seasonId,
    '候補保存の世界・日付・シーズンが一致しません',
  );
  ensure(
    world.initialDefinitions.version === 'world-definitions-v26',
    '候補の初期定義版が未対応です',
  );
  integer(world.seed, 1, 0xffffffff, '候補seed');
  // 現在名簿を初期名簿へ戻さず、保存内の初期設定だけを既存の構築時検査へ渡す。
  const baseline = createPitchLearningWorld(
    world.seed,
    world.management.controlledSquadId,
    structuredClone(world.initialDefinitions),
  );
  for (const key of [
    'camp',
    'growth',
    'reliefControl',
    'fielderRest',
    'condition',
    'restControl',
    'physical',
    'registration',
    'rosterControl',
    'management',
  ] as const) {
    object(world[key], key);
    ensure(world[key].version === baseline[key].version, key + 'のモデル版が未対応です');
  }
  ensure(
    world.finance.salaryModelVersion === 'salary-day-proration-v1',
    '候補の給与負担版が未対応です',
  );
  ensure(
    world.growth.modelId === 'daily-development' &&
      world.growth.schemaId === 'daily-development-state-v6',
    '成長状態のschemaが未対応です',
  );
  validateMoment(world.rosterAsOf);
  ensure(
    world.rosterAsOf.date === world.currentDate && world.dayPlan.date === world.currentDate,
    '候補の所属・日次基準が不一致です',
  );
  ensure(
    Array.isArray(world.dayPlan.gameIds) && Array.isArray(world.completedDates),
    '日次計画が不正です',
  );
  integer(world.dayPlan.cursor, 0, world.dayPlan.gameIds.length, '候補cursor');
  uniqueFinanceIds(world.dayPlan.gameIds, '日次試合ID');
  uniqueFinanceIds(world.completedDates, '日次完了日');
  for (const date of world.completedDates) {
    dateDays(date);
    ensure(date < world.currentDate, '未来の日次完了記録です');
  }
  if (world.lastCompletedDate !== null)
    ensure(world.lastCompletedDate === world.completedDates.at(-1), '最終完了日が不一致です');
  const definitions = world.initialDefinitions;
  const playerIds = definitions.squads.flatMap((s) => s.players.map((p) => p.playerId));
  const clubIds = definitions.squads.map((s) => s.team.clubId);
  ensure(Array.isArray(world.playerFacts), '選手資格の記録がありません');
  uniqueFinanceIds(
    world.playerFacts.map((p) => p.playerId),
    '選手資格ID',
  );
  ensure(
    world.playerFacts.length === playerIds.length &&
      world.playerFacts.every(
        (p) =>
          playerIds.includes(p.playerId) &&
          typeof p.canBat === 'boolean' &&
          typeof p.canPitch === 'boolean' &&
          ['subject', 'exempt'].includes(p.foreignBaseStatus),
      ),
    '全選手の資格と資料が一致しません',
  );
  for (const key of [
    'games',
    'contributions',
    'statApplicationMarkers',
    'stats',
    'gameLineups',
  ] as const)
    object(world[key], key);
  ensure(
    Array.isArray(world.registration.memberships) &&
      Array.isArray(world.registration.registrations),
    '所属・登録履歴が不正です',
  );
  uniqueFinanceIds(
    world.registration.memberships.map((m) => m.membershipId),
    '所属履歴ID',
  );
  for (const playerId of playerIds) {
    const history = world.registration.memberships
      .filter((m) => m.playerId === playerId)
      .sort((a, b) => compareMoments(a.from, b.from));
    ensure(history.filter((m) => m.until === null).length === 1, '現在所属が一意ではありません');
    for (let i = 0; i < history.length; i++) {
      const row = history[i]!;
      validateMoment(row.from);
      ensure(
        clubIds.includes(row.clubId) && ['initial', 'trade'].includes(row.entryReason),
        '所属履歴の参照・理由が不正です',
      );
      if (row.until !== null) {
        validateMoment(row.until);
        ensure(compareMoments(row.from, row.until) < 0, '所属期間が不正です');
      } else ensure(compareMoments(row.from, world.rosterAsOf) <= 0, '未来の現在所属です');
      if (i)
        ensure(
          history[i - 1]!.until !== null && compareMoments(history[i - 1]!.until!, row.from) <= 0,
          '所属期間が重複しています',
        );
    }
  }
  ensure(
    world.registration.memberships.every((m) => playerIds.includes(m.playerId)),
    '所属履歴に不明な選手がいます',
  );
  validateTradeRegistrations(world.registration.registrations, world.registration.memberships);
  ensure(
    world.registration.registrations.every(
      (r) => r.until !== null || compareMoments(r.from, world.rosterAsOf) <= 0,
    ),
    '未来の現在登録です',
  );
  const rules = definitions.registrationRules!;
  for (const clubId of clubIds) {
    const members = world.registration.memberships.filter(
      (m) => m.clubId === clubId && m.until === null,
    );
    const first = world.registration.registrations.filter(
      (r) => r.clubId === clubId && r.until === null && r.category === 'first',
    );
    ensure(
      members.length <= rules.clubLimit &&
        first.length <= rules.firstLimit &&
        first.filter(
          (r) =>
            world.playerFacts.find((p) => p.playerId === r.playerId)?.foreignBaseStatus ===
            'subject',
        ).length <= rules.foreignFirstLimit,
      '候補の所属・一軍・外国人登録枠を超えています',
    );
  }
  validateApplicationSalaries(world.finance, playerIds, saved.seasonId, saved.currentDate);
  uniqueFinanceIds(
    world.finance.budgets.map((b) => b.clubId),
    '予算の球団ID',
  );
  ensure(
    world.finance.budgets.length === clubIds.length &&
      world.finance.budgets.every(
        (b) => clubIds.includes(b.clubId) && b.seasonId === saved.seasonId,
      ),
    '全球団の予算記録が不正です',
  );
  for (const key of ['physical', 'condition'] as const) {
    exactKeys(world[key].players, playerIds, key + 'の全選手');
    for (const row of Object.values(world[key].players)) {
      if ('energyMilli' in row) {
        integer(row.energyMilli, 0, 100000, '体力');
        integer(row.fatigueMilli, 0, 100000, '疲労');
      } else integer(row.conditionMilli, 0, 100000, '調子');
    }
  }
  object(world.growth.state.days, '成長履歴');
  for (const [date, day] of Object.entries(world.growth.state.days)) {
    dateDays(date);
    ensure(day.date === date && date <= world.currentDate, '成長履歴の日付が不一致です');
  }
  for (const [gameId, game] of Object.entries(world.games))
    ensure(game.state.gameId === gameId, '試合原記録のIDが不一致です');
  for (const squad of allWorldSquads(definitions)) {
    tradeSquadRoster(world, squad.squadId);
    integer(world.management.policyRevisions[squad.squadId]!, 0, Number.MAX_SAFE_INTEGER, '編成版');
  }
  ensure(
    Array.isArray(world.transactions) &&
      Array.isArray(world.tradeApprovals) &&
      Array.isArray(saved.tradeReceipts),
    '取引・承認・確定記録が不正です',
  );
  uniqueFinanceIds(
    world.transactions.map((t) => t.transactionId),
    '適用済み取引ID',
  );
  uniqueFinanceIds(
    world.tradeApprovals.map((a) => a.approvalId),
    '内部適用承認ID',
  );
  uniqueFinanceIds(
    saved.tradeReceipts.map((r) => r.commandId),
    '確定指示ID',
  );
  uniqueFinanceIds(
    saved.tradeReceipts.map((r) => r.transactionId),
    '確定取引ID',
  );
  ensure(
    saved.tradeReceipts.length === world.transactions.length,
    '取引と確定記録の件数が不一致です',
  );

  uniqueFinanceIds(
    world.tradeApprovals.map((a) => a.request.transactionId),
    '内部承認の取引ID',
  );
  for (const transaction of world.transactions) {
    exactKeys(
      transaction,
      [
        'models',
        'transactionId',
        'appliedAt',
        'playerMoves',
        'rosterAudit',
        'salaryReallocations',
        'cashObligationId',
      ],
      '取引監査',
    );
    exactKeys(transaction.models, ['application', 'roster', 'finance'], '取引モデル');
    ensure(
      transaction.models.application === 'trade-application-world-v1' &&
        transaction.models.roster === 'trade-roster-plan-v1' &&
        transaction.models.finance === 'trade-finance-plan-v1',
      '取引のモデル版が未対応です',
    );
    validateMoment(transaction.appliedAt);
    ensure(
      compareMoments(transaction.appliedAt, world.rosterAsOf) <= 0 &&
        Array.isArray(transaction.playerMoves) &&
        transaction.playerMoves.length > 0,
      '取引の適用時点・移動選手が不正です',
    );
    uniqueFinanceIds(
      transaction.playerMoves.map((m) => m.playerId),
      '取引内選手ID',
    );
    for (const move of transaction.playerMoves)
      ensure(
        playerIds.includes(move.playerId) &&
          move.reason === 'trade' &&
          clubIds.includes(move.fromClubId) &&
          clubIds.includes(move.toClubId) &&
          move.fromClubId !== move.toClubId &&
          compareMoments(move.effectiveAt, transaction.appliedAt) === 0 &&
          world.registration.memberships.some(
            (m) =>
              m.playerId === move.playerId &&
              m.clubId === move.toClubId &&
              m.sourceTransactionId === transaction.transactionId &&
              compareMoments(m.from, transaction.appliedAt) === 0,
          ),
        '取引と所属履歴が一致しません',
      );
    if (transaction.cashObligationId !== null)
      ensure(
        world.finance.ledger.obligations.some(
          (o) => o.obligationId === transaction.cashObligationId && o.kind === 'trade',
        ),
        '取引の金銭債務がありません',
      );
  }
  let previousRevision = -1;
  for (const receipt of saved.tradeReceipts) {
    exactKeys(
      receipt,
      ['commandId', 'fingerprint', 'approvalId', 'transactionId', 'committedStateRevision'],
      '確定記録',
    );
    const command = receiptCommand(receipt.fingerprint);
    integer(receipt.committedStateRevision, 1, saved.stateRevision, '確定状態版');
    ensure(
      receipt.committedStateRevision > previousRevision &&
        receipt.committedStateRevision === command.expectedStateRevision + 1 &&
        command.commandId === receipt.commandId &&
        command.approvalId === receipt.approvalId &&
        command.localWorldId === saved.localWorldId &&
        command.worldId === saved.worldId,
      '確定記録と指示が一致しません',
    );
    const transaction = world.transactions.find((t) => t.transactionId === receipt.transactionId);
    const approval = world.tradeApprovals.find((a) => a.approvalId === receipt.approvalId);
    ensure(
      transaction &&
        approval &&
        approval.appliedTransactionId === transaction.transactionId &&
        approval.request.transactionId === transaction.transactionId &&
        approval.acceptedStateRevision === command.expectedStateRevision,
      '確定記録の取引・承認参照が不一致です',
    );
    previousRevision = receipt.committedStateRevision;
  }
  for (const approval of world.tradeApprovals) {
    exactKeys(
      approval,
      [
        'approvalId',
        'acceptedStateRevision',
        'approvedForClubId',
        'acceptedAt',
        'validThrough',
        'request',
        'appliedTransactionId',
      ],
      '内部適用承認',
    );
    validateMoment(approval.acceptedAt);
    validateMoment(approval.validThrough);
    exactKeys(
      approval.request,
      [
        'transactionId',
        'effectiveAt',
        'clubIds',
        'moves',
        'cashTransfer',
        'choices',
        'squadReplacements',
      ],
      '承認済み条件',
    );
    validateMoment(approval.request.effectiveAt);
    integer(approval.acceptedStateRevision, 0, saved.stateRevision, '承認状態版');
    ensure(
      clubIds.includes(approval.approvedForClubId) &&
        compareMoments(approval.acceptedAt, approval.validThrough) <= 0,
      '承認の球団・期間が不正です',
    );
    if (approval.appliedTransactionId !== null)
      ensure(
        saved.tradeReceipts.some(
          (r) =>
            r.approvalId === approval.approvalId &&
            r.transactionId === approval.appliedTransactionId,
        ),
        '適用済み承認の確定記録がありません',
      );
  }
  validateTradeGameJournal(saved);
  validateRngTree(world);
}
