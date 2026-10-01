import { ensure, integer } from '../engine/validation.ts';
import type { GameRecord } from '../game/types.ts';
import type { WorldDefinitions, WorldRecord } from './types.ts';
import type { ActivityKind, ActivityLoad, PhysicalWorldState } from './physical-types.ts';

export type PhysicalWorld = Extract<WorldRecord, { physical: PhysicalWorldState }>;
export const activityKey = (playerId: string, date: string) => JSON.stringify([playerId, date]);

export function validatePhysicalDefinitions(definitions: WorldDefinitions): void {
  const config = definitions.physicalConfig;
  ensure(config?.version === 'physical-load-v1', '身体モデルの設定が必要です');
  for (const kind of ['pitching', 'batting', 'fielding', 'running', 'preparation'] as const)
    integer(config.workloadUnits[kind], 0, 100000, '活動の負荷単位');
  for (const value of [config.energyCostMilli, config.fatigueCostMilli])
    integer(value, 0, 100000, '消耗係数');
  for (const key of [
    'energyBaseMilli',
    'energyAbilityMilli',
    'fatigueBaseMilli',
    'fatigueAbilityMilli',
    'restEnergyBonusMilli',
    'restFatigueBonusMilli',
  ] as const)
    integer(config.dailyRecovery[key], 0, 100000, '回復係数');
  integer(config.restAdvice.energyAtOrBelowMilli, 0, 100000, '体力の目安');
  integer(config.restAdvice.fatigueAtOrAboveMilli, 0, 100000, '疲労の目安');

  for (const squad of definitions.squads) {
    const inputs = squad.physicalInputs;
    ensure(
      Array.isArray(inputs) && inputs.length === squad.players.length,
      '全選手の身体入力が必要です',
    );
    const seen = new Set<string>();
    for (const input of inputs) {
      ensure(
        !seen.has(input.playerId) && squad.players.some((p) => p.playerId === input.playerId),
        '身体入力の選手が重複、または所属外です',
      );
      seen.add(input.playerId);
      for (const ability of [input.physical.stamina, input.physical.recovery]) {
        integer(ability.ceilingMilli, 0, 120000, '身体能力の上限');
        integer(ability.valueMilli, 0, ability.ceilingMilli, '身体能力');
      }
      integer(input.energyMilli, 0, 100000, '現在体力');
      integer(input.fatigueMilli, 0, 100000, '蓄積疲労');
    }
  }
}

export function initialPhysical(definitions: WorldDefinitions): PhysicalWorldState {
  return {
    version: 'physical-load-v1',
    players: Object.fromEntries(
      definitions.squads.flatMap((squad) =>
        squad.physicalInputs!.map((input) => [
          input.playerId,
          {
            energyMilli: input.energyMilli,
            fatigueMilli: input.fatigueMilli,
            lastUpdatedOn: definitions.startDate,
          },
        ]),
      ),
    ),
    activityLoads: {},
    appliedEvents: {},
    recoveries: {},
  };
}

/** 完了試合の検証キャッシュ経由でも、未反映のイベントだけを同じ順で処理する。 */
export function applyPhysicalGame(
  world: PhysicalWorld,
  gameId: string,
  game: GameRecord,
): PhysicalWorldState {
  const previous = world.physical;
  const applied = previous.appliedEvents[gameId] ?? 0;
  ensure(applied <= game.events.length, '反映済みの活動を巻き戻せません');
  if (applied === game.events.length) return previous;
  const config = world.definitions.physicalConfig!;
  const inputs = new Map(
    world.definitions.squads.flatMap((s) => s.physicalInputs!.map((p) => [p.playerId, p] as const)),
  );
  const next = {
    ...previous,
    players: { ...previous.players },
    activityLoads: { ...previous.activityLoads },
    appliedEvents: { ...previous.appliedEvents, [gameId]: game.events.length },
  };
  const touched = new Set<string>();

  function load(playerId: string, kind: ActivityKind, count: number) {
    if (count <= 0) return;
    const key = activityKey(playerId, world.currentDate);
    if (!touched.has(key)) {
      next.players[playerId] = { ...next.players[playerId]! };
      next.activityLoads[key] = previous.activityLoads[key]
        ? structuredClone(previous.activityLoads[key])
        : { playerId, date: world.currentDate, sourceLoads: [] };
      touched.add(key);
    }
    const row = next.activityLoads[key]!;
    const sourceKey = JSON.stringify([gameId, 1, kind]);
    let source = row.sourceLoads.find((s) => s.sourceKey === sourceKey);
    if (!source) {
      source = {
        sourceKey,
        kind,
        workloadUnits: 0,
        actualCounts: 0,
        energySpentMilli: 0,
        fatigueAddedMilli: 0,
      };
      row.sourceLoads.push(source);
    }
    const workload = config.workloadUnits[kind] * count;
    const stamina = inputs.get(playerId)!.physical.stamina.valueMilli;
    const energy = Math.round(
      (((workload * config.energyCostMilli) / 1000) * 120000) / (60000 + stamina),
    );
    const fatigue = Math.round(
      (((workload * config.fatigueCostMilli) / 1000) * 120000) / (60000 + stamina),
    );
    const state = next.players[playerId]!;
    source.actualCounts += count;
    source.workloadUnits += workload;
    source.energySpentMilli += Math.min(state.energyMilli, energy);
    source.fatigueAddedMilli += Math.min(100000 - state.fatigueMilli, fatigue);
    state.energyMilli = Math.max(0, state.energyMilli - energy);
    state.fatigueMilli = Math.min(100000, state.fatigueMilli + fatigue);
  }

  for (const event of game.events.slice(applied)) {
    if (!event.pitch) continue;
    const pitch = event.pitch;
    const sources =
      next.activityLoads[activityKey(pitch.pitcherId, world.currentDate)]?.sourceLoads;
    // 実際に登板した投手だけ、初球直前の準備を1試合1回。未登板準備は未対応。
    if (!sources?.some((s) => s.sourceKey === JSON.stringify([gameId, 1, 'preparation'])))
      load(pitch.pitcherId, 'preparation', 1);
    load(pitch.pitcherId, 'pitching', 1);
    load(pitch.batterId, 'batting', 1);
    ensure(event.defensiveAlignment, '身体負荷には投球時の守備配置が必要です');
    for (const defender of event.defensiveAlignment)
      if (defender.position !== 'P') load(defender.playerId, 'fielding', 1);
    for (const action of event.runnerActions) {
      const from = action.from === 'batter' ? 0 : action.from;
      const to = action.to === 'home' ? 4 : action.to;
      load(action.runnerId, 'running', to - from);
    }
    // 出塁しなかった打者や封殺走者にも、試みた進塁の負荷を残す。
    for (const out of event.outDecisions) {
      if (out.kind === 'strikeout' || event.runnerActions.some((a) => a.runnerId === out.playerId))
        continue;
      const baseIndex = event.before.baseOccupants.findIndex(
        (r) => r?.currentRunnerId === out.playerId,
      );
      const from = baseIndex + 1;
      load(out.playerId, 'running', Math.max(1, (out.atBase ?? 1) - from));
    }
  }
  return next;
}

