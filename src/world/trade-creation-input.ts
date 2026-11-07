import { ensure, integer } from '../engine/validation.ts';
import { canonicalJson, sha256 } from '../storage/codec.ts';
import {
  compareMoments,
  validateMoment,
  validateCashEntries,
  validateObligations,
  uniqueFinanceIds,
} from '../finance/validation.ts';
import { calculateBudget } from '../finance/budget.ts';
import { exactKeys } from './snapshot-codec.ts';
import { createTradeApplicationWorld } from './trade-application-state.ts';
import { validateTradeSavedState } from './trade-save-validation.ts';
import { tradePlayView } from './trade-play-view.ts';
import {
  TRADE_INITIAL_INPUT_FORMAT,
  MAX_TRADE_INITIAL_INPUT_BYTES,
} from './trade-creation-types.ts';
import type { TradeCreationSourceRef, TradeCreationSummary } from './trade-creation-types.ts';
import type { TradeSourceWorld, TradeApplicationFinance } from './trade-application-types.ts';
import type { FinanceMoment } from '../finance/types.ts';
import type { TradeRosterPlayer } from '../recruitment/trade-roster-types.ts';
import type { TradeSavedState } from './trade-save-validation.ts';

function fields(value: unknown, required: string[], optional: string[], label: string) {
  ensure(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    label + 'が不正です',
  );
  exactKeys(value, [...required, ...optional.filter((key) => Object.hasOwn(value, key))], label);
}
function rows(value: unknown, label: string): asserts value is Record<string, unknown>[] {
  ensure(Array.isArray(value) && value.length <= 20000, label + 'の配列が不正です');
  ensure(
    value.every((row) => row !== null && typeof row === 'object' && !Array.isArray(row)),
    label + 'に不正な行があります',
  );
}
export function requireTradeCreationSource(source: TradeSourceWorld) {
  ensure(source.version === 'world-prototype-v21', '新規候補の元保存は世界v21に対応します');
  ensure(
    source.currentDate >= source.definitions.startDate &&
      source.currentDate <= source.definitions.endDate &&
      source.dayPlan.cursor === 0 &&
      !source.definitions.schedule.some(
        (g) => g.date === source.currentDate && source.games[g.gameId],
      ),
    '候補の作成は対象期間の当日全試合開始前の保存から行ってください',
  );
}

/** nullは未入力の下書き印。既定の金額・投打役割・資格・承認は生成しない。 */
export function tradeCreationTemplate(source: TradeSourceWorld, ref: TradeCreationSourceRef) {
  requireTradeCreationSource(source);
  return (
    JSON.stringify(
      {
        format: TRADE_INITIAL_INPUT_FORMAT,
        source: {
          ...ref,
          worldId: source.worldId,
          seasonId: source.definitions.seasonId,
          currentDate: source.currentDate,
        },
        asOf: { date: source.currentDate, order: null },
        playerFacts: source.definitions.squads.flatMap((s) =>
          s.players.map((p) => ({
            playerId: p.playerId,
            label: p.familyName + ' ' + p.givenName,
            canBat: null,
            canPitch: null,
            foreignBaseStatus: null,
          })),
        ),
        finance: {
          salaryModelVersion: 'salary-day-proration-v1',
          contractYears: source.definitions.squads.flatMap((s) =>
            s.players.map((p) => ({
              playerId: p.playerId,
              year: {
                contractId: null,
                seasonId: source.definitions.seasonId,
                salaryYen: null,
                guaranteed: null,
                applicableFrom: null,
                applicableUntil: null,
              },
            })),
          ),
          ledger: { cashEntries: null, obligations: null },
          budgets: source.definitions.squads.map((s) => ({
            clubId: s.team.clubId,
            seasonId: source.definitions.seasonId,
            openingBalance: null,
            holds: null,
            futureSeasons: null,
          })),
        },
      },
      null,
      2,
    ) + '\n'
  );
}

