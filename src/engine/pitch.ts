import type { Count, Fixture, PitchStep, PrototypeState, Ruling, StopReason } from './types.ts';
import { MODEL as m } from './model.ts';
import { nextRandom } from './rng.ts';
import { classifyZone } from './zone.ts';
import { ensure, id, integer, validateCount, validateFixture, validateState } from './validation.ts';

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
// JSONで消える -0 を作らず、mm整数を保存可能な形へ正規化する。
const roundMm = (x: number) => Math.round(x) + 0;

export function selectWeightedIndex(weights: number[], draw: number): number {
  ensure(weights.length > 0 && weights.every(w => Number.isFinite(w) && w >= 0), '選択重みが不正です');
  const total = weights.reduce((sum, w) => sum + w, 0);
  ensure(Number.isFinite(total) && total > 0, '選択重みの合計は正の有限数が必要です');
  ensure(Number.isFinite(draw) && draw >= 0 && draw < 1, '抽選値が不正です');
  const target = draw * total;
  let cumulative = 0;
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i]!;
    if (target < cumulative) return i;
  }
  // 浮動小数の丸めでtargetがtotalに一致した場合もゼロ重みは選ばない。
  for (let i = weights.length - 1; i >= 0; i--) if (weights[i]! > 0) return i;
  throw new Error('選択可能な重みがありません');
}

/** 終了球は未解決として止め、4ボール/3ストライクをCountへ残さない。 */
export function advanceCount(before: Count, ruling: Ruling): { count: Count; stopReason: StopReason | null } {
  validateCount(before);
  if (ruling === 'inPlay') return { count: { ...before }, stopReason: 'inPlayPending' };
  if (ruling === 'ball') {
    if (before.balls === 3) return { count: { ...before }, stopReason: 'walkPending' };
    return { count: { ...before, balls: before.balls + 1 }, stopReason: null };
  }
  if (ruling === 'foul') return { count: { ...before, strikes: Math.min(2, before.strikes + 1) }, stopReason: null };
  ensure(ruling === 'calledStrike' || ruling === 'swingingStrike', '未対応の宣告です');
  if (before.strikes === 2) return { count: { ...before }, stopReason: 'strikeoutPending' };
  return { count: { ...before, strikes: before.strikes + 1 }, stopReason: null };
}

