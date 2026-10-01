import { ensure, integer } from '../engine/validation.ts';
import { nextRandom } from '../engine/rng.ts';
import { fnv1a32 } from './identity.ts';
import { registeredIds, registrationEligibleOn } from './registration.ts';
import { worldSquad } from './squads.ts';
import type { WorldDefinitions, WorldRecord } from './types.ts';
import type {
  ConditionConfig,
  ConditionState,
  ConditionWorldState,
  ConditionSample,
  ConditionComparison,
} from './condition-types.ts';

export type ConditionWorld = Extract<WorldRecord, { condition: ConditionWorldState }>;

export function validateConditionDefinitions(definitions: WorldDefinitions): void {
  const config = definitions.conditionConfig;
  ensure(config?.version === 'condition-smooth-v1', '調子モデルの版が不正です');
  ensure(config.neutralMilli === 50000, '調子の中立値は50000です');
  integer(config.targetSpreadMilli, 0, 100000, '調子の変動幅');
  integer(config.reversionPermille, 0, 1000, '中立への復帰割合');
  integer(config.minSegmentDays, 2, 365, '調子区間の最短日数');
  integer(config.maxSegmentDays, config.minSegmentDays, 365, '調子区間の最長日数');
  ensure(
    Array.isArray(config.stageBoundariesMilli) && config.stageBoundariesMilli.length === 4,
    '調子の4境界が必要です',
  );
  let previous = 0;
  for (const boundary of config.stageBoundariesMilli) {
    integer(boundary, previous + 1, 99999, '調子の段階境界');
    previous = boundary;
  }
  for (const squad of definitions.squads) {
    const inputs = squad.conditionInputs;
    ensure(
      Array.isArray(inputs) && inputs.length === squad.players.length,
      '全選手の調子初期値が必要です',
    );
    ensure(
      new Set(inputs.map((p) => p.playerId)).size === inputs.length,
      '調子初期値が重複しています',
    );
    for (const input of inputs) {
      ensure(
        squad.players.some((p) => p.playerId === input.playerId),
        '調子初期値の所属選手が不正です',
      );
      integer(input.conditionMilli, 0, 100000, '初期調子');
      integer(input.targetMilli, 0, 100000, '初期の調子終点');
      integer(input.durationDays, 2, 365, '初期の調子区間日数');
    }
  }
}

export function initialCondition(definitions: WorldDefinitions, seed: number): ConditionWorldState {
  return {
    version: 'condition-smooth-v1',
    players: Object.fromEntries(
      definitions.squads.flatMap((squad) =>
        squad.conditionInputs!.map((input) => [
          input.playerId,
          {
            conditionMilli: input.conditionMilli,
            lastUpdatedOn: definitions.startDate,
            conditionModelVersion: 'condition-smooth-v1',
            conditionModelState: {
              modelId: 'condition-smooth',
              version: 'condition-smooth-v1',
              schemaId: 'condition-smooth-state-v1',
              state: {
                fromMilli: input.conditionMilli,
                targetMilli: input.targetMilli,
                elapsedDays: 0,
                durationDays: input.durationDays,
                rng: {
                  streamId: 'condition-' + input.playerId,
                  algorithmVersion: 'xorshift32-v1',
                  fullState: {
                    word: fnv1a32('condition-seed-v1:' + seed + ':' + input.playerId) || 1,
                  },
                  drawCount: 0,
                },
              },
            },
          },
        ]),
      ),
    ),
    samples: {},
  };
}

/** 一日分のsmoothstep補間。将来の終点と乱数は保存するがUIへ公開しない。 */
export function advanceConditionState(
  previous: ConditionState,
  config: ConditionConfig,
  date: string,
): ConditionState {
  ensure(
    date === registrationEligibleOn(previous.lastUpdatedOn, 1),
    '調子の日次更新が連続していません',
  );
  const next = structuredClone(previous);
  const state = next.conditionModelState.state;
  const t = ++state.elapsedDays;
  const n = state.durationDays;
  next.conditionMilli =
    state.fromMilli +
    Math.round(((state.targetMilli - state.fromMilli) * t * t * (3 * n - 2 * t)) / (n * n * n));
  next.lastUpdatedOn = date;
  if (t === n) {
    const target = nextRandom(state.rng);
    const duration = nextRandom(target.state);
    const offset =
      Math.floor(target.value * (2 * config.targetSpreadMilli + 1)) - config.targetSpreadMilli;
    state.fromMilli = next.conditionMilli;
    state.targetMilli = Math.max(
      0,
      Math.min(
        100000,
        Math.round(
          next.conditionMilli +
            ((config.neutralMilli - next.conditionMilli) * config.reversionPermille) / 1000,
        ) + offset,
      ),
    );
    state.durationDays =
      config.minSegmentDays +
      Math.floor(duration.value * (config.maxSegmentDays - config.minSegmentDays + 1));
    state.elapsedDays = 0;
    state.rng = duration.state;
  }
  return next;
}

