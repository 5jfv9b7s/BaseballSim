import { ensure, id, integer } from '../engine/validation.ts';
import type { GameRecord, Team } from '../game/types.ts';
import type { WorldDefinitions, WorldRecord, WorldSquad, IdealLineup } from './types.ts';
import type { RegistrationAction, RegistrationState, GameRoster } from './registration-types.ts';

export type RegisteredWorld = Extract<WorldRecord, { version: 'world-prototype-v5' }>;

/** 暦日を足す。実時計や表示上のタイムゾーンを判定へ持ち込まない。 */
export function registrationEligibleOn(date: string, days: number): string {
  return new Date(Date.parse(date + 'T00:00:00Z') + days * 86_400_000).toISOString().slice(0, 10);
}

export function validateRegistrationDefinitions(definitions: WorldDefinitions): void {
  const rules = definitions.registrationRules;
  ensure(rules?.version === 'registration-rules-v1', '登録規則の版が不正です');
  integer(rules.clubLimit, 10, 70, '所属上限');
  integer(rules.firstLimit, 10, rules.clubLimit, '一軍上限');
  integer(rules.benchLimit, 10, rules.firstLimit, 'ベンチ上限');
  integer(rules.foreignFirstLimit, 0, rules.firstLimit, '外国人登録上限');
  integer(
    rules.foreignBenchLimit,
    0,
    Math.min(rules.foreignFirstLimit, rules.benchLimit),
    '外国人ベンチ上限',
  );
  integer(rules.reentryDays, 1, 365, '再登録待ち日数');
  for (const squad of definitions.squads) {
    integer(squad.players.length, 10, rules.clubLimit, '球団所属人数');
    const entries = squad.registrationInputs;
    ensure(
      Array.isArray(entries) && entries.length === squad.players.length,
      '全選手の初期登録・資格を指定してください',
    );
    ensure(
      new Set(entries.map((entry) => entry.playerId)).size === entries.length,
      '初期登録が重複しています',
    );
    for (const entry of entries) {
      id(entry.playerId);
      ensure(
        squad.players.some((player) => player.playerId === entry.playerId),
        '初期登録の所属が異なります',
      );
      ensure(['first', 'farm'].includes(entry.category), '登録区分が不正です');
      ensure(['subject', 'exempt'].includes(entry.foreignBaseStatus), '外国人資格が不正です');
    }
    validateFirst(
      definitions,
      squad,
      entries.filter((entry) => entry.category === 'first').map((entry) => entry.playerId),
    );
  }
}

export function initialRegistration(definitions: WorldDefinitions): RegistrationState {
  const from = { date: definitions.startDate, order: 0 };
  return {
    version: 'club-registration-v1',
    memberships: definitions.squads.flatMap((squad) =>
      squad.players.map((player) => ({
        membershipId: 'membership-' + player.playerId,
        playerId: player.playerId,
        clubId: squad.team.clubId,
        from: { ...from },
        until: null,
        entryReason: 'initial' as const,
      })),
    ),
    registrations: definitions.squads.flatMap((squad) =>
      squad.registrationInputs!.map((entry) => ({
        registrationId: 'registration-0-' + entry.playerId,
        playerId: entry.playerId,
        clubId: squad.team.clubId,
        category: entry.category,
        from: { ...from },
        until: null,
        nextFirstEligibleOn: null,
        sourceId: 'initial',
      })),
    ),
    benchOverrides: {},
    gameRosters: {},
  };
}

function subject(squad: WorldSquad, playerId: string): boolean {
  return squad.registrationInputs!.some(
    (entry) => entry.playerId === playerId && entry.foreignBaseStatus === 'subject',
  );
}

export function registeredIds(world: RegisteredWorld, squadId: string): string[] {
  const squad = world.definitions.squads.find((item) => item.squadId === squadId)!;
  return world.registration.registrations
    .filter(
      (entry) =>
        entry.clubId === squad.team.clubId && entry.until === null && entry.category === 'first',
    )
    .map((entry) => entry.playerId);
}

