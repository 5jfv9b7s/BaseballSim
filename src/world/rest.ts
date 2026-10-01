import { ensure, integer } from '../engine/validation.ts';
import { allWorldSquads, worldSquad } from './squads.ts';
import type { GameRecord } from '../game/types.ts';
import type { WorldDefinitions, WorldRecord } from './types.ts';
import type {
  RestControl,
  RestRules,
  RestPolicyInput,
  RestPolicyAction,
  RestDecision,
} from './rest-types.ts';

export type RestWorld = Extract<WorldRecord, { restControl: RestControl }>;
const daysBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86400000;

export function validateRestRules(rules: RestRules): void {
  ensure(
    rules && ['none', 'preferRest', 'benchRest'].includes(rules.action),
    '休養の扱いが不正です',
  );
  integer(rules.recentDays, 1, 14, '直近球数の対象日数');
  for (const [value, min, max, label] of [
    [rules.consecutiveDays, 1, 14, '連投日数'],
    [rules.recentPitches, 1, 3000, '直近球数'],
    [rules.previousDayInnings, 2, 12, '前日の登板イニング数'],
    [rules.energyMilli, 0, 100000, '体力の基準'],
    [rules.fatigueMilli, 0, 100000, '疲労の基準'],
  ] as const)
    if (value !== null) integer(value, min, max, label);
}

function validateInput(definitions: WorldDefinitions, input: RestPolicyInput): void {
  const squad = worldSquad(definitions, input.squadId);
  ensure(squad, '休養設定のチームがありません');
  validateRestRules(input.teamRestPolicy);
  ensure(Array.isArray(input.individualRest), '個別休養設定が必要です');
  ensure(
    new Set(input.individualRest.map((row) => row.playerId)).size === input.individualRest.length,
    '個別休養設定が重複しています',
  );
  for (const entry of input.individualRest) {
    ensure(squad.team.pitcherIds.includes(entry.playerId), '所属投手以外の休養設定です');
    ensure(entry.mode === 'inherit' || entry.mode === 'custom', '休養の継承設定が不正です');
    if (entry.mode === 'custom') validateRestRules(entry.rules);
    else ensure(!('rules' in entry), '継承する場合は個別条件を保存しません');
  }
}

export function validateRestDefinitions(definitions: WorldDefinitions): void {
  ensure(definitions.restModelVersion === 'pitcher-rest-v1', '休養モデルの版が不正です');
  const inputs = definitions.restPolicyInputs;
  ensure(
    Array.isArray(inputs) && inputs.length === allWorldSquads(definitions).length,
    '全チームの休養設定が必要です',
  );
  ensure(
    new Set(inputs.map((input) => input.squadId)).size === inputs.length,
    'チームの休養設定が重複しています',
  );
  for (const input of inputs) validateInput(definitions, input);
}

export function initialRest(definitions: WorldDefinitions): RestControl {
  const inputs = definitions.restPolicyInputs!;
  return {
    version: 'pitcher-rest-v1',
    teamPolicies: Object.fromEntries(
      inputs.map((input) => [
        input.squadId,
        { teamRestPolicy: structuredClone(input.teamRestPolicy), policyRevision: 1 },
      ]),
    ),
    pitcherUsagePlans: Object.fromEntries(
      inputs.map((input) => [
        input.squadId,
        { individualRest: structuredClone(input.individualRest) },
      ]),
    ),
    appearances: {},
    appliedEvents: {},
  };
}

export function applyRestPolicy(world: RestWorld, action: RestPolicyAction): RestWorld {
  validateInput(world.definitions, action);
  return {
    ...world,
    restControl: {
      ...world.restControl,
      teamPolicies: {
        ...world.restControl.teamPolicies,
        [action.squadId]: {
          teamRestPolicy: structuredClone(action.teamRestPolicy),
          policyRevision: world.restControl.teamPolicies[action.squadId]!.policyRevision + 1,
        },
      },
      pitcherUsagePlans: {
        ...world.restControl.pitcherUsagePlans,
        [action.squadId]: { individualRest: structuredClone(action.individualRest) },
      },
    },
  };
}

