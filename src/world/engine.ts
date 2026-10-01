import { initialFielderRest, validateFielderRestDefinitions } from './fielder-rest.ts';
import { createFielderRestDefinitions } from '../data/world/fielder-rest.ts';
import { performanceSnapshot } from './performance.ts';
import { performanceFixture, validatePerformanceConfig } from '../game/performance.ts';
import { createPerformanceDefinitions } from '../data/world/performance.ts';
import { createConditionDefinitions } from '../data/world/condition.ts';
import {
  initialCondition,
  validateConditionDefinitions,
  sampleConditions,
  advanceConditionDay,
} from './condition.ts';
import { createRestDefinitions } from '../data/world/rest.ts';
import { initialRest, validateRestDefinitions, recordPitchingAppearances } from './rest.ts';
import { createPhysicalDefinitions } from '../data/world/physical.ts';
import {
  validatePhysicalDefinitions,
  initialPhysical,
  applyPhysicalGame,
  recoverPhysicalDay,
} from './physical.ts';
import { createFarmDefinitions } from '../data/world/farm.ts';
import { worldSquad, isFarmSquad } from './squads.ts';
import { validateFarmDefinitions } from './farm-validation.ts';
import { createRosterPolicyDefinitions } from '../data/world/roster-policies.ts';
import {
  initialRosterControl,
  validateRosterPolicyDefinitions,
  reconcileRosterPolicies,
} from './roster-policy.ts';
import { createRegistrationDefinitions } from '../data/world/registrations.ts';
import {
  initialRegistration,
  validateRegistrationDefinitions,
  validateTodayRosters,
  updateGameRosters,
} from './registration.ts';
import { createRosterDefinitions } from '../data/world/rosters.ts';
import { createAnnualDefinitions } from '../data/world/annual.ts';
import { summarizeSeason } from './season.ts';
import { initialManagement, managementFixture, advanceRotation } from './management.ts';
import { createWorldDefinitions } from '../data/world/index.ts';
import { ensure, id, integer } from '../engine/validation.ts';
import { createGame, stepRecord, validateGameFixture } from '../game/engine.ts';
import { validateMatchConfig } from '../game/config.ts';
import { validateErrorConfig } from '../game/error-config.ts';
import { finalizeGame } from '../game/results.ts';
import type { GameFixture, GameRecord, TeamSide } from '../game/types.ts';
import { scheduledSeed } from './identity.ts';
import { applyContribution, emptyStats, gameContribution } from './stats.ts';
import type { ScheduledGame, WorldDefinitions, WorldPhase, WorldRecord } from './types.ts';

/** 実時計を読まない暦計算。日付のみをUTCとして扱い、夏時間を計算へ入れない。 */
export function nextDate(date: string): string {
  return new Date(Date.parse(date + 'T00:00:00Z') + 86_400_000).toISOString().slice(0, 10);
}

function validateDate(value: string): void {
  ensure(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), '日付形式が不正です');
  const time = Date.parse(value + 'T00:00:00Z');
  ensure(
    Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value,
    '日付が不正です',
  );
}

export function scheduledFixture(
  definitions: WorldDefinitions,
  scheduled: ScheduledGame,
): GameFixture {
  const away = worldSquad(definitions, scheduled.awaySquadId);
  const home = worldSquad(definitions, scheduled.homeSquadId);
  ensure(away && home && away !== home, '対戦球団が不正です');
  const teams = {
    away: { ...away.team, side: 'away' as const },
    home: { ...home.team, side: 'home' as const },
  };
  const activeIds = Object.values(teams).flatMap((team) => [
    ...team.lineup.map((slot) => slot.playerId),
    ...team.pitcherIds,
  ]);
  return structuredClone({
    initialDatasetVersion: 'game-fixture-v2',
    players: [...away.players, ...home.players].filter(
      (player) =>
        ![
          'world-definitions-v3',
          'world-definitions-v4',
          'world-definitions-v5',
          'world-definitions-v6',
          'world-definitions-v7',
          'world-definitions-v8',
          'world-definitions-v9',
          'world-definitions-v10',
          'world-definitions-v11',
        ].includes(definitions.version) || activeIds.includes(player.playerId),
    ),
    pitches: [...away.pitches, ...home.pitches],
    teams,
    clubs: (['away', 'home'] as TeamSide[]).map((side) => ({
      clubId: teams[side].clubId,
      name: teams[side].name,
      playerIds: [...teams[side].lineup.map((slot) => slot.playerId), ...teams[side].pitcherIds],
    })),
  });
}

