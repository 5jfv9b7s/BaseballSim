import { PITCH_TYPES } from '../data/pitch-types/index.ts';
import { ensure, integer } from '../engine/validation.ts';
import type { Ability } from '../engine/types.ts';
import type { GameFixture, GameRecord } from './types.ts';
import {
  performanceGroups,
  type AbilityEffect,
  type PerformanceConfig,
  type PerformanceGroup,
  type PerformanceSnapshot,
  type PerformanceState,
} from './performance-types.ts';

export const performanceLabels: Record<PerformanceGroup, string> = {
  contact: 'ミート',
  power: 'パワー',
  discipline: '選球眼',
  running: '走力',
  fielding: '守備範囲・捕球',
  throwing: '肩力',
  control: '制球',
  repeatability: '投球再現性',
};

export function validatePerformanceConfig(config: PerformanceConfig): void {
  ensure(config?.version === 'pregame-performance-v1', '試合前補正の版が不正です');
  integer(config.minFactorPermille, 0, 1000, '補正倍率の下限');
  integer(config.maxFactorPermille, 1000, 2000, '補正倍率の上限');
  ensure(
    config.groups && Object.keys(config.groups).length === performanceGroups.length,
    '補正対象の全8区分が必要です',
  );
  for (const group of performanceGroups) {
    const rule = config.groups[group];
    ensure(rule, '補正区分が不足しています');
    integer(rule.conditionSwingPermille, 0, 1000, '調子の最大補正');
    integer(rule.energyPenaltyPermille, 0, 1000, '体力の最大減衰');
    integer(rule.fatiguePenaltyPermille, 0, 1000, '疲労の最大減衰');
  }
}

export function performanceFactors(
  state: PerformanceState,
  config: PerformanceConfig,
  group: PerformanceGroup,
) {
  const rule = config.groups[group];
  const conditionDelta = Math.round(
    ((state.conditionMilli - 50000) * rule.conditionSwingPermille) / 50000,
  );
  const energyPenalty = Math.round(
    ((100000 - state.energyMilli) * rule.energyPenaltyPermille) / 100000,
  );
  const fatiguePenalty = Math.round((state.fatigueMilli * rule.fatiguePenaltyPermille) / 100000);
  const factorPermille = Math.max(
    config.minFactorPermille,
    Math.min(config.maxFactorPermille, 1000 + conditionDelta - energyPenalty - fatiguePenalty),
  );
  return { conditionDelta, energyPenalty, fatiguePenalty, factorPermille };
}

function validateSnapshot(fixture: GameFixture, snapshot: PerformanceSnapshot): void {
  ensure(snapshot.version === 'pregame-performance-v1', '試合前補正の状態版が不正です');
  ensure(
    typeof snapshot.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(snapshot.date),
    '試合前補正の日付が不正です',
  );
  validatePerformanceConfig(snapshot.config);
  ensure(
    snapshot.players && Object.keys(snapshot.players).length === fixture.players.length,
    '試合前の全選手状態が必要です',
  );
  for (const player of fixture.players) {
    const state = snapshot.players[player.playerId];
    ensure(state, '試合前の選手状態がありません');
    for (const [name, value] of Object.entries(state)) integer(value, 0, 100000, name);
    integer(state.conditionMilli, 0, 100000, '試合前調子');
    integer(state.energyMilli, 0, 100000, '試合前体力');
    integer(state.fatigueMilli, 0, 100000, '試合前疲労');
  }
}