/** 全試合の終了後、暦日につき一度。休養日は実績ゼロで判断し、登録区分は使わない。 */
export function recoverPhysicalDay(world: PhysicalWorld, nextDate: string): PhysicalWorldState {
  const config = world.definitions.physicalConfig!.dailyRecovery;
  const next: PhysicalWorldState = {
    ...world.physical,
    players: { ...world.physical.players },
    recoveries: { ...world.physical.recoveries },
  };
  for (const input of world.definitions.squads.flatMap((s) => s.physicalInputs!)) {
    const key = activityKey(input.playerId, world.currentDate);
    ensure(!next.recoveries[key], 'この日の回復は反映済みです');
    const before = next.players[input.playerId]!;
    const rested = !next.activityLoads[key]?.sourceLoads.some((s) => s.actualCounts > 0);
    const rate = input.physical.recovery.valueMilli / 120000;
    const energy = Math.round(
      config.energyBaseMilli +
        config.energyAbilityMilli * rate +
        (rested ? config.restEnergyBonusMilli : 0),
    );
    const fatigue = Math.round(
      config.fatigueBaseMilli +
        config.fatigueAbilityMilli * rate +
        (rested ? config.restFatigueBonusMilli : 0),
    );
    const state = {
      energyMilli: Math.min(100000, before.energyMilli + energy),
      fatigueMilli: Math.max(0, before.fatigueMilli - fatigue),
      lastUpdatedOn: nextDate,
    };
    next.players[input.playerId] = state;
    next.recoveries[key] = {
      playerId: input.playerId,
      date: world.currentDate,
      rested,
      energyRecoveredMilli: state.energyMilli - before.energyMilli,
      fatigueRecoveredMilli: before.fatigueMilli - state.fatigueMilli,
    };
  }
  return next;
}

export function physicalView(world: PhysicalWorld) {
  const squad = world.definitions.squads.find(
    (s) => s.squadId === world.management.controlledSquadId,
  )!;
  return squad.physicalInputs!.map((input) => {
    const player = squad.players.find((p) => p.playerId === input.playerId)!;
    const state = world.physical.players[input.playerId]!;
    const activity = world.physical.activityLoads[activityKey(input.playerId, world.currentDate)];
    const previousKey =
      world.lastCompletedDate && activityKey(input.playerId, world.lastCompletedDate);
    const advice = world.definitions.physicalConfig!.restAdvice;
    const reasons: string[] = [];
    if (state.energyMilli <= advice.energyAtOrBelowMilli) reasons.push('体力低下');
    if (state.fatigueMilli >= advice.fatigueAtOrAboveMilli) reasons.push('疲労蓄積');
    return {
      ...input,
      ...state,
      displayName: player.familyName + ' ' + player.givenName,
      activity: activity ?? null,
      previousActivity: previousKey ? (world.physical.activityLoads[previousKey] ?? null) : null,
      recovery: previousKey ? (world.physical.recoveries[previousKey] ?? null) : null,
      restReasons: reasons,
    };
  });
}

export function activityCounts(activity: ActivityLoad | null, kind: ActivityKind): number {
  return (
    activity?.sourceLoads
      .filter((s) => s.kind === kind)
      .reduce((sum, s) => sum + s.actualCounts, 0) ?? 0
  );
}