export function validateDefinitions(definitions: WorldDefinitions): void {
  ensure(
    [
      'world-definitions-v1',
      'world-definitions-v2',
      'world-definitions-v3',
      'world-definitions-v4',
      'world-definitions-v5',
      'world-definitions-v6',
      'world-definitions-v7',
      'world-definitions-v8',
      'world-definitions-v9',
      'world-definitions-v10',
      'world-definitions-v11',
    ].includes(definitions.version),
    '未対応の世界定義です',
  );
  ensure(definitions.statScope === 'firstRegular', '未対応の成績区分です');
  ensure(definitions.standingsRule === 'win-percentage-shared-rank-v1', '未対応の順位規則です');
  ensure(definitions.seedRule === 'game-id-fnv1a32-v1', '未対応のseed規則です');
  id(definitions.seasonId);
  id(definitions.competitionId);
  ensure(
    typeof definitions.name === 'string' && definitions.name.trim().length > 0,
    '大会名が必要です',
  );
  validateDate(definitions.startDate);
  validateDate(definitions.endDate);
  const days = (Date.parse(definitions.endDate) - Date.parse(definitions.startDate)) / 86_400_000;
  integer(days, 0, definitions.version !== 'world-definitions-v1' ? 365 : 30, '試作日程の日数差');
  integer(definitions.squads.length, 2, 8, '球団数');
  integer(
    definitions.schedule.length,
    0,
    definitions.version !== 'world-definitions-v1' ? 256 : 32,
    '試作日程の試合数',
  );
  const seen = new Set<string>();
  for (const squad of definitions.squads) {
    for (const value of [
      squad.squadId,
      squad.team.clubId,
      ...squad.players.map((p) => p.playerId),
      ...squad.pitches.map((p) => p.pitchId),
    ]) {
      id(value);
      ensure(!seen.has(value), '球団・選手・持ち球IDが重複しています');
      seen.add(value);
    }
    if (
      [
        'world-definitions-v3',
        'world-definitions-v4',
        'world-definitions-v5',
        'world-definitions-v6',
        'world-definitions-v7',
        'world-definitions-v8',
        'world-definitions-v9',
        'world-definitions-v10',
        'world-definitions-v11',
      ].includes(definitions.version)
    ) {
      ensure(Array.isArray(squad.reserveBatterIds), '控え野手の名簿がありません');
      const listed = [
        ...squad.team.lineup.map((slot) => slot.playerId),
        ...squad.team.pitcherIds,
        ...squad.reserveBatterIds,
      ];
      ensure(
        new Set(listed).size === listed.length &&
          listed.length === squad.players.length &&
          listed.every((id) => squad.players.some((player) => player.playerId === id)),
        '所属名簿と先発・投手・控えの区分が一致しません',
      );
      integer(
        squad.reserveBatterIds.length,
        0,
        [
          'world-definitions-v4',
          'world-definitions-v5',
          'world-definitions-v6',
          'world-definitions-v7',
          'world-definitions-v8',
          'world-definitions-v9',
          'world-definitions-v10',
          'world-definitions-v11',
        ].includes(definitions.version)
          ? 58
          : 17,
        '試作の控え野手数',
      );
      // 未出場選手にも能力検査を適用する。DHへ仮配置した検証用名簿は保存しない。
      for (const reserveId of squad.reserveBatterIds) {
        const other = definitions.squads.find((item) => item !== squad)!;
        const fixture = scheduledFixture(definitions, {
          gameId: 'validation',
          date: definitions.startDate,
          awaySquadId: squad.squadId,
          homeSquadId: other.squadId,
        });
        const slot = fixture.teams.away.lineup.find((slot) => slot.position === 'DH')!;
        const oldId = slot.playerId;
        slot.playerId = reserveId;
        fixture.players = fixture.players.filter((player) => player.playerId !== oldId);
        fixture.players.push(
          structuredClone(squad.players.find((player) => player.playerId === reserveId)!),
        );
        fixture.clubs[0]!.playerIds = fixture.clubs[0]!.playerIds.map((id) =>
          id === oldId ? reserveId : id,
        );
        validateGameFixture(fixture);
      }
    } else ensure(squad.reserveBatterIds === undefined, '旧版の定義に控えを追加できません');
    // 試合予定のない球団も名簿を検査する。
    const other = definitions.squads.find((candidate) => candidate !== squad)!;
    validateGameFixture(
      scheduledFixture(definitions, {
        gameId: 'validation',
        date: definitions.startDate,
        awaySquadId: squad.squadId,
        homeSquadId: other.squadId,
      }),
    );
  }
  if (
    [
      'world-definitions-v6',
      'world-definitions-v7',
      'world-definitions-v8',
      'world-definitions-v9',
      'world-definitions-v10',
      'world-definitions-v11',
    ].includes(definitions.version)
  )
    validateFarmDefinitions(definitions);
  else ensure(definitions.farm === undefined, '旧定義に二軍大会を追加できません');
  const gameIds = new Set<string>();
  const appearances = new Set<string>();
  for (const game of definitions.schedule) {
    id(game.gameId);
    ensure(!Object.hasOwn(Object.prototype, game.gameId), '使用できない試合IDです');
    ensure(!gameIds.has(game.gameId), '日程の試合IDが重複しています');
    gameIds.add(game.gameId);
    validateDate(game.date);
    ensure(
      game.date >= definitions.startDate && game.date <= definitions.endDate,
      '日程期間外の試合です',
    );
    const farm = isFarmSquad(definitions, game.awaySquadId);
    ensure(farm === isFarmSquad(definitions, game.homeSquadId), '一軍と二軍は別の大会です');
    if (farm)
      ensure(
        game.date >= definitions.farm!.startDate && game.date <= definitions.farm!.endDate,
        '二軍の開催期限外です',
      );
    validateGameFixture(scheduledFixture(definitions, game));
    for (const squadId of [game.awaySquadId, game.homeSquadId]) {
      const appearance = game.date + ':' + squadId;
      ensure(!appearances.has(appearance), '試作では同一球団の1日複数試合は未対応です');
      appearances.add(appearance);
    }
  }
  if (
    [
      'world-definitions-v4',
      'world-definitions-v5',
      'world-definitions-v6',
      'world-definitions-v7',
      'world-definitions-v8',
      'world-definitions-v9',
      'world-definitions-v10',
      'world-definitions-v11',
    ].includes(definitions.version)
  )
    validateRegistrationDefinitions(definitions);
  else
    ensure(
      definitions.registrationRules === undefined &&
        definitions.squads.every((squad) => squad.registrationInputs === undefined),
      '旧版へ登録データを追加できません',
    );
  if (
    [
      'world-definitions-v5',
      'world-definitions-v6',
      'world-definitions-v7',
      'world-definitions-v8',
      'world-definitions-v9',
      'world-definitions-v10',
      'world-definitions-v11',
    ].includes(definitions.version)
  )
    validateRosterPolicyDefinitions(definitions);
  else
    ensure(
      definitions.squads.every((squad) => squad.rosterPolicyInput === undefined),
      '旧版へ固定希望を追加できません',
    );
  if (
    [
      'world-definitions-v7',
      'world-definitions-v8',
      'world-definitions-v9',
      'world-definitions-v10',
      'world-definitions-v11',
    ].includes(definitions.version)
  )
    validatePhysicalDefinitions(definitions);
  else
    ensure(
      definitions.physicalConfig === undefined &&
        definitions.squads.every((s) => s.physicalInputs === undefined),
      '旧定義へ身体状態を追加できません',
    );
  if (
    [
      'world-definitions-v8',
      'world-definitions-v9',
      'world-definitions-v10',
      'world-definitions-v11',
    ].includes(definitions.version)
  )
    validateRestDefinitions(definitions);
  else
    ensure(
      definitions.restModelVersion === undefined && definitions.restPolicyInputs === undefined,
      '旧定義へ休養方針を追加できません',
    );
  if (
    ['world-definitions-v9', 'world-definitions-v10', 'world-definitions-v11'].includes(
      definitions.version,
    )
  )
    validateConditionDefinitions(definitions);
  else
    ensure(
      definitions.conditionConfig === undefined &&
        definitions.squads.every((s) => s.conditionInputs === undefined),
      '旧定義へ調子を追加できません',
    );
  if (['world-definitions-v10', 'world-definitions-v11'].includes(definitions.version))
    validatePerformanceConfig(definitions.performanceConfig!);
  else ensure(definitions.performanceConfig === undefined, '旧定義へ試合前補正を追加できません');
  if (definitions.version === 'world-definitions-v11') validateFielderRestDefinitions(definitions);
  else
    ensure(
      definitions.fielderRestModelVersion === undefined &&
        definitions.fielderRestInputs === undefined,
      '旧定義へ野手休養を追加できません',
    );
  validateMatchConfig(definitions.matchConfig);
  validateErrorConfig(definitions.errorConfig);
}