function validateFirst(definitions: WorldDefinitions, squad: WorldSquad, ids: string[]): void {
  const rules = definitions.registrationRules!;
  ensure(ids.length <= rules.firstLimit, `一軍登録は${rules.firstLimit}人までです`);
  ensure(
    ids.filter((id) => subject(squad, id)).length <= rules.foreignFirstLimit,
    `外国人の一軍登録は${rules.foreignFirstLimit}人までです`,
  );
  // 二軍の試合は未実装。現在の試合エンジンが開始できる最低人数を維持する。
  ensure(
    ids.filter((id) => !squad.team.pitcherIds.includes(id)).length >= 9,
    '一軍には野手9人以上が必要です',
  );
  ensure(
    ids.some((id) => squad.team.pitcherIds.includes(id)),
    '一軍には投手1人以上が必要です',
  );
}

/** 資格を満たす実配置を作る。理想案は書き換えず、代替順は初期名簿順という試作規約。 */
export function resolveRegisteredRoster(
  world: RegisteredWorld,
  squadId: string,
  gameId: string,
  ignoreOverrides = false,
): {
  lineup: IdealLineup;
  pitcherIds: string[];
  roster: GameRoster;
} {
  const squad = world.definitions.squads.find((item) => item.squadId === squadId)!;
  const rules = world.definitions.registrationRules!;
  const first = registeredIds(world, squadId);
  const controlled = !ignoreOverrides && squadId === world.management.controlledSquadId;
  const explicitLineup = controlled ? world.gameLineups[gameId] : undefined;
  const desired = explicitLineup ?? world.management.idealLineups[squadId]!;
  const plan = world.management.pitcherUsagePlans[squadId]!;
  const explicitStarter = controlled ? world.management.starterOverrides[gameId] : undefined;
  const planned = plan.rotationSlots[plan.nextSlotNo - 1]!.playerId;
  const pitcherOrder = [
    ...new Set([
      planned,
      ...plan.reliefRoles.map((role) => role.playerId),
      ...squad.team.pitcherIds,
    ]),
  ];
  const override = controlled ? world.registration.benchOverrides[gameId] : undefined;
  if (override) {
    ensure(new Set(override).size === override.length, 'ベンチの選手が重複しています');
    ensure(
      override.every((id) => first.includes(id)),
      'ベンチには一軍登録中の選手だけ指定できます。今日のベンチ指定も確認してください',
    );
  }
  const available = override ?? first;
  if (explicitStarter)
    ensure(
      available.includes(explicitStarter),
      '当日先発が登録外またはベンチ外です。先発指定を解除してください',
    );
  const starter = explicitStarter ?? pitcherOrder.find((id) => available.includes(id));
  ensure(starter, 'ベンチに登板可能な投手がいません');
  let bench: string[];
  if (override) bench = [...override];
  else {
    bench = [];
    // 先発、希望打順、救援、残りの所属選手の順。戦力・疲労を評価するCPUではない。
    const priority = [
      ...new Set([
        starter,
        ...desired.battingOrder.map((slot) => slot.playerId),
        ...squad.players
          .filter((player) => !squad.team.pitcherIds.includes(player.playerId))
          .map((player) => player.playerId),
        ...pitcherOrder,
      ]),
    ];
    for (const playerId of priority) {
      if (!first.includes(playerId) || bench.length >= rules.benchLimit) continue;
      if (playerId !== starter && plan.rotationSlots.some((slot) => slot.playerId === playerId))
        continue;
      if (
        subject(squad, playerId) &&
        bench.filter((id) => subject(squad, id)).length >= rules.foreignBenchLimit
      )
        continue;
      bench.push(playerId);
    }
  }
  ensure(bench.length <= rules.benchLimit, `ベンチ入りは${rules.benchLimit}人までです`);
  ensure(
    bench.filter((id) => subject(squad, id)).length <= rules.foreignBenchLimit,
    `外国人のベンチ入りは${rules.foreignBenchLimit}人までです`,
  );
  ensure(bench.includes(starter), '先発投手をベンチへ入れてください');
  const batters = bench.filter((id) => !squad.team.pitcherIds.includes(id));
  ensure(batters.length >= 9, 'ベンチには野手9人以上が必要です');
  const lineup = structuredClone(desired);
  const used = new Set(
    lineup.battingOrder
      .filter((slot) => batters.includes(slot.playerId))
      .map((slot) => slot.playerId),
  );
  for (const slot of lineup.battingOrder) {
    if (batters.includes(slot.playerId)) continue;
    ensure(
      !explicitLineup,
      '当日オーダーに登録外またはベンチ外の選手がいます。当日指定を変更・解除してください',
    );
    // ベンチ選択順で起用が変わらないよう、所属データ順で代役を選ぶ。
    const replacement = squad.players.find(
      (player) => batters.includes(player.playerId) && !used.has(player.playerId),
    )!;
    const old = slot.playerId;
    slot.playerId = replacement.playerId;
    used.add(replacement.playerId);
    for (const defense of lineup.defense)
      if (defense.playerId === old) defense.playerId = replacement.playerId;
  }
  return {
    lineup,
    pitcherIds: [
      starter,
      ...plan.reliefRoles
        .map((role) => role.playerId)
        .filter((id) => id !== starter && bench.includes(id)),
    ],
    roster: {
      squadId,
      playerIds: bench,
      participants: bench.map((playerId) => {
        const player = squad.players.find((player) => player.playerId === playerId)!;
        return {
          playerId,
          displayName: player.familyName + ' ' + player.givenName,
          appeared: false,
        };
      }),
    },
  };
}

