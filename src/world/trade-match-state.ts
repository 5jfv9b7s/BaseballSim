import { ensure, integer, validateRng } from '../engine/validation.ts';
import { dateDays } from '../finance/validation.ts';
import { growthBasis } from './growth-basis.ts';
import { validateRestRules } from './rest.ts';
import { validateFielderRestRules } from './fielder-rest.ts';
import type { TradeApplicationWorld, TradeSquadRoster } from './trade-application-types.ts';

/** 初期値へ戻して欠損を隠さず、試合入力に使う現在値を検査する。 */
export function validateTradeMatchState(
  world: TradeApplicationWorld,
  roster: TradeSquadRoster,
): void {
  const defs = world.initialDefinitions;
  ensure(
    world.version === 'trade-application-world-v1' &&
      defs.version === 'world-definitions-v26' &&
      world.growth.modelId === 'daily-development' &&
      world.growth.version === 'daily-development-v6' &&
      world.growth.schemaId === 'daily-development-state-v6' &&
      world.condition.version === 'condition-smooth-v1' &&
      world.physical.version === defs.physicalConfig?.version &&
      world.restControl.version === 'pitcher-rest-v1' &&
      world.fielderRest.version === 'fielder-rest-v1' &&
      world.reliefControl.version === 'conditional-relief-v1',
    '試合準備に対応する現在状態のモデル版が必要です',
  );
  ensure(defs.pitchProfiles && defs.performanceConfig, '試合の球種特性・補正設定がありません');
  const squadId = roster.squadId;
  const rest = world.restControl.teamPolicies[squadId];
  const fielder = world.fielderRest.teamPolicies[squadId];
  const relief = world.reliefControl.teamPolicies[squadId];
  ensure(rest && fielder && relief, '現在チームの休養・救援方針がありません');
  for (const policy of [rest, fielder, relief])
    integer(policy.policyRevision, 1, Number.MAX_SAFE_INTEGER, '方針版');
  validateRestRules(rest.teamRestPolicy);
  validateFielderRestRules(fielder.rules);
  const inputs = world.restControl.pitcherUsagePlans[squadId];
  ensure(inputs, '現在チームの個別休養設定がありません');
  for (const input of inputs.individualRest)
    if (input.mode === 'custom') validateRestRules(input.rules);

  for (const playerId of roster.registeredPlayerIds) {
    const physical = world.physical.players[playerId];
    const condition = world.condition.players[playerId];
    const growth = world.growth.state.players[playerId];
    ensure(physical && condition && growth, '登録選手の現在状態が欠けています');
    ensure(
      physical.lastUpdatedOn === world.currentDate && condition.lastUpdatedOn === world.currentDate,
      '登録選手の身体・調子の基準日が現在日付と一致しません',
    );
    integer(physical.energyMilli, 0, 100000, '現在体力');
    integer(physical.fatigueMilli, 0, 100000, '現在疲労');
    integer(condition.conditionMilli, 0, 100000, '現在調子');
    validateRng(growth.rng);
    validateRng(condition.conditionModelState.state.rng);
    for (const ability of growthBasis(defs, playerId))
      integer(growth.values[ability.key]!, 0, ability.ceilingMilli, ability.label + 'の現在値');
  }
  for (const pitch of roster.basePitches) {
    const current = world.growth.state.acquisition[pitch.pitchId];
    ensure(
      pitch.acquisitionProgressMilli === 100000 || current,
      '未習得球種の現在進度が記録されていません',
    );
    if (!current) continue;
    integer(current.progressMilli, pitch.acquisitionProgressMilli, 100000, '現在の球種習得進度');
    ensure(
      current.progressMilli === 100000 ? current.acquiredOn !== null : current.acquiredOn === null,
      '球種の習得日と現在進度が一致しません',
    );
    if (current.acquiredOn !== null) {
      dateDays(current.acquiredOn);
      ensure(current.acquiredOn < world.currentDate, '習得球種は習得完了日の翌日から使用します');
    }
  }
  for (const row of Object.values(world.restControl.appearances)) {
    if (!roster.registeredPlayerIds.includes(row.playerId)) continue;
    dateDays(row.date);
    ensure(row.date <= world.currentDate, '未来の登板履歴は休養判定に使用できません');
    integer(row.pitches, 1, Number.MAX_SAFE_INTEGER, '登板履歴の球数');
    ensure(new Set(row.innings).size === row.innings.length, '登板履歴のイニングが重複しています');
    for (const inning of row.innings)
      integer(inning, 1, Number.MAX_SAFE_INTEGER, '登板履歴のイニング');
  }
}