function plan(world: Pick<WorldRecord, 'definitions' | 'currentDate'>): WorldRecord['dayPlan'] {
  return {
    date: world.currentDate,
    gameIds: world.definitions.schedule
      .filter((game) => game.date === world.currentDate)
      .map((game) => game.gameId)
      .sort(),
    cursor: 0,
  };
}

export function createWorld(seed = 20260924, definitions = createWorldDefinitions()): WorldRecord {
  integer(seed, 1, 0xffffffff, '世界seed');
  validateDefinitions(definitions);
  const currentDate = definitions.startDate;
  return {
    version: 'world-prototype-v1',
    worldId: 'world-' + seed,
    seed,
    definitions: structuredClone(definitions),
    currentDate,
    dayPlan: plan({ definitions, currentDate }),
    completedDates: [],
    lastCompletedDate: null,
    games: {},
    contributions: {},
    statApplicationMarkers: {},
    stats: emptyStats(definitions),
  };
}

/** 新しい担当球団プレイ。旧v0.2世界には管理データを後付けしない。 */
export function createManagedWorld(
  seed = 20260924,
  definitions = createWorldDefinitions(),
  controlledSquadId = definitions.squads[0]!.squadId,
): import('./types.ts').ManagedWorld {
  const world = createWorld(seed, definitions);
  return {
    ...world,
    version: 'world-prototype-v2',
    management: initialManagement(definitions, controlledSquadId),
  };
}

