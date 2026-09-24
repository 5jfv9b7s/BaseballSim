import { ensure, id, integer } from '../engine/validation.ts';
import { validateGameFixture } from '../game/engine.ts';
import { canonicalJson } from '../storage/codec.ts';
import type { GameFixture, Team } from '../game/types.ts';
import type {
  ClubManagement,
  IdealLineup,
  ManagedWorld,
  ManagementAction,
  PitcherUsagePlan,
  WorldDefinitions,
  WorldRecord,
} from './types.ts';

export function idealLineup(team: Omit<Team, 'side'>): IdealLineup {
  return {
    dhEnabled: true,
    battingOrder: team.lineup.map((slot, index) => ({
      slotNo: index + 1,
      playerId: slot.playerId,
      battingRole: slot.position,
    })),
    defense: [
      ...team.lineup
        .filter((slot) => slot.position !== 'DH')
        .map((slot) => ({
          positionCode: slot.position as Exclude<typeof slot.position, 'DH'>,
          playerId: slot.playerId,
        })),
      { positionCode: 'P', playerId: null },
    ],
  };
}

export function initialManagement(
  definitions: WorldDefinitions,
  controlledSquadId: string,
): ClubManagement {
  ensure(
    definitions.squads.some((squad) => squad.squadId === controlledSquadId),
    '担当球団が不正です',
  );
  return {
    version: 'club-management-v1',
    controlledSquadId,
    idealLineups: Object.fromEntries(
      definitions.squads.map((squad) => [squad.squadId, idealLineup(squad.team)]),
    ),
    pitcherUsagePlans: Object.fromEntries(
      definitions.squads.map((squad) => [
        squad.squadId,
        {
          rotationSlots: [{ slotNo: 1, playerId: squad.team.pitcherIds[0]! }],
          nextSlotNo: 1,
          reliefRoles: squad.team.pitcherIds.slice(1).map((playerId, index) => ({
            playerId,
            role: 'relief' as const,
            priority: index + 1,
          })),
        },
      ]),
    ),
    policyRevisions: Object.fromEntries(definitions.squads.map((squad) => [squad.squadId, 0])),
    starterOverrides: {},
    actions: [],
  };
}

export function canEditManagement(world: WorldRecord): boolean {
  return (
    world.version === 'world-prototype-v2' &&
    world.currentDate <= world.definitions.endDate &&
    world.dayPlan.cursor === 0 &&
    world.dayPlan.gameIds.every((gameId) => !world.games[gameId])
  );
}

export function validateClubPlan(
  world: ManagedWorld,
  squadId: string,
  lineup: IdealLineup,
  pitchers: PitcherUsagePlan,
): void {
  const squad = world.definitions.squads.find((squad) => squad.squadId === squadId);
  ensure(squad, '対象球団がありません');
  ensure(lineup.dhEnabled === true, '今回の試作はDH制のみです');
  ensure(
    Array.isArray(lineup.battingOrder) && lineup.battingOrder.length === 9,
    '打順は9人必要です',
  );
  const ids = lineup.battingOrder.map((slot) => slot.playerId);
  const positions = lineup.battingOrder.map((slot) => slot.battingRole);
  ensure(
    new Set(ids).size === 9 &&
      ids.every((id) => squad.team.lineup.some((slot) => slot.playerId === id)),
    '打順の選手が重複、または球団の野手ではありません',
  );
  ensure(
    new Set(positions).size === 9 &&
      ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'].every((position) =>
        positions.includes(position as never),
      ),
    '守備位置は各位置1人ずつ指定してください',
  );
  ensure(
    lineup.battingOrder.every((slot, index) => slot.slotNo === index + 1),
    '打順番号は1から9まで連続で指定してください',
  );
  ensure(Array.isArray(lineup.defense) && lineup.defense.length === 9, '守備配置は9枠必要です');
  ensure(
    new Set(lineup.defense.map((slot) => slot.positionCode)).size === 9,
    '守備配置が重複しています',
  );
  ensure(
    ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'].every((position) =>
      lineup.defense.some((slot) => slot.positionCode === position),
    ),
    '守備配置の位置が不正です',
  );
  for (const slot of lineup.defense) {
    if (slot.positionCode === 'P')
      ensure(slot.playerId === null, '投手位置は先発指定から確定します');
    else
      ensure(
        lineup.battingOrder.some(
          (batter) => batter.playerId === slot.playerId && batter.battingRole === slot.positionCode,
        ),
        '打順と守備配置が一致しません',
      );
  }
  ensure(
    lineup.defense.some((slot) => slot.positionCode === 'P'),
    '投手の守備枠がありません',
  );

  ensure(
    Array.isArray(pitchers.rotationSlots) && Array.isArray(pitchers.reliefRoles),
    '投手の運用設定が不正です',
  );
  integer(
    pitchers.rotationSlots.length,
    1,
    Math.min(6, squad.team.pitcherIds.length),
    'ローテーション人数',
  );
  integer(pitchers.nextSlotNo, 1, pitchers.rotationSlots.length, '次の先発枠');
  ensure(
    pitchers.rotationSlots.every((slot, index) => slot.slotNo === index + 1),
    'ローテーション枠は1から連続にしてください',
  );
  ensure(
    pitchers.reliefRoles.every(
      (slot, index) => slot.role === 'relief' && slot.priority === index + 1,
    ),
    '救援は通常救援の優先順で指定してください',
  );
  const all = [...pitchers.rotationSlots, ...pitchers.reliefRoles].map((slot) => slot.playerId);
  ensure(
    all.length === squad.team.pitcherIds.length &&
      new Set(all).size === all.length &&
      all.every((id) => squad.team.pitcherIds.includes(id)),
    '全投手をローテーションか救援へ重複なく割り当ててください',
  );
}

