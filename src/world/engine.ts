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
  const away = definitions.squads.find((squad) => squad.squadId === scheduled.awaySquadId);
  const home = definitions.squads.find((squad) => squad.squadId === scheduled.homeSquadId);
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
        definitions.version !== 'world-definitions-v3' || activeIds.includes(player.playerId),
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
    ['world-definitions-v1', 'world-definitions-v2', 'world-definitions-v3'].includes(
      definitions.version,
    ),
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
    if (definitions.version === 'world-definitions-v3') {
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
      integer(squad.reserveBatterIds.length, 0, 17, '試作の控え野手数');
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
    validateGameFixture(scheduledFixture(definitions, game));
    for (const squadId of [game.awaySquadId, game.homeSquadId]) {
      const appearance = game.date + ':' + squadId;
      ensure(!appearances.has(appearance), '試作では同一球団の1日複数試合は未対応です');
      appearances.add(appearance);
    }
  }
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
  if ('seasonSummary' in next && currentDate > next.definitions.endDate) {
    next.seasonSummary = summarizeSeason(next);
  }
  return next;
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