export function worldPhase(world: WorldRecord): WorldPhase {
  if (world.currentDate > world.definitions.endDate) return 'scheduleComplete';
  const gameId = world.dayPlan.gameIds[world.dayPlan.cursor];
  if (gameId && world.games[gameId]?.state.phase === 'aborted') return 'aborted';
  return gameId ? 'playing' : 'readyToComplete';
}

export function createScheduledGame(world: WorldRecord, gameId: string): GameRecord {
  const scheduled = world.definitions.schedule.find((game) => game.gameId === gameId);
  ensure(scheduled, '日程にない試合です');
  const game = createGame(
    scheduledSeed(world.seed, gameId),
    world.version !== 'world-prototype-v1'
      ? managementFixture(world, gameId, scheduledFixture(world.definitions, scheduled))
      : scheduledFixture(world.definitions, scheduled),
    'game-prototype-v10',
    world.definitions.matchConfig,
    world.definitions.errorConfig,
  );
  // 1球目より前に日程IDへ結び付ける。以降の出来事・打席・走者もこのIDを継承する。
  game.state.gameId = gameId;
  game.state.rng.streamId = gameId + ':attempt:1';
  if (world.version === 'world-prototype-v11' || world.version === 'world-prototype-v12') {
    ensure(scheduled.date === world.currentDate, '試合前補正は当日の状態から作成します');
    game.performance = performanceSnapshot(world, gameId, game.fixture);
    performanceFixture(game);
  }
  return game;
}