/** 外部ファイルの未入力箇所はまとめて返し、完全な案だけを候補へ構成する。 */
export async function inspectTradeCreationInput(
  source: TradeSourceWorld,
  ref: TradeCreationSourceRef,
  inputText: string,
  creationId: string,
) {
  requireTradeCreationSource(source);
  ensure(
    new TextEncoder().encode(inputText).length <= MAX_TRADE_INITIAL_INPUT_BYTES,
    '初期入力ファイルは2MiB以下にしてください',
  );
  const value = JSON.parse(inputText) as Record<string, unknown>;
  canonicalJson(value);
  fields(value, ['format', 'source', 'asOf', 'playerFacts', 'finance'], [], '初期入力');
  ensure(value.format === TRADE_INITIAL_INPUT_FORMAT, '未対応の初期入力形式です');
  fields(
    value.source,
    [
      'localWorldId',
      'slotKind',
      'snapshotId',
      'storageRevision',
      'worldId',
      'seasonId',
      'currentDate',
    ],
    [],
    '元保存の参照',
  );
  ensure(
    canonicalJson(value.source) ===
      canonicalJson({
        ...ref,
        worldId: source.worldId,
        seasonId: source.definitions.seasonId,
        currentDate: source.currentDate,
      }),
    '入力ファイルの元保存・版・日付が異なります。ひな型を取得し直してください',
  );
  const missing: { path: string; message: string }[] = [];
  let issueCount = 0;
  function scan(child: unknown, path: string) {
    if (child === null) {
      issueCount++;
      if (missing.length < 100)
        missing.push({
          path,
          message: '未入力です。0や空配列ではなく、根拠のある値を入力してください。',
        });
    } else if (child && typeof child === 'object')
      for (const [key, item] of Object.entries(child)) scan(item, path + '/' + key);
  }
  scan(value.asOf, '/asOf');
  scan(value.playerFacts, '/playerFacts');
  scan(value.finance, '/finance');
  if (issueCount) return { status: 'blocked' as const, issues: missing, issueCount };
  fields(value.asOf, ['date', 'order'], [], '所属基準');
  const asOf = value.asOf as FinanceMoment;
  validateMoment(asOf);
  ensure(asOf.date === source.currentDate, '所属基準日が元保存と異なります');
  rows(value.playerFacts, '選手資格');
  const playerFacts = value.playerFacts.map((row): TradeRosterPlayer => {
    fields(row, ['playerId', 'label', 'canBat', 'canPitch', 'foreignBaseStatus'], [], '選手資格');
    ensure(typeof row.label === 'string' && row.label.length <= 200, '選手の参照ラベルが不正です');
    return {
      playerId: row.playerId as string,
      canBat: row.canBat as boolean,
      canPitch: row.canPitch as boolean,
      foreignBaseStatus: row.foreignBaseStatus as TradeRosterPlayer['foreignBaseStatus'],
    };
  });
  fields(
    value.finance,
    ['salaryModelVersion', 'contractYears', 'ledger', 'budgets'],
    [],
    '初期会計',
  );
  const finance = value.finance as unknown as TradeApplicationFinance;
  rows(finance.contractYears, '契約年度');
  for (const row of finance.contractYears) {
    fields(row, ['playerId', 'year'], [], '契約年度');
    fields(
      row.year,
      ['contractId', 'seasonId', 'salaryYen', 'guaranteed', 'applicableFrom', 'applicableUntil'],
      [],
      '年度契約',
    );
  }
  fields(finance.ledger, ['cashEntries', 'obligations'], [], '会計台帳');
  rows(finance.ledger.cashEntries, '現金明細');
  rows(finance.ledger.obligations, '債務');
  for (const row of finance.ledger.cashEntries) {
    fields(
      row,
      [
        'cashEntryId',
        'clubId',
        'bookedAt',
        'seasonId',
        'category',
        'signedAmountYen',
        'sourceKey',
        'settlementGroupId',
      ],
      ['obligationId', 'counterpartyClubId'],
      '現金明細',
    );
    fields(row.bookedAt, ['date', 'order'], [], '入出金時点');
    ensure(compareMoments(row.bookedAt, asOf) <= 0, '未来の入出金を初期現金明細へ入れられません');
  }
  for (const row of finance.ledger.obligations) {
    fields(
      row,
      [
        'obligationId',
        'seasonId',
        'payerClubId',
        'payeeRef',
        'kind',
        'amountYen',
        'settledYen',
        'guaranteed',
        'sourceKey',
        'dueDate',
        'status',
      ],
      ['contractYearRef', 'coverageFrom', 'coverageUntil'],
      '債務',
    );
    fields(row.payeeRef, ['kind', 'id'], [], '債務の受取先');
    if (row.contractYearRef)
      fields(row.contractYearRef, ['contractId', 'seasonId'], [], '給与契約の参照');
  }
  validateCashEntries(finance.ledger.cashEntries);
  validateObligations(finance.ledger.obligations);
  const clubs = source.definitions.squads.map((s) => s.team.clubId),
    players = playerFacts.map((p) => p.playerId);
  ensure(
    finance.ledger.cashEntries.every(
      (e) =>
        clubs.includes(e.clubId) &&
        (!e.counterpartyClubId || clubs.includes(e.counterpartyClubId)) &&
        (!e.obligationId ||
          finance.ledger.obligations.some((o) => o.obligationId === e.obligationId)),
    ),
    '現金明細に存在しない球団・債務参照があります',
  );
  ensure(
    finance.ledger.obligations.every(
      (o) =>
        clubs.includes(o.payerClubId) &&
        (o.payeeRef.kind === 'club' ? clubs : players).includes(o.payeeRef.id),
    ),
    '債務に存在しない球団・受取先があります',
  );
  rows(finance.budgets, '球団予算');
  const budgets = finance.budgets.map((budget) => {
    fields(
      budget,
      ['clubId', 'seasonId', 'openingBalance', 'holds', 'futureSeasons'],
      [],
      '球団予算',
    );
    fields(budget.openingBalance, ['balanceYen', 'closedThrough'], [], '確定残高');
    fields(budget.openingBalance!.closedThrough, ['date', 'order'], [], '残高の確定時点');
    ensure(
      compareMoments(budget.openingBalance!.closedThrough, asOf) <= 0,
      '未来の確定残高は初期入力に使用できません',
    );
    rows(budget.holds, '仮確保');
    rows(budget.futureSeasons, '将来年度');
    for (const hold of budget.holds!) {
      fields(
        hold,
        [
          'holdId',
          'clubId',
          'seasonId',
          'sourceKey',
          'amountYen',
          'status',
          'replacedByObligationIds',
        ],
        [],
        '仮確保',
      );
      ensure(hold.clubId === budget.clubId, '別球団の仮確保が混在しています');
    }
    for (const season of budget.futureSeasons!)
      fields(
        season,
        ['seasonId', 'guaranteedIncomeYen', 'minimumReplenishmentYen'],
        [],
        '将来年度',
      );
    const result = calculateBudget({ ...budget, ...finance.ledger });
    ensure(
      result.status === 'known',
      result.status === 'unknown' ? result.reasons.join(' ') : '予算が不明です',
    );
    return {
      clubId: budget.clubId,
      name:
        source.definitions.squads.find((s) => s.team.clubId === budget.clubId)?.team.name ??
        budget.clubId,
      cashYen: result.cashYen,
      availableYen: result.availableYen,
    };
  });
  uniqueFinanceIds(
    budgets.map((b) => b.clubId),
    '初期予算の球団',
  );
  uniqueFinanceIds(
    finance.budgets.flatMap((b) => b.holds!.map((h) => h.holdId)),
    '全仮確保ID',
  );
  const state = createTradeApplicationWorld(source, { asOf, playerFacts, finance, approvals: [] });
  const saved: TradeSavedState = {
    localWorldId: 'trade-create-' + creationId,
    worldId: source.worldId,
    stateRevision: 0,
    storageRevision: 1,
    currentDate: source.currentDate,
    seasonId: source.definitions.seasonId,
    state,
    tradeReceipts: [],
    gameReceipts: [],
    dayReceipts: [],
    rosterReceipts: [],
  };
  validateTradeSavedState(saved);
  tradePlayView({ snapshot: saved, pendingCommands: 0, saving: false, reloadRequired: false });
  const summary: TradeCreationSummary = {
    date: saved.currentDate,
    seasonId: saved.seasonId,
    controlledClub: source.definitions.squads.find(
      (s) => s.squadId === source.management.controlledSquadId,
    )!.team.name,
    playerCount: playerFacts.length,
    clubCount: budgets.length,
    contractCount: finance.contractYears.length,
    budgets,
  };
  integer(saved.stateRevision, 0, 0, '新規候補の状態版');
  return {
    status: 'ready' as const,
    saved,
    summary,
    fingerprint: await sha256(canonicalJson({ source: ref, input: value })),
  };
}
