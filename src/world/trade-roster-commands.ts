import { ensure, integer } from '../engine/validation.ts';
import { dateDays, financeId, uniqueFinanceIds } from '../finance/validation.ts';
import { canonicalJson } from '../storage/codec.ts';
import { exactKeys } from './snapshot-codec.ts';
import {
  planTradeRegistrationChanges,
  requireTradeRosterEditable,
  tradeRosterCommandSource,
  type TradeRegistrationAudit,
  type TradeRegistrationChange,
} from './trade-registration.ts';
import {
  reconcileTradeRosterClub,
  setTradeRosterPolicy,
  type TradeRosterReconciliation,
} from './trade-roster-policy.ts';
import type { TradeSquadPlan } from '../recruitment/trade-roster-types.ts';
import type { RosterPolicyInput } from './roster-policy-types.ts';
import type { FinanceMoment } from '../finance/types.ts';
import type { TradeSavedState } from './trade-save-validation.ts';

interface Context {
  commandId: string;
  localWorldId: string;
  worldId: string;
  expectedStateRevision: number;
  expectedDate: string;
  clubId: string;
}
export type TradeRosterCommand = Context &
  (
    | {
        kind: 'setTradeRegistrations';
        changes: TradeRegistrationChange[];
        squadReplacements: TradeSquadPlan[];
      }
    | ({ kind: 'setTradeRosterPolicy' } & RosterPolicyInput)
  );
export interface TradeRosterReceipt {
  modelVersion: 'trade-roster-commands-v1';
  commandId: string;
  fingerprint: string;
  committedStateRevision: number;
  appliedAt: FinanceMoment;
  audit: TradeRegistrationAudit;
  reconciliation: TradeRosterReconciliation | null;
}

/** 受信形と容量を先に限定し、編成の制度・役割の検査は純粋審査へ渡す。 */
function parseSquad(squad: TradeSquadPlan): void {
  exactKeys(
    squad,
    [
      'squadId',
      'clubId',
      'category',
      'benchLimit',
      'lineup',
      'pitchers',
      'individualRest',
      'conditionalRelief',
    ],
    '登録変更の編成',
  );
  financeId(squad.squadId);
  financeId(squad.clubId);
  ensure(['first', 'farm'].includes(squad.category), '編成の区分が不正です');
  integer(squad.benchLimit, 10, 70, '編成のベンチ上限');
  exactKeys(squad.lineup, ['battingOrder', 'defense', 'dhEnabled'], '登録変更の打順');
  ensure(
    squad.lineup.dhEnabled === true &&
      Array.isArray(squad.lineup.battingOrder) &&
      squad.lineup.battingOrder.length === 9 &&
      Array.isArray(squad.lineup.defense) &&
      squad.lineup.defense.length === 9,
    'DH制の9打順・守備枠を指定してください',
  );
  for (const slot of squad.lineup.battingOrder) {
    exactKeys(slot, ['slotNo', 'playerId', 'battingRole'], '打順枠');
    integer(slot.slotNo, 1, 9, '打順番号');
    if (slot.playerId !== null) financeId(slot.playerId);
  }
  for (const slot of squad.lineup.defense) {
    exactKeys(slot, ['positionCode', 'playerId'], '守備枠');
    if (slot.playerId !== null) financeId(slot.playerId);
  }
  exactKeys(squad.pitchers, ['rotationSlots', 'nextSlotNo', 'reliefRoles'], '登録変更の投手運用');
  ensure(
    Array.isArray(squad.pitchers.rotationSlots) &&
      squad.pitchers.rotationSlots.length <= 6 &&
      Array.isArray(squad.pitchers.reliefRoles) &&
      squad.pitchers.reliefRoles.length <= 70,
    '投手運用の配列が不正です',
  );
  for (const slot of squad.pitchers.rotationSlots) {
    exactKeys(slot, ['slotNo', 'playerId'], '先発枠');
    integer(slot.slotNo, 1, 6, '先発枠番号');
    if (slot.playerId !== null) financeId(slot.playerId);
  }
  for (const role of squad.pitchers.reliefRoles) {
    exactKeys(role, ['playerId', 'role', 'priority'], '通常救援');
    financeId(role.playerId);
  }
  ensure(
    Array.isArray(squad.individualRest) &&
      squad.individualRest.length <= 70 &&
      Array.isArray(squad.conditionalRelief) &&
      squad.conditionalRelief.length <= 350,
    '個別休養・条件別救援が不正です',
  );
  for (const rest of squad.individualRest) {
    exactKeys(rest, ['playerId', 'mode', ...(rest.mode === 'custom' ? ['rules'] : [])], '個別休養');
    financeId(rest.playerId);
  }
  for (const role of squad.conditionalRelief) {
    exactKeys(role, ['playerId', 'role', 'priority', 'conditions'], '条件別救援');
    financeId(role.playerId);
    exactKeys(
      role.conditions,
      ['startInning', 'endInning', 'scoreStates', 'minScoreDifference', 'maxScoreDifference'],
      '救援条件',
    );
  }
}