/** 1回に最大25イベント。先の試合を確定しても日付は変更しない。入力は不変。 */
export function advanceWorld(world: WorldRecord, count: number): WorldRecord {
  integer(count, 1, 25, '進行イベント数');
  ensure(worldPhase(world) === 'playing', '進行できる当日試合がありません');
  const gameId = world.dayPlan.gameIds[world.dayPlan.cursor]!;
  const previous = world.games[gameId] ?? createScheduledGame(world, gameId);
  // イベント追加以外の処理は既存エンジンが複製する。全世界の履歴を毎球複製しない。
  const game = { ...previous, events: [...previous.events] };
  for (let index = 0; index < count; index++) {
    stepRecord(game);
    if (game.state.phase === 'gameComplete') {
      finalizeGame(game);
      break;
    }
    if (game.state.phase === 'aborted') break;
  }
  return acceptGame(world, gameId, game);
}

/** 検証済み記録の集計と起用更新。検証時も同じ処理を使う。 */
export function acceptGame(world: WorldRecord, gameId: string, game: GameRecord): WorldRecord {
  const next: WorldRecord = {
    ...world,
    games: { ...world.games, [gameId]: game },
    dayPlan: { ...world.dayPlan },
    contributions: { ...world.contributions },
    statApplicationMarkers: { ...world.statApplicationMarkers },
  };
  // 休養判定は初球より前の状態で固定する。当日の負荷でベンチを変えない。
  if ('registration' in next)
    next.registration = updateGameRosters(
      'restControl' in next ? (world as typeof next) : next,
      gameId,
      game,
    );
  if ('condition' in next) next.condition = sampleConditions(next, gameId);
  if ('physical' in next) next.physical = applyPhysicalGame(next, gameId, game);
  if ('restControl' in next) next.restControl = recordPitchingAppearances(next, gameId, game);
  if (game.result) {
    const scheduled = world.definitions.schedule.find((item) => item.gameId === gameId)!;
    applyContribution(next, gameContribution(world.definitions, scheduled, game));
    next.dayPlan.cursor++;
    if (next.version !== 'world-prototype-v1') next.management = advanceRotation(next, gameId);
  }
  return next;
}

/** 日付単位の一意な完了。試合がない日も1回だけ処理し、翌日へ進める。 */
export function completeDay(world: WorldRecord, expectedDate: string): WorldRecord {
  ensure(world.currentDate === expectedDate, '対象の日付が変わっています');
  ensure(worldPhase(world) === 'readyToComplete', '当日の全試合を正常終了させてください');
  ensure(!world.completedDates.includes(expectedDate), 'この日は処理済みです');
  for (const gameId of world.dayPlan.gameIds) {
    ensure(
      world.games[gameId]?.result && world.statApplicationMarkers[gameId],
      '試合集計が未完了です',
    );
  }
  const currentDate = nextDate(expectedDate);
  const next: WorldRecord = {
    ...world,
    currentDate,
    dayPlan: plan({ definitions: world.definitions, currentDate }),
    completedDates: [...world.completedDates, expectedDate],
    lastCompletedDate: expectedDate,
  };
  if (
    'farmSummary' in next &&
    next.farmSummary === null &&
    currentDate > next.definitions.farm!.endDate
  ) {
    next.farmSummary = summarizeSeason(next, 'farmRegular');
  }
  if ('condition' in next && 'condition' in world)
    next.condition = advanceConditionDay(world, currentDate);
  if ('physical' in next && 'physical' in world)
    next.physical = recoverPhysicalDay(world, currentDate);
  if ('seasonSummary' in next && currentDate > next.definitions.endDate) {
    next.seasonSummary = summarizeSeason(next);
  }
  return 'rosterControl' in next && currentDate <= next.definitions.endDate
    ? reconcileRosterPolicies(next)
    : next;
}