/** 純粋計算。入力を変更しない。React・DOM・DB・時計への依存なし。 */
export function simulatePitch(input: PrototypeState, fixture: Fixture, commandId: string): PitchStep {
  validateFixture(fixture); validateState(input, fixture); id(commandId);
  ensure(input.phase === 'readyForPitch', '未解決プレーで停止中です。新しい試行を開始してください');
  let rng = structuredClone(input.rng);
  const draw = () => { const next = nextRandom(rng); rng = next.state; return next.value; };
  const pitcher = fixture.players.find(p => p.playerId === fixture.matchup.pitcherId)!;
  const batter = fixture.players.find(p => p.playerId === fixture.matchup.batterId)!;
  const battingSide = batter.battingHand === 'S' ? (pitcher.throwingHand === 'R' ? 'L' : 'R') : batter.battingHand;
  const available = fixture.pitches.filter(p => p.playerId === pitcher.playerId && p.acquisitionProgressMilli === 100000);
  const weights = available.map(p => m.baseWeights[p.pitchTypeCode]
    * (input.count.strikes === 2 ? m.twoStrike[p.pitchTypeCode] : 1)
    * (input.count.balls === 3 ? m.threeBall[p.pitchTypeCode] : 1)
    * (battingSide !== pitcher.throwingHand ? m.oppositeSide[p.pitchTypeCode] : 1));
  const pitch = available[selectWeightedIndex(weights, draw())]!;

  // 狙いは3×3セルの中心を等確率で選ぶ。配球判断能力は未適用。
  const intendedLocation = { xMm: [-144, 0, 144][Math.floor(draw() * 3)]!, zMm: [600, 800, 1000][Math.floor(draw() * 3)]! };
  const positionWidth = m.positionErrorMinMm + m.positionErrorScaleMm * (1 - pitch.control.valueMilli / 120000);
  const actualLocation = { xMm: roundMm(intendedLocation.xMm + (2 * draw() - 1) * positionWidth),
    zMm: roundMm(intendedLocation.zMm + (2 * draw() - 1) * positionWidth) };
  const velocityWidth = pitch.velocity.spreadCentiKph * (1 - m.velocityRepeatabilityReduction * pitch.repeatability.valueMilli / 120000);
  const velocityCentiKph = Math.round(clamp(pitch.velocity.typicalCentiKph + (2 * draw() - 1) * velocityWidth, 5000, pitch.velocity.maxCentiKph));
  const zoneCode = classifyZone(actualLocation, m.zone);
  const inside = zoneCode.startsWith('S_');
  const aggression = batter.swingAggressionMilli / 100000;
  const discipline = batter.batting.plateDiscipline.valueMilli / 120000;
  const swingProbability = clamp(inside
    ? m.swingInBase + m.swingInAggression * aggression + m.swingInDiscipline * discipline
    : m.swingOutBase + m.swingOutAggression * aggression - m.swingOutDiscipline * discipline, 0, 1);
  const action = draw() < swingProbability ? 'swing' : 'take';
  let contact: 'none' | 'foul' | 'fair' = 'none';
  let ruling: Ruling;
  let contactProbability: number | null = null;
  let foulProbability: number | null = null;
  if (action === 'take') {
    // 試作では球中心の分析矩形と宣告矩形が一致。正式規則ではない。
    ruling = inside ? 'calledStrike' : 'ball';
  } else {
    const ability = (pitcher.throwingHand === 'R' ? batter.batting.contactVsRight : batter.batting.contactVsLeft).valueMilli / 120000;
    contactProbability = clamp(m.contactBase + m.contactAbility * ability
      - Math.max(0, velocityCentiKph / 100 - m.contactSpeedReferenceKph) * m.contactSpeedPenaltyPerKph
      - (inside ? 0 : m.contactOutsidePenalty), m.contactMin, m.contactMax);
    if (draw() >= contactProbability) ruling = 'swingingStrike';
    else {
      foulProbability = m.foulBase - m.foulAbilityReduction * ability;
      contact = draw() < foulProbability ? 'foul' : 'fair';
      ruling = contact === 'foul' ? 'foul' : 'inPlay';
    }
  }
  const transition = advanceCount(input.count, ruling);
  const state: PrototypeState = { ...structuredClone(input), count: transition.count,
    nextEventSeq: input.nextEventSeq + 1, rng, phase: transition.stopReason ? 'prototypeStopped' : 'readyForPitch' };
  const step: PitchStep = {
    state,
    event: { kind: 'pitch', gameId: input.gameId, eventSeq: input.nextEventSeq, sourceCommandId: commandId,
      simulationVersion: m.version, rulesetVersion: m.rulesetVersion,
      before: { count: { ...input.count } }, after: { count: { ...transition.count } },
      status: transition.stopReason ? 'requiresResolution' : 'pitchOnly', stopReason: transition.stopReason,
      pitch: { gameId: input.gameId, eventSeq: input.nextEventSeq, attemptNo: 1, appearanceId: input.activeAppearanceId,
        ...fixture.matchup, throwingSide: pitcher.throwingHand, battingSide, pitchId: pitch.pitchId, pitchTypeCode: pitch.pitchTypeCode,
        countBefore: { ...input.count }, velocityCentiKph, intendedLocation, actualLocation,
        zoneBounds: { ...m.zone }, zoneCode, zoneDefinitionVersion: 'design-v1.0', action, contact, ruling,
        measurement: { spinRateRpm: null, spinAxis: null, release: null, horizontalBreakMm: null, verticalBreakMm: null,
          modelOutputVersion: 'endpoint-only-v1', availableFields: [] }, measurementModelVersion: 'endpoint-only-v1' } },
    trace: { selectionWeights: available.map((p, i) => ({ pitchId: p.pitchId, weight: weights[i]! })),
      positionErrorHalfWidthMm: positionWidth, velocityHalfWidthCentiKph: velocityWidth,
      swingProbability, contactProbability, foulProbability, rngBefore: structuredClone(input.rng), rngAfter: structuredClone(rng) },
  };
  validateState(step.state, fixture);
  integer(velocityCentiKph, 5000, 20000, '実球速');
  for (const value of [swingProbability, contactProbability, foulProbability]) {
    ensure(value === null || (Number.isFinite(value) && value >= 0 && value <= 1), 'モデルの出力確率が不正です');
  }
  return step;
}
