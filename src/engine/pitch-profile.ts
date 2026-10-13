import { swingChance, contactChance, avoidBodyContact } from './pitch-configured.ts';
import { pitchMovement } from './pitch-movement.ts';
import type { Fixture, PitchStep, PrototypeState, Ruling } from './types.ts';
import { MODEL } from './model.ts';
import type { MatchConfig } from '../game/config.ts';
import { GAME_MODEL_V11 } from '../game/model-v11.ts';
import { advanceCount, selectWeightedIndex } from './pitch.ts';
import type { PitchDecision } from '../game/types.ts';
import { nextRandom } from './rng.ts';
import { classifyZone } from './zone.ts';
import { ensure, id, integer, validateFixture, validateState } from './validation.ts';

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
// JSONで消える -0 を作らず、mm整数を保存可能な形へ正規化する。
const roundMm = (x: number) => Math.round(x) + 0;

export type PitchContext = Omit<PrototypeState, 'kind' | 'simulationVersion' | 'rulesetVersion'>;
export type ConfiguredPitchStep = Omit<PitchStep, 'state'> & {
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
export function simulateProfilePitch(
  input: PitchContext,
  fixture: Fixture,
  commandId: string,
  config: MatchConfig['pitch'],
): ConfiguredPitchStep {
  const m = {
    ...config,
    version: GAME_MODEL_V11.pitchModelVersion,
    rulesetVersion: GAME_MODEL_V11.rulesetVersion,
  };
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
  const profiles = fixture.pitchProfiles!;
  ensure(profiles, '球種特性が必要です');
  const weights = available.map((p) => {
    const selection = profiles.profiles.find(
      (profile) => profile.code === p.pitchTypeCode,
    )!.selection;
    return (
      selection.baseWeight *
      (input.count.strikes === 2 ? selection.twoStrike : 1) *
      (input.count.balls === 3 ? selection.threeBall : 1) *
      (battingSide !== pitcher.throwingHand ? selection.oppositeSide : 1)
    );
  });
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
  const delivery =
    pitch.delivery ?? profiles.profiles.find((p) => p.code === pitch.pitchTypeCode)!.delivery;
  const spinWidth = delivery.spinSpreadRpm * (1 - pitch.repeatability.valueMilli / 120000);
  const spinRateRpm = Math.round(delivery.spinRateRpm + (2 * draw() - 1) * spinWidth);
  const movement = pitchMovement(
    delivery,
    spinRateRpm,
    velocityCentiKph,
    pitcher.throwingHand,
    profiles.movement,
  );
  const expected = pitchMovement(
    delivery,
    delivery.spinRateRpm,
    velocityCentiKph,
    pitcher.throwingHand,
    profiles.movement,
  );
  // 狙いは到達目標。平均の変化を織り込み、回転の再現誤差だけを位置へ加える。
  actualLocation.xMm += movement.horizontalBreakMm - expected.horizontalBreakMm;
  actualLocation.zMm += movement.verticalBreakMm - expected.verticalBreakMm;
  const zoneCode = classifyZone(actualLocation, m.zone);
  const inside = zoneCode.startsWith('S_');
  const aggression = batter.swingAggressionMilli / 100000;
  const discipline = batter.batting.plateDiscipline.valueMilli / 120000;
  const unread =
    1 - profiles.movement.recognitionBase - profiles.movement.recognitionDiscipline * discipline;
  const perceived = {
    xMm: roundMm(actualLocation.xMm - movement.horizontalBreakMm * unread),
    zMm: roundMm(actualLocation.zMm - movement.verticalBreakMm * unread),
  };
  const perceivedInside = classifyZone(perceived, m.zone).startsWith('S_');
  const swingProbability = swingChance(perceivedInside, aggression, discipline, input.count, m);
  const action = draw() < swingProbability ? 'swing' : 'take';
  const avoidance = avoidBodyContact(
    actualLocation,
    battingSide,
    velocityCentiKph,
    discipline,
    action === 'take' ? draw : null,
    m,
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
    const unreadMeters =
      Math.hypot(actualLocation.xMm - perceived.xMm, actualLocation.zMm - perceived.zMm) / 1000;
    contactProbability = clamp(
      contactChance(inside, ability, velocityCentiKph, input.count.strikes, m) -
        unreadMeters * profiles.movement.contactPenaltyPerMeter,
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
  const step: ConfiguredPitchStep = {
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
          spinRateRpm,
          ...movement,
          modelOutputVersion: 'pitch-shape-v1',
          availableFields: [
            'spinRateRpm',
            'spinAxis',
            'release',
            'horizontalBreakMm',
            'verticalBreakMm',
          ],
        },
        measurementModelVersion: 'pitch-shape-v1',
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