/** 開始時名簿を保持。後日の登録操作は終了試合の名簿・出場を変更しない。 */
export function updateGameRosters(
  world: RegisteredWorld,
  gameId: string,
  game: GameRecord,
): RegistrationState {
  const scheduled = world.definitions.schedule.find((item) => item.gameId === gameId)!;
  const saved = world.registration.gameRosters[gameId];
  const rosters = structuredClone(
    saved ?? {
      away: resolveRegisteredRoster(world, scheduled.awaySquadId, gameId).roster,
      home: resolveRegisteredRoster(world, scheduled.homeSquadId, gameId).roster,
    },
  );
  for (const side of ['away', 'home'] as const) {
    const appeared = new Set([
      ...game.fixture.teams[side].lineup.map((slot) => slot.playerId),
      ...game.fixture.teams[side].pitcherIds.slice(0, game.state.pitcherIndex[side] + 1),
    ]);
    for (const participant of rosters[side].participants)
      participant.appeared = appeared.has(participant.playerId);
  }
  return {
    ...world.registration,
    gameRosters: { ...world.registration.gameRosters, [gameId]: rosters },
  };
}

export function applyRegistrationAction(
  world: RegisteredWorld,
  action: RegistrationAction,
  sourceId: string,
): RegisteredWorld {
  const next: RegisteredWorld = { ...world, registration: structuredClone(world.registration) };
  const squad = world.definitions.squads.find((item) => item.squadId === action.squadId)!;
  if (action.kind === 'setRegistrations') {
    ensure(
      Array.isArray(action.changes) &&
        action.changes.length > 0 &&
        action.changes.length <= squad.players.length,
      '登録変更の選手を指定してください',
    );
    ensure(
      new Set(action.changes.map((change) => change.playerId)).size === action.changes.length,
      '登録変更の選手が重複しています',
    );
    const moment = { date: world.currentDate, order: world.management.actions.length + 1 };
    for (const change of action.changes) {
      ensure(['first', 'farm'].includes(change.category), '登録区分が不正です');
      const current = next.registration.registrations.find(
        (entry) =>
          entry.playerId === change.playerId &&
          entry.clubId === squad.team.clubId &&
          entry.until === null,
      );
      ensure(current, '担当球団に所属していない選手です');
      if (current.category === change.category) continue;
      if (change.category === 'first')
        ensure(
          current.nextFirstEligibleOn === null || world.currentDate >= current.nextFirstEligibleOn,
          `再登録可能日は${current.nextFirstEligibleOn}です`,
        );
      current.until = { ...moment };
      next.registration.registrations.push({
        registrationId: `registration-${moment.order}-${change.playerId}`,
        playerId: change.playerId,
        clubId: squad.team.clubId,
        category: change.category,
        from: { ...moment },
        until: null,
        nextFirstEligibleOn:
          change.category === 'farm'
            ? registrationEligibleOn(
                world.currentDate,
                world.definitions.registrationRules!.reentryDays,
              )
            : null,
        sourceId,
      });
    }
    validateFirst(world.definitions, squad, registeredIds(next, squad.squadId));
  } else {
    const game = world.definitions.schedule.find((game) => game.gameId === action.gameId);
    ensure(
      game &&
        game.date === world.currentDate &&
        [game.awaySquadId, game.homeSquadId].includes(squad.squadId),
      '担当球団の当日の試合を指定してください',
    );
    if (action.playerIds === null) delete next.registration.benchOverrides[action.gameId];
    else {
      ensure(Array.isArray(action.playerIds), 'ベンチの選手一覧が不正です');
      next.registration.benchOverrides[action.gameId] = [...action.playerIds];
    }
  }
  validateTodayRosters(next);
  return next;
}

