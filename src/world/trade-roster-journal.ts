import { ensure, integer } from '../engine/validation.ts';
import {
  compareMoments,
  financeId,
  uniqueFinanceIds,
  validateMoment,
} from '../finance/validation.ts';
import { canonicalJson } from '../storage/codec.ts';
import { allWorldSquads } from './squads.ts';
import { exactKeys } from './snapshot-codec.ts';
import { parseTradeRosterCommand } from './trade-roster-commands.ts';
import { tradeRosterCommandSource, type TradeRegistrationAudit } from './trade-registration.ts';
import type { TradeRosterReconciliation } from './trade-roster-policy.ts';
import type { TradeSavedState } from './trade-save-validation.ts';
import type { FinanceMoment } from '../finance/types.ts';

/** 保存された登録履歴に発生元を照合。後日の再移動で閉じた期間も消さない。 */
export function validateTradeRegistrationAudit(
  audit: TradeRegistrationAudit,
  saved: TradeSavedState,
  clubId: string,
  at: FinanceMoment,
  sourceId: string,
): void {
  exactKeys(audit, ['changedPlayerIds', 'invalidatedOverrides'], '登録変更の監査');
  ensure(
    Array.isArray(audit.changedPlayerIds) && Array.isArray(audit.invalidatedOverrides),
    '登録変更の監査配列が不正です',
  );
  uniqueFinanceIds(audit.changedPlayerIds, '登録変更の監査選手');
  for (const id of audit.changedPlayerIds)
    ensure(
      saved.state.registration.registrations.some(
        (r) =>
          r.registrationId === JSON.stringify(['roster-registration-v1', sourceId, id]) &&
          r.playerId === id &&
          r.clubId === clubId &&
          r.sourceId === sourceId &&
          compareMoments(r.from, at) === 0,
      ),
      '登録変更の発生元・期間がありません',
    );
  uniqueFinanceIds(
    audit.invalidatedOverrides.map((r) => r.gameId),
    '解除監査の試合ID',
  );
  for (const row of audit.invalidatedOverrides) {
    exactKeys(row, ['gameId', 'fields'], '試合別指定の解除監査');
    const game = saved.state.initialDefinitions.schedule.find((g) => g.gameId === row.gameId);
    ensure(
      game &&
        game.date >= at.date &&
        allWorldSquads(saved.state.initialDefinitions).some(
          (s) =>
            s.team.clubId === clubId && [game.homeSquadId, game.awaySquadId].includes(s.squadId),
        ) &&
        Array.isArray(row.fields) &&
        row.fields.length > 0 &&
        new Set(row.fields).size === row.fields.length &&
        row.fields.every((f) => ['lineup', 'starterId', 'benchIds'].includes(f)),
      '試合別指定の解除範囲が不正です',
    );
  }
}

export function validateTradeRosterReport(
  report: TradeRosterReconciliation,
  saved: TradeSavedState,
  at: FinanceMoment,
  sourceId: string,
): void {
  exactKeys(
    report,
    ['clubId', 'requestedPlayerIds', 'status', 'issues', 'audit'],
    '固定希望の適用記録',
  );
  ensure(
    saved.state.initialDefinitions.squads.some((s) => s.team.clubId === report.clubId),
    '固定希望の対象球団がありません',
  );
  ensure(
    Array.isArray(report.requestedPlayerIds) &&
      Array.isArray(report.issues) &&
      ['unchanged', 'applied', 'pending'].includes(report.status),
    '固定希望の適用状態が不正です',
  );
  uniqueFinanceIds(report.requestedPlayerIds, '固定希望の対象選手');
  ensure(
    report.requestedPlayerIds.every((id) =>
      saved.state.registration.memberships.some(
        (m) =>
          m.playerId === id &&
          m.clubId === report.clubId &&
          compareMoments(m.from, at) <= 0 &&
          (m.until === null || compareMoments(at, m.until) < 0),
      ),
    ),
    '固定希望の対象が当時の所属と一致しません',
  );
  validateTradeRegistrationAudit(report.audit, saved, report.clubId, at, sourceId);
  if (report.status === 'applied')
    ensure(
      report.issues.length === 0 &&
        report.requestedPlayerIds.length > 0 &&
        canonicalJson(report.audit.changedPlayerIds) === canonicalJson(report.requestedPlayerIds),
      '固定希望の適用監査が不一致です',
    );
  else {
    ensure(
      report.audit.changedPlayerIds.length === 0 && report.audit.invalidatedOverrides.length === 0,
      '未適用の固定希望に変更監査があります',
    );
    ensure(
      report.status === 'unchanged'
        ? report.requestedPlayerIds.length === 0 && report.issues.length === 0
        : report.requestedPlayerIds.length > 0 && report.issues.length > 0,
      '固定希望の保留理由が不一致です',
    );
  }
  for (const issue of report.issues) {
    exactKeys(
      issue,
      [
        'code',
        'message',
        ...['clubId', 'squadId', 'gameId', 'playerId', 'slotNo'].filter((k) =>
          Object.hasOwn(issue, k),
        ),
      ],
      '固定希望の保留理由',
    );
    ensure(
      [
        'registrationRequired',
        'preferenceRequired',
        'registrationCooldown',
        'missingPlayerData',
        'rosterLimit',
        'missingSquad',
        'lineupVacancy',
        'invalidLineup',
        'rotationVacancy',
        'invalidPitcherPlan',
        'playerNotEligible',
        'invalidOverride',
        'gameDayStarted',
      ].includes(issue.code) &&
        typeof issue.message === 'string' &&
        issue.message.length > 0,
      '固定希望の保留理由が不正です',
    );
    if (issue.clubId !== undefined) ensure(issue.clubId === report.clubId, '別球団の保留理由です');
    for (const id of [issue.squadId, issue.gameId, issue.playerId])
      if (id !== undefined) financeId(id);
    if (issue.slotNo !== undefined) integer(issue.slotNo, 1, 9, '保留理由の枠番号');
  }
}