/** 投球した日の実績を記録。途中保存・検証済み終了試合も未適用分だけ処理する。 */
export function recordPitchingAppearances(
  world: RestWorld,
  gameId: string,
  game: GameRecord,
): RestControl {
  const previous = world.restControl;
  const applied = previous.appliedEvents[gameId] ?? 0;
  ensure(applied <= game.events.length, '登板実績を巻き戻せません');
  if (applied === game.events.length) return previous;
  const next: RestControl = {
    ...previous,
    appearances: { ...previous.appearances },
    appliedEvents: { ...previous.appliedEvents, [gameId]: game.events.length },
  };
  const touched = new Set<string>();
  const scheduled = world.definitions.schedule.find((g) => g.gameId === gameId)!;
  for (const event of game.events.slice(applied)) {
    if (!event.pitch) continue;
    const playerId = event.pitch.pitcherId;
    const key = JSON.stringify([gameId, playerId]);
    if (!touched.has(key)) {
      next.appearances[key] = previous.appearances[key]
        ? structuredClone(previous.appearances[key])
        : {
            gameId,
            playerId,
            date: scheduled.date,
            squadId: event.before.half === 'top' ? scheduled.homeSquadId : scheduled.awaySquadId,
            pitches: 0,
            innings: [],
          };
      touched.add(key);
    }
    const appearance = next.appearances[key]!;
    appearance.pitches++;
    if (!appearance.innings.includes(event.before.inning))
      appearance.innings.push(event.before.inning);
  }
  return next;
}

/** 今日の投球は次戦の判定材料。試合前の身体状態と過去の実登板日を使う。 */
export function evaluateRest(world: RestWorld, squadId: string, playerId: string): RestDecision {
  const individual = world.restControl.pitcherUsagePlans[squadId]!.individualRest.find(
    (row) => row.playerId === playerId,
  );
  const rules =
    individual?.mode === 'custom'
      ? individual.rules
      : world.restControl.teamPolicies[squadId]!.teamRestPolicy;
  const prior = Object.values(world.restControl.appearances).filter(
    (row) => row.playerId === playerId && row.date < world.currentDate,
  );
  const last =
    prior
      .map((row) => row.date)
      .sort()
      .at(-1) ?? null;
  const dates = new Set(prior.map((row) => daysBetween(row.date, world.currentDate)));
  let consecutiveDays = 0;
  while (dates.has(consecutiveDays + 1)) consecutiveDays++;
  const state = world.physical.players[playerId]!;
  const metrics = {
    lastPitchedOn: last,
    restDays: last ? daysBetween(last, world.currentDate) - 1 : null,
    consecutiveDays,
    recentDays: rules.recentDays,
    recentPitches: prior
      .filter((row) => daysBetween(row.date, world.currentDate) <= rules.recentDays)
      .reduce((sum, row) => sum + row.pitches, 0),
    previousDayInnings: prior
      .filter((row) => daysBetween(row.date, world.currentDate) === 1)
      .reduce((sum, row) => sum + row.innings.length, 0),
    energyMilli: state.energyMilli,
    fatigueMilli: state.fatigueMilli,
  };
  const reasons: string[] = [];
  if (rules.action !== 'none') {
    if (rules.consecutiveDays !== null && consecutiveDays >= rules.consecutiveDays)
      reasons.push('連投日数');
    if (rules.recentPitches !== null && metrics.recentPitches >= rules.recentPitches)
      reasons.push('直近投球数');
    if (rules.previousDayInnings !== null && metrics.previousDayInnings >= rules.previousDayInnings)
      reasons.push('前日の回跨ぎ');
    if (rules.energyMilli !== null && state.energyMilli <= rules.energyMilli)
      reasons.push('体力低下');
    if (rules.fatigueMilli !== null && state.fatigueMilli >= rules.fatigueMilli)
      reasons.push('疲労蓄積');
  }
  return {
    playerId,
    mode: individual?.mode ?? 'inherit',
    metrics,
    reasons,
    requested: reasons.length ? (rules.action as 'preferRest' | 'benchRest') : 'available',
    outcome: 'notSelected',
    exception: null,
  };
}

/** 優先順位が同じなら、既存の投手運用順を維持する。乱数を使わない。 */
export function restRank(decision: RestDecision): number {
  return decision.requested === 'available' ? 0 : decision.requested === 'preferRest' ? 1 : 2;
}
