import { ensure } from '../engine/validation.ts';
import { applyRegistrationAction, RegistrationConstraintError } from './registration.ts';
import type { WorldDefinitions, WorldRecord, WorldSquad } from './types.ts';
import type {
  RosterControl,
  RosterPolicyAction,
  RosterPolicyInput,
} from './roster-policy-types.ts';

export type RosterPolicyWorld = Extract<WorldRecord, { version: 'world-prototype-v6' }>;

function validateInput(squad: WorldSquad, input: RosterPolicyInput): void {
  ensure(input && ['manual', 'auto'].includes(input.changeMode), '入れ替えモードが不正です');
  ensure(
    Array.isArray(input.preferences) && input.preferences.length === squad.players.length,
    '全所属選手の固定希望を指定してください',
  );
  ensure(
    new Set(input.preferences.map((entry) => entry.playerId)).size === squad.players.length,
    '固定希望の選手が重複しています',
  );
  for (const entry of input.preferences) {
    ensure(
      squad.players.some((player) => player.playerId === entry.playerId),
      '固定希望の所属が異なります',
    );
    ensure(['firstFixed', 'farmFixed', 'auto'].includes(entry.preference), '固定希望が不正です');
  }
}

export function validateRosterPolicyDefinitions(definitions: WorldDefinitions): void {
  for (const squad of definitions.squads) validateInput(squad, squad.rosterPolicyInput!);
}

export function initialRosterControl(definitions: WorldDefinitions): RosterControl {
  return {
    version: 'fixed-preferences-v1',
    policies: Object.fromEntries(
      definitions.squads.map((squad) => [
        squad.team.clubId,
        {
          clubId: squad.team.clubId,
          changeMode: squad.rosterPolicyInput!.changeMode,
          policyRevision: 1,
        },
      ]),
    ),
    preferences: definitions.squads.flatMap((squad) =>
      squad.rosterPolicyInput!.preferences.map((entry) => ({
        ...entry,
        clubId: squad.team.clubId,
        updatedAt: { date: definitions.startDate, order: 0 },
      })),
    ),
  };
}

/**
 * 試作規約：固定希望との差分だけを球団単位で一括反映する。
 * おまかせ選手の実登録は維持。枠を空けるための恣意的な抹消はしない。
 * 制約に当たると全差分を保留する。別球団の処理や日付進行は止めない。
 */
function attemptPreferences(
  world: RosterPolicyWorld,
  squad: WorldSquad,
  sourceId: string,
  automatic: boolean,
): { world: RosterPolicyWorld; pending: number; reason: string | null } {
  const clubId = squad.team.clubId;
  const changes = world.rosterControl.preferences
    .filter((entry) => entry.clubId === clubId && entry.preference !== 'auto')
    .flatMap((entry) => {
      // 球団と現在の所属の両方を照合。将来の移籍で旧設定を流用しない。
      if (
        !world.registration.memberships.some(
          (member) =>
            member.clubId === clubId && member.playerId === entry.playerId && member.until === null,
        )
      )
        return [];
      const current = world.registration.registrations.find(
        (row) => row.clubId === clubId && row.playerId === entry.playerId && row.until === null,
      );
      const category = entry.preference === 'firstFixed' ? ('first' as const) : ('farm' as const);
      return current && current.category !== category
        ? [{ playerId: entry.playerId, category }]
        : [];
    });
  if (!changes.length) return { world, pending: 0, reason: null };
  try {
    const next = applyRegistrationAction(
      world,
      {
        kind: 'setRegistrations',
        squadId: squad.squadId,
        changes,
      },
      sourceId,
      automatic,
    ) as RosterPolicyWorld;
    return { world: next, pending: changes.length, reason: null };
  } catch (error) {
    // 実装不具合や未知の例外を「正常な保留」に変換しない。
    if (!(error instanceof RegistrationConstraintError)) throw error;
    return { world, pending: changes.length, reason: error.message };
  }
}

/** 翌日の開始時（休養日を含む）に実行。順序0は当日の手動指示より前。 */
export function reconcileRosterPolicies(world: RosterPolicyWorld): RosterPolicyWorld {
  let next = world;
  for (const squad of world.definitions.squads) {
    if (next.rosterControl.policies[squad.team.clubId]!.changeMode !== 'auto') continue;
    next = attemptPreferences(
      next,
      squad,
      `roster-auto-${world.currentDate}-${squad.team.clubId}`,
      true,
    ).world;
  }
  return next;
}

export function applyRosterPolicyAction(
  world: RosterPolicyWorld,
  action: RosterPolicyAction,
  commandId: string,
): RosterPolicyWorld {
  const squad = world.definitions.squads.find((squad) => squad.squadId === action.squadId)!;
  validateInput(squad, action);
  const rosterControl = structuredClone(world.rosterControl);
  const policy = rosterControl.policies[squad.team.clubId]!;
  policy.changeMode = action.changeMode;
  policy.policyRevision++;
  for (const entry of action.preferences) {
    const row = rosterControl.preferences.find(
      (row) => row.clubId === squad.team.clubId && row.playerId === entry.playerId,
    )!;
    if (row.preference === entry.preference) continue;
    row.preference = entry.preference;
    row.updatedAt = { date: world.currentDate, order: world.management.actions.length + 1 };
  }
  const next = { ...world, rosterControl };
  return action.changeMode === 'auto'
    ? attemptPreferences(next, squad, commandId, false).world
    : next;
}

/** UIへは担当球団の設定と未反映理由だけ送る。表示で状態・乱数を更新しない。 */
export function rosterPolicyView(world: RosterPolicyWorld) {
  const squad = world.definitions.squads.find(
    (squad) => squad.squadId === world.management.controlledSquadId,
  )!;
  const { pending, reason } = attemptPreferences(world, squad, 'preview', false);
  return {
    policy: world.rosterControl.policies[squad.team.clubId]!,
    preferences: world.rosterControl.preferences.filter((row) => row.clubId === squad.team.clubId),
    pending,
    reason,
  };
}
