import type { TradePlayView } from '../../world/trade-play-view.ts';
import type { TradeWorkerActive } from '../../world/trade-worker-protocol.ts';
import type { TradeWorkerAction } from '../../world/trade-worker-client.ts';
import type { TradeSquadPlan } from '../../recruitment/trade-roster-types.ts';
import type { TradeRegistrationCommand } from '../../world/trade-roster-preview.ts';

// UI内の未送信案。個人状態・過去試合・会計・完全な世界を保持しない。
export interface TradeRosterDraft {
  source: {
    sessionId: string;
    localWorldId: string;
    worldId: string;
    stateRevision: number;
    date: string;
    clubId: string;
  };
  categories: Record<string, 'first' | 'farm'>;
  squads: TradeSquadPlan[];
}
export function createTradeRosterDraft(
  active: TradeWorkerActive,
  view: TradePlayView,
): TradeRosterDraft {
  requireDraft(
    active.localWorldId === view.localWorldId &&
      active.worldId === view.worldId &&
      active.stateRevision === view.stateRevision,
    '接続と表示の対象・状態版が異なります',
  );
  return {
    source: {
      sessionId: active.sessionId,
      localWorldId: view.localWorldId,
      worldId: view.worldId,
      stateRevision: view.stateRevision,
      date: view.currentDate,
      clubId: view.controlledClubId,
    },
    categories: Object.fromEntries(view.players.map((p) => [p.playerId, p.category])),
    squads: structuredClone(view.squads),
  };
}
export const sameDraft = (a: TradeRosterDraft, b: TradeRosterDraft) =>
  JSON.stringify(a) === JSON.stringify(b);