export function advanceConditionDay(world: ConditionWorld, date: string): ConditionWorldState {
  return {
    ...world.condition,
    players: Object.fromEntries(
      Object.entries(world.condition.players).map(([id, state]) => [
        id,
        advanceConditionState(state, world.definitions.conditionConfig!, date),
      ]),
    ),
  };
}

/** 試合の初回受取時だけ採取。実際の出場・ベンチ入りに依存させない。 */
export function sampleConditions(world: ConditionWorld, gameId: string): ConditionWorldState {
  if (world.condition.samples[gameId]) return world.condition;
  const game = world.definitions.schedule.find((g) => g.gameId === gameId)!;
  const samples: ConditionSample[] = [];
  for (const squadId of [game.awaySquadId, game.homeSquadId]) {
    const squad = worldSquad(world.definitions, squadId)!;
    const gameOrder = world.definitions.schedule.filter(
      (g) => g.date <= game.date && [g.awaySquadId, g.homeSquadId].includes(squadId),
    ).length;
    for (const playerId of registeredIds(world, squadId)) {
      const registration = world.registration.registrations.find(
        (r) => r.playerId === playerId && r.until === null,
      )!;
      samples.push({
        playerId,
        gameId,
        clubId: squad.team.clubId,
        squadId,
        registrationId: registration.registrationId,
        date: game.date,
        gameOrder,
        conditionMilli: world.condition.players[playerId]!.conditionMilli,
      });
    }
  }
  return { ...world.condition, samples: { ...world.condition.samples, [gameId]: samples } };
}

export function conditionStage(value: number, config: ConditionConfig): string {
  const index = config.stageBoundariesMilli.filter((boundary) => value >= boundary).length;
  return ['絶不調', '不調', '普通', '好調', '絶好調'][index]!;
}

/** 移動前後の接続は未決定。暫定表示は現在の登録期間だけを比較する。 */
export function compareConditionSamples(
  samples: ConditionSample[],
  registrationId: string,
  requestedGames: 5 | 10,
): ConditionComparison {
  const selected = samples
    .filter((s) => s.registrationId === registrationId)
    .sort((a, b) => a.date.localeCompare(b.date) || a.gameOrder - b.gameOrder)
    .slice(-requestedGames);
  const first = selected[0];
  const last = selected.at(-1);
  return {
    requestedGames,
    actualGames: selected.length,
    deltaMilli: selected.length >= 2 ? last!.conditionMilli - first!.conditionMilli : null,
    fromDate: first?.date ?? null,
    toDate: last?.date ?? null,
    firstGameId: first?.gameId ?? null,
    lastGameId: last?.gameId ?? null,
  };
}

/** 画面には担当球団の段階と過去の比較だけを渡す。表示は乱数を消費しない。 */
export function conditionView(world: ConditionWorld) {
  const squad = world.definitions.squads.find(
    (s) => s.squadId === world.management.controlledSquadId,
  )!;
  const samples = Object.values(world.condition.samples).flat();
  return squad.players.map((player) => {
    const registration = world.registration.registrations.find(
      (r) => r.playerId === player.playerId && r.until === null,
    )!;
    const state = world.condition.players[player.playerId]!;
    const history = samples.filter((s) => s.playerId === player.playerId);
    return {
      playerId: player.playerId,
      displayName: player.familyName + ' ' + player.givenName,
      category: registration.category,
      stage: conditionStage(state.conditionMilli, world.definitions.conditionConfig!),
      lastUpdatedOn: state.lastUpdatedOn,
      five: compareConditionSamples(history, registration.registrationId, 5),
      ten: compareConditionSamples(history, registration.registrationId, 10),
    };
  });
}