export function parseTradeRosterCommand(value: unknown): TradeRosterCommand {
  ensure(value && typeof value === 'object', '登録・固定希望指示が不正です');
  const c = value as TradeRosterCommand;
  ensure(
    ['setTradeRegistrations', 'setTradeRosterPolicy'].includes(c.kind),
    '未対応の編成指示です',
  );
  exactKeys(
    c,
    [
      'kind',
      'commandId',
      'localWorldId',
      'worldId',
      'expectedStateRevision',
      'expectedDate',
      'clubId',
      ...(c.kind === 'setTradeRegistrations'
        ? ['changes', 'squadReplacements']
        : ['changeMode', 'preferences']),
    ],
    '編成指示',
  );
  ensure(canonicalJson(c).length <= 16384, '編成指示の容量を超えています');
  [c.commandId, c.localWorldId, c.worldId, c.clubId].forEach(financeId);
  integer(c.expectedStateRevision, 0, Number.MAX_SAFE_INTEGER - 1, '編成指示の状態版');
  dateDays(c.expectedDate);
  if (c.kind === 'setTradeRegistrations') {
    ensure(
      Array.isArray(c.changes) &&
        c.changes.length <= 70 &&
        Array.isArray(c.squadReplacements) &&
        c.squadReplacements.length <= 2 &&
        c.changes.length + c.squadReplacements.length > 0,
      '登録変更または一二軍の編成案を指定してください',
    );
    for (const row of c.changes) {
      exactKeys(row, ['playerId', 'category'], '登録変更');
      financeId(row.playerId);
      ensure(['first', 'farm'].includes(row.category), '登録区分が不正です');
    }
    uniqueFinanceIds(
      c.changes.map((r) => r.playerId),
      '登録変更の選手',
    );
    uniqueFinanceIds(
      c.squadReplacements.map((s) => s.squadId),
      '一二軍の編成',
    );
    c.squadReplacements.forEach(parseSquad);
  } else {
    ensure(
      ['manual', 'auto'].includes(c.changeMode) &&
        Array.isArray(c.preferences) &&
        c.preferences.length <= 70,
      '入替モード・固定希望が不正です',
    );
    for (const row of c.preferences) {
      exactKeys(row, ['playerId', 'preference'], '固定希望');
      financeId(row.playerId);
      ensure(['firstFixed', 'farmFixed', 'auto'].includes(row.preference), '固定希望が不正です');
    }
    uniqueFinanceIds(
      c.preferences.map((r) => r.playerId),
      '固定希望の選手',
    );
  }
  return c;
}

/** DBへは書かない。成功した候補と監査を所有者が一緒にactionAutoへ保存する。 */
export function applyTradeRosterCommand(saved: TradeSavedState, value: TradeRosterCommand) {
  const command = parseTradeRosterCommand(structuredClone(value));
  ensure(
    command.localWorldId === saved.localWorldId && command.worldId === saved.worldId,
    '別プレイ・別世界への編成指示です',
  );
  ensure(
    ![...saved.tradeReceipts, ...(saved.gameReceipts ?? []), ...(saved.dayReceipts ?? [])].some(
      (r) => r.commandId === command.commandId,
    ),
    '別の種類の指示IDは再使用できません',
  );
  const fingerprint = canonicalJson(command),
    prior = saved.rosterReceipts?.find((r) => r.commandId === command.commandId);
  if (prior) {
    ensure(prior.fingerprint === fingerprint, '同じ編成指示IDの内容が異なります');
    return { status: 'replayed' as const, receipt: structuredClone(prior) };
  }
  ensure(
    command.expectedStateRevision === saved.stateRevision &&
      command.expectedDate === saved.currentDate,
    '古い状態・日付への編成指示です',
  );
  const world = saved.state;
  requireTradeRosterEditable(world);
  const controlled = world.initialDefinitions.squads.find(
    (s) => s.squadId === world.management.controlledSquadId,
  );
  ensure(
    controlled?.team.clubId === command.clubId,
    '担当球団以外の登録・固定希望は変更できません',
  );
  integer(world.rosterAsOf.order, 0, Number.MAX_SAFE_INTEGER - 1, '登録の指示順');
  const at = { date: saved.currentDate, order: world.rosterAsOf.order + 1 };
  let state = world,
    audit: TradeRegistrationAudit = { changedPlayerIds: [], invalidatedOverrides: [] },
    reconciliation: TradeRosterReconciliation | null = null;
  if (command.kind === 'setTradeRegistrations') {
    ensure(
      command.changes.length === 0 ||
        world.rosterControl.policies[command.clubId]?.changeMode === 'manual',
      '直接登録を変更するには入替モードを手動にしてください',
    );
    const result = planTradeRegistrationChanges(world, {
      ...command,
      sourceId: tradeRosterCommandSource(command.commandId),
      at,
    });
    if (result.status === 'blocked') return result;
    state = result.world;
    audit = result.audit;
  } else {
    state = setTradeRosterPolicy(world, { ...command, at });
    if (command.changeMode === 'auto') {
      const result = reconcileTradeRosterClub(
        state,
        command.clubId,
        tradeRosterCommandSource(command.commandId),
      );
      state = result.world;
      reconciliation = result.report;
      audit = result.report.audit;
    }
  }
  const receipt: TradeRosterReceipt = {
    modelVersion: 'trade-roster-commands-v1',
    commandId: command.commandId,
    fingerprint,
    committedStateRevision: saved.stateRevision + 1,
    appliedAt: at,
    audit,
    reconciliation,
  };
  const snapshot: TradeSavedState = {
    ...saved,
    state,
    stateRevision: saved.stateRevision + 1,
    gameReceipts: saved.gameReceipts ?? [],
    dayReceipts: saved.dayReceipts ?? [],
    rosterReceipts: [...(saved.rosterReceipts ?? []), receipt],
  };
  return { status: 'applied' as const, receipt: structuredClone(receipt), snapshot };
}