/** 指示種類を跨ぐIDと版を一つの集合で検査する。全過去計算の再実行ではない。 */
export function validateTradeRosterJournal(saved: TradeSavedState): void {
  if (!Object.hasOwn(saved, 'rosterReceipts')) return;
  ensure(
    Array.isArray(saved.rosterReceipts) &&
      Array.isArray(saved.gameReceipts) &&
      Array.isArray(saved.dayReceipts),
    '編成指示履歴が不正です',
  );
  const others = [...saved.tradeReceipts, ...saved.gameReceipts, ...saved.dayReceipts];
  uniqueFinanceIds(
    [...others, ...saved.rosterReceipts].map((r) => r.commandId),
    '移籍・試合・日次・編成の指示ID',
  );
  const revisions = new Set(others.map((r) => r.committedStateRevision));
  let lastRevision = -1;
  for (const receipt of saved.rosterReceipts) {
    exactKeys(
      receipt,
      [
        'modelVersion',
        'commandId',
        'fingerprint',
        'committedStateRevision',
        'appliedAt',
        'audit',
        'reconciliation',
      ],
      '編成指示の記録',
    );
    ensure(
      receipt.modelVersion === 'trade-roster-commands-v1' &&
        typeof receipt.fingerprint === 'string' &&
        receipt.fingerprint.length <= 16384,
      '編成指示の版・容量が不正です',
    );
    const command = parseTradeRosterCommand(JSON.parse(receipt.fingerprint));
    integer(receipt.committedStateRevision, 1, saved.stateRevision, '編成指示の確定版');
    validateMoment(receipt.appliedAt);
    ensure(
      command.commandId === receipt.commandId &&
        command.localWorldId === saved.localWorldId &&
        command.worldId === saved.worldId &&
        canonicalJson(command) === receipt.fingerprint &&
        command.expectedStateRevision + 1 === receipt.committedStateRevision &&
        command.expectedDate === receipt.appliedAt.date &&
        compareMoments(receipt.appliedAt, saved.state.rosterAsOf) <= 0 &&
        receipt.appliedAt.order > 0 &&
        receipt.committedStateRevision > lastRevision &&
        !revisions.has(receipt.committedStateRevision),
      '編成指示の参照・版・時点が不一致です',
    );
    revisions.add(receipt.committedStateRevision);
    lastRevision = receipt.committedStateRevision;
    const controlled = saved.state.initialDefinitions.squads.find(
      (s) => s.squadId === saved.state.management.controlledSquadId,
    );
    ensure(controlled?.team.clubId === command.clubId, '編成指示の権限が不正です');
    validateTradeRegistrationAudit(
      receipt.audit,
      saved,
      command.clubId,
      receipt.appliedAt,
      tradeRosterCommandSource(command.commandId),
    );
    if (command.kind === 'setTradeRosterPolicy' && command.changeMode === 'auto') {
      ensure(receipt.reconciliation?.clubId === command.clubId, '固定希望の適用記録がありません');
      validateTradeRosterReport(
        receipt.reconciliation,
        saved,
        receipt.appliedAt,
        tradeRosterCommandSource(command.commandId),
      );
      ensure(
        canonicalJson(receipt.reconciliation.audit) === canonicalJson(receipt.audit),
        '固定希望と編成指示の監査が不一致です',
      );
    } else ensure(receipt.reconciliation === null, '不要な固定希望の適用記録があります');
  }
}

/** 現在の所属全員に一つの希望。旧球団の設定を現在の選手へ流用しない。 */
export function validateCurrentTradeRosterPolicies(saved: TradeSavedState): void {
  const world = saved.state,
    control = world.rosterControl;
  ensure(control.version === 'fixed-preferences-v1', '固定希望の版が不正です');
  const clubs = world.initialDefinitions.squads.map((s) => s.team.clubId);
  exactKeys(control.policies, clubs, '全球団の入替方針');
  for (const clubId of clubs) {
    const policy = control.policies[clubId]!;
    exactKeys(policy, ['clubId', 'changeMode', 'policyRevision'], '入替方針');
    ensure(
      policy.clubId === clubId && ['manual', 'auto'].includes(policy.changeMode),
      '入替方針の球団・モードが不正です',
    );
    integer(policy.policyRevision, 0, Number.MAX_SAFE_INTEGER, '入替方針の版');
  }
  ensure(Array.isArray(control.preferences), '固定希望の一覧が不正です');
  const members = world.registration.memberships.filter((m) => m.until === null);
  uniqueFinanceIds(
    control.preferences.map((p) => JSON.stringify([p.clubId, p.playerId])),
    '現在の固定希望',
  );
  ensure(control.preferences.length === members.length, '現在所属全員の固定希望が必要です');
  for (const row of control.preferences) {
    exactKeys(row, ['clubId', 'playerId', 'preference', 'updatedAt'], '現在の固定希望');
    validateMoment(row.updatedAt);
    ensure(
      members.some((m) => m.clubId === row.clubId && m.playerId === row.playerId) &&
        ['firstFixed', 'farmFixed', 'auto'].includes(row.preference) &&
        compareMoments(row.updatedAt, world.rosterAsOf) <= 0,
      '固定希望の現在所属・時点が不正です',
    );
  }
}