/** 投球・打撃・守備・走塁に共通の実効値を作る。元の値と成長上限は変更しない。 */
function project(fixture: GameFixture, snapshot: PerformanceSnapshot) {
  validateSnapshot(fixture, snapshot);
  const effective = structuredClone(fixture);
  const details: Record<string, AbilityEffect[]> = Object.fromEntries(
    fixture.players.map((p) => [p.playerId, []]),
  );
  const scale = (
    playerId: string,
    target: string,
    label: string,
    group: PerformanceGroup,
    ability: Ability,
  ): void => {
    const baseMilli = ability.valueMilli;
    const ceilingMilli = ability.ceilingMilli;
    const factor = performanceFactors(
      snapshot.players[playerId]!,
      snapshot.config,
      group,
    ).factorPermille;
    const effectiveMilli = Math.max(0, Math.min(120000, Math.round((baseMilli * factor) / 1000)));
    details[playerId]!.push({ target, label, group, baseMilli, ceilingMilli, effectiveMilli });
    ability.valueMilli = effectiveMilli;
    // 既存計算器のAbility形式へ渡す一時的な範囲。成長上限として保存・表示しない。
    ability.ceilingMilli = Math.max(ceilingMilli, effectiveMilli);
  };
  for (const p of effective.players) {
    scale(
      p.playerId,
      'batting.contactVsRight',
      'ミート（対右）',
      'contact',
      p.batting.contactVsRight,
    );
    scale(
      p.playerId,
      'batting.contactVsLeft',
      'ミート（対左）',
      'contact',
      p.batting.contactVsLeft,
    );
    scale(p.playerId, 'batting.plateDiscipline', '選球眼', 'discipline', p.batting.plateDiscipline);
    scale(p.playerId, 'powerVsRight', 'パワー（対右）', 'power', p.powerVsRight);
    scale(p.playerId, 'powerVsLeft', 'パワー（対左）', 'power', p.powerVsLeft);
    scale(p.playerId, 'runningSpeed', '走力', 'running', p.runningSpeed);
    scale(p.playerId, 'fieldingRange', '守備範囲', 'fielding', p.fieldingRange);
    scale(p.playerId, 'armStrength', '肩力', 'throwing', p.armStrength);
    if (p.fielding) scale(p.playerId, 'fielding.catching', '捕球', 'fielding', p.fielding.catching);
  }
  for (const p of effective.pitches) {
    scale(
      p.playerId,
      p.pitchId + '.control',
      PITCH_TYPES[p.pitchTypeCode].name + '：制球',
      'control',
      p.control,
    );
    scale(
      p.playerId,
      p.pitchId + '.repeatability',
      PITCH_TYPES[p.pitchTypeCode].name + '：再現性',
      'repeatability',
      p.repeatability,
    );
  }
  return { effective, details };
}

function freeze(value: unknown): void {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
}
const cache = new WeakMap<GameFixture, WeakMap<PerformanceSnapshot, ReturnType<typeof project>>>();

/** 入力を深く固定した組み合わせだけを再利用。読込・複製後は改めて導出する。 */
function projection(fixture: GameFixture, snapshot: PerformanceSnapshot) {
  const cached = cache.get(fixture)?.get(snapshot);
  if (cached) return cached;
  const result = project(fixture, snapshot);
  freeze(fixture);
  freeze(snapshot);
  freeze(result);
  const entries =
    cache.get(fixture) ?? new WeakMap<PerformanceSnapshot, ReturnType<typeof project>>();
  entries.set(snapshot, result);
  cache.set(fixture, entries);
  return result;
}

export function performanceFixture(
  record: Pick<GameRecord, 'fixture' | 'performance' | 'state'>,
): GameFixture {
  if (!record.performance) return record.fixture;
  ensure(
    record.state.simulationVersion === 'game-prototype-v10' &&
      record.performance.gameId === record.state.gameId,
    '試合前補正と試合の対応が不正です',
  );
  return projection(record.fixture, record.performance).effective;
}

export function performanceDetails(fixture: GameFixture, snapshot: PerformanceSnapshot) {
  const details = projection(fixture, snapshot).details;
  return fixture.players.map((player) => ({
    playerId: player.playerId,
    displayName: player.familyName + ' ' + player.givenName,
    ...snapshot.players[player.playerId]!,
    groups: performanceGroups
      .filter((group) => details[player.playerId]!.some((a) => a.group === group))
      .map((group) => ({
        group,
        label: performanceLabels[group],
        ...performanceFactors(snapshot.players[player.playerId]!, snapshot.config, group),
      })),
    abilities: details[player.playerId]!,
  }));
}