/** 保存済み初期定義を変更せず、起用設定から当日の実名簿を作る。 */
export function managementFixture(
  world: ManagedWorld,
  gameId: string,
  base: GameFixture,
): GameFixture {
  const fixture = structuredClone(base);
  const scheduled = world.definitions.schedule.find((game) => game.gameId === gameId)!;
  for (const side of ['away', 'home'] as const) {
    const squadId = side === 'away' ? scheduled.awaySquadId : scheduled.homeSquadId;
    const lineup = world.management.idealLineups[squadId]!;
    const plan = world.management.pitcherUsagePlans[squadId]!;
    validateClubPlan(world, squadId, lineup, plan);
    const starter =
      squadId === world.management.controlledSquadId
        ? (world.management.starterOverrides[gameId] ??
          plan.rotationSlots[plan.nextSlotNo - 1]!.playerId)
        : plan.rotationSlots[plan.nextSlotNo - 1]!.playerId;
    fixture.teams[side].lineup = lineup.battingOrder.map((slot) => ({
      playerId: slot.playerId,
      position: slot.battingRole,
    }));
    fixture.teams[side].pitcherIds = [
      starter,
      ...plan.reliefRoles.map((slot) => slot.playerId).filter((id) => id !== starter),
    ];
    const club = fixture.clubs.find((club) => club.clubId === fixture.teams[side].clubId)!;
    club.playerIds = [
      ...fixture.teams[side].lineup.map((slot) => slot.playerId),
      ...fixture.teams[side].pitcherIds,
    ];
  }
  const activeIds = fixture.clubs.flatMap((club) => club.playerIds);
  fixture.players = fixture.players.filter((player) => activeIds.includes(player.playerId));
  fixture.pitches = fixture.pitches.filter((pitch) => activeIds.includes(pitch.playerId));
  validateGameFixture(fixture);
  return fixture;
}

/** 通常終了した実施試合だけ次枠を進める。当日代役でも元の割当は保つ。 */
export function advanceRotation(world: ManagedWorld, gameId: string): ClubManagement {
  const management = structuredClone(world.management);
  const scheduled = world.definitions.schedule.find((game) => game.gameId === gameId)!;
  for (const squadId of [scheduled.awaySquadId, scheduled.homeSquadId]) {
    const plan = management.pitcherUsagePlans[squadId]!;
    plan.nextSlotNo = (plan.nextSlotNo % plan.rotationSlots.length) + 1;
  }
  return management;
}

/** 当日の試合を始める前だけ操作可能。指示履歴を日付順に保存し、再実行に用いる。 */
export function applyManagement(
  world: WorldRecord,
  commandId: string,
  action: ManagementAction,
): ManagedWorld {
  ensure(
    world.version === 'world-prototype-v2',
    '旧世界は編成操作に未対応です。新しい球団運営を開始してください',
  );
  id(commandId);
  ensure(action.squadId === world.management.controlledSquadId, '担当球団だけ変更できます');
  const prior = world.management.actions.find((item) => item.commandId === commandId);
  if (prior) {
    ensure(
      canonicalJson(prior.action) === canonicalJson(action),
      '同じ編成指示IDの内容が異なります',
    );
    return world;
  }
  ensure(canEditManagement(world), '編成変更は当日の全試合を始める前に行ってください');
  integer(world.management.actions.length, 0, 255, '試作の編成変更回数');
  const management = structuredClone(world.management);
  if (action.kind === 'setClubPlan') {
    validateClubPlan(world, action.squadId, action.lineup, action.pitchers);
    management.idealLineups[action.squadId] = structuredClone(action.lineup);
    management.pitcherUsagePlans[action.squadId] = structuredClone(action.pitchers);
    management.policyRevisions[action.squadId]!++;
  } else {
    ensure(action.kind === 'setGameStarter', '未対応の編成指示です');
    const game = world.definitions.schedule.find((game) => game.gameId === action.gameId);
    ensure(
      game &&
        game.date === world.currentDate &&
        [game.awaySquadId, game.homeSquadId].includes(action.squadId),
      '担当球団の当日の試合を指定してください',
    );
    const squad = world.definitions.squads.find((squad) => squad.squadId === action.squadId)!;
    ensure(
      action.playerId === null || squad.team.pitcherIds.includes(action.playerId),
      '球団の投手を指定してください',
    );
    if (action.playerId === null) delete management.starterOverrides[action.gameId];
    else management.starterOverrides[action.gameId] = action.playerId;
  }
  management.actions.push({
    commandId,
    sequence: management.actions.length + 1,
    date: world.currentDate,
    action: structuredClone(action),
  });
  return { ...world, management };
}
