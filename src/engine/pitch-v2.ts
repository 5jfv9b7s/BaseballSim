import type { Fixture, PitchStep, PrototypeState, Ruling } from './types.ts';
import { MODEL } from './model.ts';
import { PITCH_MODEL_V2 as m } from './model-v2.ts';
import { advanceCount, selectWeightedIndex } from './pitch.ts';
import type { PitchDecision } from '../game/types.ts';
import { nextRandom } from './rng.ts';
import { classifyZone } from './zone.ts';
import { ensure, id, integer, validateFixture, validateState } from './validation.ts';

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
// JSONで消える -0 を作らず、mm整数を保存可能な形へ正規化する。
const roundMm = (x: number) => Math.round(x) + 0;

export type PitchContext = Omit<PrototypeState, 'kind' | 'simulationVersion' | 'rulesetVersion'>;
export type PitchV2Step = Omit<PitchStep, 'state'> & {
  state: PitchContext;
  decision: PitchDecision;
};
function validateContext(context: PitchContext, fixture: Fixture) {
  // 共通のID・カウント・乱数検査だけを再利用。旧モデルとして計算・保存はしない。
  validateState(
    {
      ...context,
      kind: 'pitch-lab-v1',
      simulationVersion: MODEL.version,
      rulesetVersion: MODEL.rulesetVersion,
    },
    fixture,
  );
}

/** 純粋計算。入力を変更しない。React・DOM・DB・時計への依存なし。 */
export function simulatePitchV2(
  input: PitchContext,
  fixture: Fixture,
  commandId: string,
): PitchV2Step {
  validateFixture(fixture);
  validateContext(input, fixture);
  id(commandId);
  ensure(input.phase === 'readyForPitch', '未解決プレーで停止中です。新しい試行を開始してください');
  let rng = structuredClone(input.rng);
  const draw = () => {
    const next = nextRandom(rng);
    rng = next.state;
    return next.value;
  };
  const pitcher = fixture.players.find((p) => p.playerId === fixture.matchup.pitcherId)!;
  const batter = fixture.players.find((p) => p.playerId === fixture.matchup.batterId)!;
  const battingSide =
    batter.battingHand === 'S' ? (pitcher.throwingHand === 'R' ? 'L' : 'R') : batter.battingHand;
  const available = fixture.pitches.filter(
    (p) => p.playerId === pitcher.playerId && p.acquisitionProgressMilli === 100000,
  );
  const weights = available.map(
    (p) =>
      m.baseWeights[p.pitchTypeCode] *
      (input.count.strikes === 2 ? m.twoStrike[p.pitchTypeCode] : 1) *
      (input.count.balls === 3 ? m.threeBall[p.pitchTypeCode] : 1) *
      (battingSide !== pitcher.throwingHand ? m.oppositeSide[p.pitchTypeCode] : 1),
  );
  const pitch = available[selectWeightedIndex(weights, draw())]!;

  // 3ボールではゾーンへ戻し、2ストライクでは外側も狙う。
  const aimX =
    input.count.balls === 3
      ? m.threeBallAimXMm
      : input.count.strikes === 2
        ? m.chaseAimXMm
        : m.aimXMm;
  const aimZ =
    input.count.balls === 3
      ? m.threeBallAimZMm
      : input.count.strikes === 2
        ? m.chaseAimZMm
        : m.aimZMm;
  const intendedLocation = {
    xMm: aimX[Math.floor(draw() * 3)]!,
    zMm: aimZ[Math.floor(draw() * 3)]!,
  };
  const positionWidth =
    m.positionErrorMinMm + m.positionErrorScaleMm * (1 - pitch.control.valueMilli / 120000);
  const actualLocation = {
    xMm: roundMm(intendedLocation.xMm + (2 * draw() - 1) * positionWidth),
    zMm: roundMm(intendedLocation.zMm + (2 * draw() - 1) * positionWidth),
  };
  const velocityWidth =
    pitch.velocity.spreadCentiKph *
    (1 - (m.velocityRepeatabilityReduction * pitch.repeatability.valueMilli) / 120000);
  const velocityCentiKph = Math.round(
    clamp(
      pitch.velocity.typicalCentiKph + (2 * draw() - 1) * velocityWidth,
      5000,
      pitch.velocity.maxCentiKph,
    ),
  );
  const zoneCode = classifyZone(actualLocation, m.zone);
  const inside = zoneCode.startsWith('S_');
  const aggression = batter.swingAggressionMilli / 100000;
  const discipline = batter.batting.plateDiscipline.valueMilli / 120000;
  const swingProbability = swingChance(inside, aggression, discipline, input.count);
  const action = draw() < swingProbability ? 'swing' : 'take';
  const avoidance = avoidBodyContact(
    actualLocation,
    battingSide,
    velocityCentiKph,
    discipline,
    action === 'take' ? draw : null,
  );
  let contact: 'none' | 'foul' | 'fair' = 'none';
  let ruling: Ruling;
  let contactProbability: number | null = null;
  let foulProbability: number | null = null;
  if (action === 'take') {
    // 試作では球中心の分析矩形と宣告矩形が一致。正式規則ではない。
    ruling = inside ? 'calledStrike' : 'ball';
  } else {
    const ability =
      (pitcher.throwingHand === 'R' ? batter.batting.contactVsRight : batter.batting.contactVsLeft)
        .valueMilli / 120000;
    contactProbability = clamp(
      m.contactBase +
        m.contactAbility * ability -
        Math.max(0, velocityCentiKph / 100 - m.contactSpeedReferenceKph) *
          m.contactSpeedPenaltyPerKph -
        (inside ? 0 : m.contactOutsidePenalty),
      m.contactMin,
      m.contactMax,
    );
    if (draw() >= contactProbability) ruling = 'swingingStrike';
    else {
      foulProbability = clamp(
        m.foulBase -
          m.foulAbilityReduction * ability +
          (inside ? 0 : m.foulOutside) +
          (input.count.strikes === 2 ? m.foulTwoStrike : 0),
        0,
        1,
      );
      contact = draw() < foulProbability ? 'foul' : 'fair';
      ruling = contact === 'foul' ? 'foul' : 'inPlay';
    }
  }
  const transition = advanceCount(input.count, ruling);
  const state: PitchContext = {
    ...structuredClone(input),
    count: transition.count,
    nextEventSeq: input.nextEventSeq + 1,
    rng,
    phase: transition.stopReason ? 'prototypeStopped' : 'readyForPitch',
  };
  const step: PitchV2Step = {
    state,
    decision: {
      modelVersion: m.version,
      swingProbability,
      contactProbability,
      foulProbability,
      ...avoidance,
    },
    event: {
      kind: 'pitch',
      gameId: input.gameId,
      eventSeq: input.nextEventSeq,
      sourceCommandId: commandId,
      simulationVersion: m.version,
      rulesetVersion: m.rulesetVersion,
      before: { count: { ...input.count } },
      after: { count: { ...transition.count } },
      status: transition.stopReason ? 'requiresResolution' : 'pitchOnly',
      stopReason: transition.stopReason,
      pitch: {
        gameId: input.gameId,
        eventSeq: input.nextEventSeq,
        attemptNo: 1,
        appearanceId: input.activeAppearanceId,
        ...fixture.matchup,
        throwingSide: pitcher.throwingHand,
        battingSide,
        pitchId: pitch.pitchId,
        pitchTypeCode: pitch.pitchTypeCode,
        countBefore: { ...input.count },
        velocityCentiKph,
        intendedLocation,
        actualLocation,
        zoneBounds: { ...m.zone },
        zoneCode,
        zoneDefinitionVersion: 'design-v1.0',
        action,
        contact,
        ruling,
        measurement: {
          spinRateRpm: null,
          spinAxis: null,
          release: null,
          horizontalBreakMm: null,
          verticalBreakMm: null,
          modelOutputVersion: 'endpoint-only-v1',
          availableFields: [],
        },
        measurementModelVersion: 'endpoint-only-v1',
      },
    },
    trace: {
      selectionWeights: available.map((p, i) => ({ pitchId: p.pitchId, weight: weights[i]! })),
      positionErrorHalfWidthMm: positionWidth,
      velocityHalfWidthCentiKph: velocityWidth,
      swingProbability,
      contactProbability,
      foulProbability,
      rngBefore: structuredClone(input.rng),
      rngAfter: structuredClone(rng),
    },
  };
  validateContext(step.state, fixture);
  integer(velocityCentiKph, 5000, 20000, '実球速');
  for (const value of [swingProbability, contactProbability, foulProbability]) {
    ensure(
      value === null || (Number.isFinite(value) && value >= 0 && value <= 1),
      'モデルの出力確率が不正です',
    );
  }
  return step;
}