export function validateTodayRosters(world: RegisteredWorld): void {
  // 休養日にも次の試合を組める資格人数を検査する。当日の上書きは別途検査。
  for (const squad of world.definitions.squads)
    resolveRegisteredRoster(world, squad.squadId, '', true);
  for (const game of world.definitions.schedule.filter((game) => game.date === world.currentDate)) {
    resolveRegisteredRoster(world, game.awaySquadId, game.gameId);
    resolveRegisteredRoster(world, game.homeSquadId, game.gameId);
  }
}

/** 表示も計算と同じ予定名簿を使う。開始後は固定した名簿を返す。 */
export function registrationPreview(world: RegisteredWorld): {
  roster: GameRoster;
  lineup: Team['lineup'];
  starterId: string;
  gameId: string;
} | null {
  const squadId = world.management.controlledSquadId;
  const scheduled = world.definitions.schedule.find(
    (game) =>
      game.date === world.currentDate && [game.awaySquadId, game.homeSquadId].includes(squadId),
  );
  if (!scheduled) return null;
  const side = scheduled.awaySquadId === squadId ? 'away' : 'home';
  const game = world.games[scheduled.gameId];
  if (game)
    return {
      gameId: scheduled.gameId,
      roster: world.registration.gameRosters[scheduled.gameId]![side],
      lineup: game.fixture.teams[side].lineup,
      starterId: game.fixture.teams[side].pitcherIds[0]!,
    };
  const resolved = resolveRegisteredRoster(world, squadId, scheduled.gameId);
  return {
    gameId: scheduled.gameId,
    roster: resolved.roster,
    lineup: resolved.lineup.battingOrder.map((slot) => ({
      playerId: slot.playerId,
      position: slot.battingRole,
    })),
    starterId: resolved.pitcherIds[0]!,
  };
}

/** UI用の射影。過去全試合の名簿・終了した登録期間は毎回転送しない。 */
export function registrationView(
  world: RegisteredWorld,
): Pick<RegistrationState, 'registrations' | 'benchOverrides'> {
  const squadId = world.management.controlledSquadId;
  const squad = world.definitions.squads.find((squad) => squad.squadId === squadId)!;
  const today = world.definitions.schedule.find(
    (game) =>
      game.date === world.currentDate && [game.awaySquadId, game.homeSquadId].includes(squadId),
  );
  const bench = today ? world.registration.benchOverrides[today.gameId] : undefined;
  return {
    registrations: world.registration.registrations.filter(
      (entry) => entry.clubId === squad.team.clubId && entry.until === null,
    ),
    benchOverrides: today && bench ? { [today.gameId]: bench } : {},
  };
}