/** 年間プレイは新規作成時に選ぶ。旧世界の日程・乱数・保存を変更しない。 */
export function createAnnualWorld(
  seed = 20260924,
  controlledSquadId?: string,
  definitions = createAnnualDefinitions(),
): Extract<WorldRecord, { version: 'world-prototype-v3' }> {
  return {
    ...createManagedWorld(seed, definitions, controlledSquadId),
    version: 'world-prototype-v3',
    seasonSummary: null,
  };
}

/** 控えと当日オーダーを持つ新規プレイ。旧保存へ後付けしない。 */
export function createRosterWorld(
  seed = 20260924,
  controlledSquadId?: string,
  definitions = createRosterDefinitions(),
): Extract<WorldRecord, { version: 'world-prototype-v4' }> {
  return {
    ...createManagedWorld(seed, definitions, controlledSquadId),
    version: 'world-prototype-v4',
    seasonSummary: null,
    gameLineups: {},
  };
}

/** 登録・ベンチ管理を持つ新規世界。旧世界の規則を変更しない。 */
export function createRegistrationWorld(
  seed = 20260924,
  controlledSquadId?: string,
  definitions = createRegistrationDefinitions(),
): Extract<WorldRecord, { version: 'world-prototype-v5' }> {
  ensure(definitions.version === 'world-definitions-v4', '登録対応の初期定義が必要です');
  const world: Extract<WorldRecord, { version: 'world-prototype-v5' }> = {
    ...createManagedWorld(seed, definitions, controlledSquadId),
    version: 'world-prototype-v5',
    seasonSummary: null,
    gameLineups: {},
    registration: initialRegistration(definitions),
  };
  validateTodayRosters(world);
  return world;
}

/** 固定希望と入れ替え方針を持つ世界。旧保存は元の版で再生する。 */
export function createRosterPolicyWorld(
  seed = 20260924,
  controlledSquadId?: string,
  definitions = createRosterPolicyDefinitions(),
): Extract<WorldRecord, { version: 'world-prototype-v6' }> {
  ensure(definitions.version === 'world-definitions-v5', '固定希望対応の初期定義が必要です');
  const world: Extract<WorldRecord, { version: 'world-prototype-v6' }> = {
    ...createManagedWorld(seed, definitions, controlledSquadId),
    version: 'world-prototype-v6',
    seasonSummary: null,
    gameLineups: {},
    registration: initialRegistration(definitions),
    rosterControl: initialRosterControl(definitions),
  };
  validateTodayRosters(world);
  return reconcileRosterPolicies(world);
}

/** 一軍と二軍を同じ日次正本で処理し、選手は球団名簿を共有する。 */
export function createFarmWorld(
  seed = 20260924,
  controlledSquadId?: string,
  definitions = createFarmDefinitions(),
): Extract<WorldRecord, { version: 'world-prototype-v7' }> {
  ensure(definitions.version === 'world-definitions-v6', '二軍対応の初期定義が必要です');
  const world: Extract<WorldRecord, { version: 'world-prototype-v7' }> = {
    ...createManagedWorld(seed, definitions, controlledSquadId),
    version: 'world-prototype-v7',
    seasonSummary: null,
    farmSummary: null,
    gameLineups: {},
    registration: initialRegistration(definitions),
    rosterControl: initialRosterControl(definitions),
  };
  validateTodayRosters(world);
  return reconcileRosterPolicies(world);
}

/** 体力・疲労を共有する新規世界。旧世界は元の版で再開する。 */
export function createPhysicalWorld(
  seed = 20260924,
  controlledSquadId?: string,
  definitions = createPhysicalDefinitions(),
): Extract<WorldRecord, { version: 'world-prototype-v8' }> {
  ensure(definitions.version === 'world-definitions-v7', '身体状態対応の初期定義が必要です');
  const world: Extract<WorldRecord, { version: 'world-prototype-v8' }> = {
    ...createManagedWorld(seed, definitions, controlledSquadId),
    version: 'world-prototype-v8',
    seasonSummary: null,
    farmSummary: null,
    gameLineups: {},
    registration: initialRegistration(definitions),
    rosterControl: initialRosterControl(definitions),
    physical: initialPhysical(definitions),
  };
  validateTodayRosters(world);
  return reconcileRosterPolicies(world);
}