function requireDraft(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function squadOf(draft: TradeRosterDraft, squadId: string) {
  const squad = draft.squads.find((s) => s.squadId === squadId);
  requireDraft(squad, '編成の対象がありません');
  return squad;
}
function syncDefense(squad: TradeSquadPlan) {
  squad.lineup.defense = squad.lineup.defense.map((row) => ({
    ...row,
    playerId:
      row.positionCode === 'P'
        ? null
        : (squad.lineup.battingOrder.find((s) => s.battingRole === row.positionCode)?.playerId ??
          null),
  }));
}
/** 登録先を変える明示操作。旧軍の配置・個別指定は解除し、空席は自動補充しない。 */
export function changeDraftRegistration(
  input: TradeRosterDraft,
  playerId: string,
  category: 'first' | 'farm',
) {
  requireDraft(playerId in input.categories, '現在所属の選手ではありません');
  const next = structuredClone(input);
  if (next.categories[playerId] === category) return next;
  next.categories[playerId] = category;
  for (const squad of next.squads.filter((s) => s.category !== category)) {
    for (const row of squad.lineup.battingOrder) if (row.playerId === playerId) row.playerId = null;
    syncDefense(squad);
    for (const row of squad.pitchers.rotationSlots)
      if (row.playerId === playerId) row.playerId = null;
    squad.pitchers.reliefRoles = squad.pitchers.reliefRoles.filter((r) => r.playerId !== playerId);
    squad.individualRest = squad.individualRest.filter((r) => r.playerId !== playerId);
    squad.conditionalRelief = squad.conditionalRelief.filter((r) => r.playerId !== playerId);
  }
  return next;
}
/** スタメン間は位置ごと打順交換、控えからは枠の打順と位置を引き継ぐ。 */
export function placeDraftBatter(
  input: TradeRosterDraft,
  squadId: string,
  slotNo: number,
  playerId: string,
) {
  const next = structuredClone(input),
    squad = squadOf(next, squadId);
  requireDraft(
    next.categories[playerId] === squad.category,
    '先に登録先をこの軍へ変更してください',
  );
  const target = squad.lineup.battingOrder.find((s) => s.slotNo === slotNo);
  requireDraft(target, '打順枠がありません');
  const source = squad.lineup.battingOrder.find((s) => s.playerId === playerId);
  if (source) {
    const old = { playerId: target.playerId, battingRole: target.battingRole };
    target.playerId = source.playerId;
    target.battingRole = source.battingRole;
    source.playerId = old.playerId;
    source.battingRole = old.battingRole;
  } else target.playerId = playerId;
  syncDefense(squad);
  return next;
}
export function swapDraftPositions(
  input: TradeRosterDraft,
  squadId: string,
  firstSlot: number,
  secondSlot: number,
) {
  const next = structuredClone(input),
    squad = squadOf(next, squadId);
  const first = squad.lineup.battingOrder.find((s) => s.slotNo === firstSlot),
    second = squad.lineup.battingOrder.find((s) => s.slotNo === secondSlot);
  requireDraft(first && second, '守備位置の交換元・交換先がありません');
  [first.battingRole, second.battingRole] = [second.battingRole, first.battingRole];
  syncDefense(squad);
  return next;
}
export type PitcherDestination =
  { kind: 'rotation'; index: number } | { kind: 'relief'; index: number };
export function placeDraftPitcher(
  input: TradeRosterDraft,
  squadId: string,
  playerId: string,
  target: PitcherDestination,
) {
  const next = structuredClone(input),
    squad = squadOf(next, squadId),
    plan = squad.pitchers;
  requireDraft(
    next.categories[playerId] === squad.category,
    '先に登録先をこの軍へ変更してください',
  );
  const rotation = plan.rotationSlots.findIndex((r) => r.playerId === playerId),
    relief = plan.reliefRoles.findIndex((r) => r.playerId === playerId);
  const source: PitcherDestination | null =
    rotation >= 0
      ? { kind: 'rotation', index: rotation }
      : relief >= 0
        ? { kind: 'relief', index: relief }
        : null;
  requireDraft(
    Number.isInteger(target.index) &&
      target.index >= 0 &&
      (target.kind === 'rotation'
        ? target.index < plan.rotationSlots.length
        : target.index <= plan.reliefRoles.length),
    '投手の配置先がありません',
  );
  const outgoing =
    target.kind === 'rotation'
      ? plan.rotationSlots[target.index]!.playerId
      : (plan.reliefRoles[target.index]?.playerId ?? null);
  requireDraft(
    source || outgoing === null,
    '未配置の投手は空き先発枠か救援末尾へ置いてから交換してください',
  );
  if (outgoing === playerId) return next;
  if (source?.kind === 'rotation') plan.rotationSlots[source.index]!.playerId = outgoing;
  if (source?.kind === 'relief') {
    if (outgoing) plan.reliefRoles[source.index]!.playerId = outgoing;
    else plan.reliefRoles.splice(source.index, 1);
  }
  if (target.kind === 'rotation') plan.rotationSlots[target.index]!.playerId = playerId;
  else if (target.index >= plan.reliefRoles.length)
    plan.reliefRoles.push({ playerId, role: 'relief', priority: plan.reliefRoles.length + 1 });
  else plan.reliefRoles[target.index]!.playerId = playerId;
  plan.reliefRoles = plan.reliefRoles.map((r, i) => ({ ...r, priority: i + 1 }));
  return next;
}
export function buildTradeRosterAction(
  active: TradeWorkerActive,
  view: TradePlayView,
  draft: TradeRosterDraft,
  commandId: string,
): Extract<TradeWorkerAction, { kind: 'candidateCommand' }> & {
  command: TradeRegistrationCommand;
} {
  const expected = createTradeRosterDraft(active, view);
  requireDraft(
    JSON.stringify(expected.source) === JSON.stringify(draft.source),
    '切替・再読込・状態変更前の下書きです。作り直してください',
  );
  requireDraft(
    view.capabilities.canEditRoster && !active.reloadRequired,
    '現在は編成を変更できません',
  );
  const changes = view.players
    .filter((p) => draft.categories[p.playerId] !== p.category)
    .map((p) => ({ playerId: p.playerId, category: draft.categories[p.playerId]! }));
  requireDraft(
    changes.length === 0 || view.capabilities.canChangeRegistrations,
    '登録先の変更には手動の入替方針が必要です',
  );
  const squadReplacements = draft.squads.filter(
    (s) =>
      JSON.stringify(s) !==
      JSON.stringify(view.squads.find((before) => before.squadId === s.squadId)),
  );
  requireDraft(changes.length + squadReplacements.length > 0, '変更がありません');
  return {
    kind: 'candidateCommand',
    sessionId: draft.source.sessionId,
    command: {
      kind: 'setTradeRegistrations',
      commandId,
      localWorldId: draft.source.localWorldId,
      worldId: draft.source.worldId,
      expectedStateRevision: draft.source.stateRevision,
      expectedDate: draft.source.date,
      clubId: draft.source.clubId,
      changes,
      squadReplacements: structuredClone(squadReplacements),
    },
  };
}