export function swingChance(
  inside: boolean,
  aggression: number,
  discipline: number,
  count: { balls: number; strikes: number },
): number {
  const base = inside
    ? m.swingInBase + m.swingInAggression * aggression + m.swingInDiscipline * discipline
    : m.swingOutBase + m.swingOutAggression * aggression - m.swingOutDiscipline * discipline;
  const protect = count.strikes === 2 ? (inside ? m.protectInside : m.protectOutside) : 0;
  const patience = count.balls === 3 && count.strikes < 2 ? m.threeBallPatience : 0;
  return clamp(base + protect - patience, 0, 1);
}

export function avoidBodyContact(
  location: { xMm: number; zMm: number },
  battingSide: 'R' | 'L',
  velocityCentiKph: number,
  discipline: number,
  draw: (() => number) | null,
): Pick<PitchDecision, 'bodyThreat' | 'avoidanceShiftMm' | 'hitByPitch'> {
  const sign = battingSide === 'R' ? -1 : 1;
  const center = sign * m.bodyCenterMm;
  const bodyThreat =
    Math.abs(location.xMm - center) <= m.bodyHalfWidthMm &&
    location.zMm >= m.bodyBottomMm &&
    location.zMm <= m.bodyTopMm;
  if (!bodyThreat || !draw) return { bodyThreat, avoidanceShiftMm: null, hitByPitch: false };
  const reaction =
    m.avoidanceReactionSeconds -
    m.avoidanceDisciplineReductionSeconds * discipline +
    m.avoidanceSurpriseSeconds * (1 - draw());
  const remaining = m.deliveryDistanceMeters / (velocityCentiKph / 360) - reaction;
  const shift = Math.round(
    clamp(remaining * m.avoidanceSpeedMetersPerSecond * 1000, 0, m.avoidanceMaxShiftMm),
  );
  return {
    bodyThreat,
    avoidanceShiftMm: shift,
    hitByPitch: Math.abs(location.xMm - (center + sign * shift)) <= m.bodyHalfWidthMm,
  };
}