/** 休養希望と実配置を分離する新規世界。旧保存は元の運用で続行する。 */
export function createRestWorld(
  seed = 20260924,
  controlledSquadId?: string,
  definitions = createRestDefinitions(),
): Extract<WorldRecord, { version: 'world-prototype-v9' }> {
  ensure(definitions.version === 'world-definitions-v8', '休養対応の初期定義が必要です');
  const world: Extract<WorldRecord, { version: 'world-prototype-v9' }> = {
    ...createManagedWorld(seed, definitions, controlledSquadId),
    version: 'world-prototype-v9',
    seasonSummary: null,
    farmSummary: null,
    gameLineups: {},
    registration: initialRegistration(definitions),
    rosterControl: initialRosterControl(definitions),
    physical: initialPhysical(definitions),
    restControl: initialRest(definitions),
  };
  validateTodayRosters(world);
  return reconcileRosterPolicies(world);
}

/** 調子は能力・身体状態と別に保存する。旧世界には追加しない。 */
export function createConditionWorld(
  seed = 20260924,
  controlledSquadId?: string,
  definitions = createConditionDefinitions(),
): Extract<WorldRecord, { version: 'world-prototype-v10' }> {
  ensure(definitions.version === 'world-definitions-v9', '調子対応の初期定義が必要です');
  const world: Extract<WorldRecord, { version: 'world-prototype-v10' }> = {
    ...createManagedWorld(seed, definitions, controlledSquadId),
    version: 'world-prototype-v10',
    seasonSummary: null,
    farmSummary: null,
    gameLineups: {},
    registration: initialRegistration(definitions),
    rosterControl: initialRosterControl(definitions),
    physical: initialPhysical(definitions),
    restControl: initialRest(definitions),
    condition: initialCondition(definitions, seed),
  };
  validateTodayRosters(world);
  return reconcileRosterPolicies(world);
}

/** 原能力と試合前の一時補正を分離する新規世界。 */
export function createPerformanceWorld(
  seed = 20260924,
  controlledSquadId?: string,
  definitions = createPerformanceDefinitions(),
): Extract<WorldRecord, { version: 'world-prototype-v11' }> {
  ensure(definitions.version === 'world-definitions-v10', '試合前補正対応の初期定義が必要です');
  const world: Extract<WorldRecord, { version: 'world-prototype-v11' }> = {
    ...createManagedWorld(seed, definitions, controlledSquadId),
    version: 'world-prototype-v11',
    seasonSummary: null,
    farmSummary: null,
    gameLineups: {},
    registration: initialRegistration(definitions),
    rosterControl: initialRosterControl(definitions),
    physical: initialPhysical(definitions),
    restControl: initialRest(definitions),
    condition: initialCondition(definitions, seed),
  };
  validateTodayRosters(world);
  return reconcileRosterPolicies(world);
}

/** 野手の休養と当日だけの代替起用を追加する新規世界。 */
export function createFielderRestWorld(
  seed = 20260924,
  controlledSquadId?: string,
  definitions = createFielderRestDefinitions(),
): Extract<WorldRecord, { version: 'world-prototype-v12' }> {
  ensure(definitions.version === 'world-definitions-v11', '野手休養対応の初期定義が必要です');
  const world: Extract<WorldRecord, { version: 'world-prototype-v12' }> = {
    ...createManagedWorld(seed, definitions, controlledSquadId),
    version: 'world-prototype-v12',
    fielderRest: initialFielderRest(definitions),
    seasonSummary: null,
    farmSummary: null,
    gameLineups: {},
    registration: initialRegistration(definitions),
    rosterControl: initialRosterControl(definitions),
    physical: initialPhysical(definitions),
    restControl: initialRest(definitions),
    condition: initialCondition(definitions, seed),
  };
  validateTodayRosters(world);
  return reconcileRosterPolicies(world);
}
