import type { PitchRecord, RngState } from '../engine/types.ts';
import { nextRandom } from '../engine/rng.ts';
import { getPlayer } from './fixture.ts';
import { FIELD_POSITIONS } from './model.ts';
import type { MatchConfig } from './config.ts';
import { GAME_MODEL_V7 } from './model-v7.ts';
import { integer } from '../engine/validation.ts';
import type { BattedBall, GameFixture, TeamSide } from './types.ts';

/** 接触した球から軌道と到達時間を生成する。安打・凡退を先に抽選しない。 */
export function generateConfiguredBattedBall(
  pitch: PitchRecord,
  fixture: GameFixture,
  defense: TeamSide,
  rngInput: RngState,
  config: MatchConfig,
): { ball: BattedBall; rng: RngState } {
  const m = { ...GAME_MODEL_V7, ...config.battedBall, ...config.running };
  let rng = rngInput;
  const draw = () => {
    const next = nextRandom(rng);
    rng = next.state;
    return next.value;
  };
  const batter = getPlayer(fixture, pitch.batterId);
  const power =
    (pitch.throwingSide === 'R' ? batter.powerVsRight : batter.powerVsLeft).valueMilli / 120000;
  const contactQuality = contactQualityFor(pitch, fixture, config.battedBall);
  const speedKph =
    m.exitSpeedBaseKph +
    m.exitSpeedPowerKph * power +
    (m.exitSpeedPitchFactor * pitch.velocityCentiKph) / 100 +
    (draw() - 0.5) * m.exitSpeedNoiseKph -
    contactQuality.exitSpeedPenaltyCentiKph / 100;
  const angle = launchAngle(draw(), config.battedBall);
  const bearing = -45 + 90 * draw();
  const bearingCentiDegree = Math.round(bearing * 100) + 0;
  const radians = (angle * Math.PI) / 180;
  const speed = speedKph / 3.6;
  const vx = speed * Math.cos(radians) * m.airborneDragFactor;
  const vz = speed * Math.sin(radians);
  const flight =
    (vz + Math.sqrt(vz * vz + 2 * m.gravityMetersPerSecond2)) / m.gravityMetersPerSecond2;
  const ground = angle < 10;
  const distance = ground ? 12 + speed * 1.6 : vx * flight;
  const fence =
    m.fenceCenterMeters - ((m.fenceCenterMeters - m.fenceCornerMeters) * Math.abs(bearing)) / 45;
  const fenceTime = fence / Math.max(vx, 0.001);
  const heightAtFence = 1 + vz * fenceTime - 0.5 * m.gravityMetersPerSecond2 * fenceTime ** 2;
  const homeRun = !ground && distance >= fence && heightAtFence >= m.fenceHeightMeters;
  const landingDistance = Math.min(distance, fence);
  const x = landingDistance * Math.sin((bearing * Math.PI) / 180);
  const y = landingDistance * Math.cos((bearing * Math.PI) / 180);
  const runnerSpeed =
    m.runnerBaseMetersPerSecond +
    (m.runnerAbilityMetersPerSecond * batter.runningSpeed.valueMilli) / 120000;
  const batterTime = 0.25 + m.baseDistanceMeters / runnerSpeed;
  const fielders = [
    ...fixture.teams[defense].lineup.filter((p) => p.position !== 'DH'),
    { playerId: pitch.pitcherId, position: 'P' as const },
  ];

  let best: {
    id: string;
    position: BattedBall['fieldingPosition'];
    distance: number;
    reach: number;
    time: number;
    catchTimeMs: number;
    catchLocation: { xMm: number; yMm: number };
  } | null = null;
  for (const fielder of fielders) {
    if (fielder.position === 'DH') continue;
    const p = getPlayer(fixture, fielder.playerId);
    const position = FIELD_POSITIONS[fielder.position];
    // ゴロは各守備位置の深さを通過する時点で捕球・送球を評価する。
    const depth = ground
      ? Math.min(landingDistance, Math.hypot(position.x, position.y))
      : landingDistance;
    const targetX = depth * Math.sin((bearing * Math.PI) / 180);
    const targetY = depth * Math.cos((bearing * Math.PI) / 180);
    const gap = Math.hypot(targetX - position.x, targetY - position.y);
    const time = ground ? depth / (speed * 0.65) : flight;
    const reaction =
      m.fielderReactionBaseSeconds -
      (m.fielderReactionReductionSeconds * p.fieldingRange.valueMilli) / 120000;
    const movement = 4 + (4 * p.runningSpeed.valueMilli) / 120000;
    const reach = fielderTravel(Math.max(0, time - reaction), movement, config.battedBall) + 1.2;
    const throwSpeed =
      m.throwBaseMetersPerSecond +
      (m.throwAbilityMetersPerSecond * p.armStrength.valueMilli) / 120000;
    const throwTime = Math.hypot(targetX - 19.397, targetY - 19.397) / throwSpeed;
    const total = time + config.plays.transferSeconds + throwTime;
    if (gap <= reach && (!ground || total < batterTime)) {
      if (!best || total < best.time)
        best = {
          id: p.playerId,
          position: fielder.position,
          distance: gap,
          reach,
          time: total,
          catchTimeMs: Math.round(time * 1000),
          catchLocation: { xMm: Math.round(targetX * 1000) + 0, yMm: Math.round(targetY * 1000) },
        };
    }
  }

  const returnTime = { second: Infinity, third: Infinity, home: Infinity };
  let projectedBases: 0 | 1 | 2 | 3 | 4 = homeRun ? 4 : best ? 0 : 1;
  // 安全優先の走塁。捕球可能域外の打球を回収・返球する時間から長打を判断する。
  if (!homeRun && !best) {
    let retrieveTime = Infinity;
    for (const f of fielders) {
      if (f.position === 'DH') continue;
      const p = getPlayer(fixture, f.playerId);
      const pos = FIELD_POSITIONS[f.position];
      const gap = Math.hypot(x - pos.x, y - pos.y);
      const recovery = Math.max(
        ground ? distance / (speed * 0.65) : flight,
        0.5 +
          fielderTravelTime(gap, 4 + (4 * p.runningSpeed.valueMilli) / 120000, config.battedBall),
      );
      const throwSpeed =
        m.throwBaseMetersPerSecond +
        (m.throwAbilityMetersPerSecond * p.armStrength.valueMilli) / 120000;
      for (const [base, target] of Object.entries(RETURN_TARGETS)) {
        const key = base as keyof typeof returnTime;
        returnTime[key] = Math.min(
          returnTime[key],
          recovery + 0.8 + Math.hypot(x - target.x, y - target.y) / throwSpeed,
        );
      }
      retrieveTime = Math.min(retrieveTime, recovery + 0.8 + landingDistance / throwSpeed);
    }
    const baseTime = m.baseDistanceMeters / runnerSpeed;
    projectedBases =
      retrieveTime > 0.5 + 3 * baseTime + 1.5 ? 3 : retrieveTime > 0.5 + 2 * baseTime + 0.8 ? 2 : 1;
  }

  return {
    rng,
    ball: {
      sourcePitchSeq: pitch.eventSeq,
      fieldingContact:
        !homeRun && best ? { timeMs: best.catchTimeMs, location: best.catchLocation } : null,
      contactQuality,
      exitVelocityCentiKph: Math.round(speedKph * 100),
      launchAngleCentiDegree: Math.round(angle * 100) + 0,
      launchSprayAngleCentiDegree: bearingCentiDegree,
      fairBearingCentiDegree: bearingCentiDegree,
      type: ground ? 'ground' : angle < 25 ? 'line' : angle < 55 ? 'fly' : 'popup',
      isBunt: false,
      fairStatus: 'fair',
      directionCode:
        bearingCentiDegree < -2700
          ? 'left'
          : bearingCentiDegree < -900
            ? 'leftCenter'
            : bearingCentiDegree < 900
              ? 'center'
              : bearingCentiDegree < 2700
                ? 'rightCenter'
                : 'right',
      directionDefinitionVersion: 'design-v1.0',
      terminalLocation: { xMm: Math.round(x * 1000) + 0, yMm: Math.round(y * 1000) },
      flightTimeMs: Math.round(flight * 1000),
      distanceMm: Math.round(distance * 1000),
      fenceDistanceMm: Math.round(fence * 1000),
      fielderId: homeRun ? null : (best?.id ?? null),
      fieldingPosition: homeRun ? null : (best?.position ?? null),
      fielderDistanceMm: homeRun || !best ? null : Math.round(best.distance * 1000),
      fielderReachMm: homeRun || !best ? null : Math.round(best.reach * 1000),
      fieldingTimeMs: homeRun || !best ? null : Math.round(best.time * 1000),
      batterFirstBaseTimeMs: Math.round(batterTime * 1000),
      projectedBases,
      modelVersion: m.battedBallVersion,
      returnTimeMs:
        !homeRun && !best
          ? {
              second: Math.round(returnTime.second * 1000),
              third: Math.round(returnTime.third * 1000),
              home: Math.round(returnTime.home * 1000),
            }
          : null,
    },
  };
}

const RETURN_TARGETS = {
  second: { x: 0, y: 38.794 },
  third: { x: -19.397, y: 19.397 },
  home: { x: 0, y: 0 },
} as const;

/** 接触優先の減速は左右ミートが高いほど小さい。0・1ストライクでは未適用。 */
export function contactQualityFor(
  pitch: PitchRecord,
  fixture: GameFixture,
  m: MatchConfig['battedBall'],
): NonNullable<BattedBall['contactQuality']> {
  integer(pitch.countBefore.strikes, 0, 2, '打球直前ストライク');
  if (pitch.countBefore.strikes < 2) return { approach: 'normal', exitSpeedPenaltyCentiKph: 0 };

  const batter = getPlayer(fixture, pitch.batterId);
  const contact = (
    pitch.throwingSide === 'R' ? batter.batting.contactVsRight : batter.batting.contactVsLeft
  ).valueMilli;
  integer(contact, 0, 120000, '打球時ミート');

  return {
    approach: 'protect',
    exitSpeedPenaltyCentiKph: Math.round(
      m.protectExitSpeedPenaltyCentiKph - (m.protectContactRecoveryCentiKph * contact) / 120000,
    ),
  };
}

/** 旧版と同じ三角分布。設定は試合開始時のスナップショットを使う。 */
function launchAngle(u: number, m: MatchConfig['battedBall']): number {
  const low = m.angleMinimumDegrees;
  const mode = m.angleModeDegrees;
  const high = m.angleMaximumDegrees;
  const split = (mode - low) / (high - low);
  return u < split
    ? low + Math.sqrt(u * (high - low) * (mode - low))
    : high - Math.sqrt((1 - u) * (high - low) * (high - mode));
}

export function fielderTravel(
  seconds: number,
  topSpeed: number,
  m: MatchConfig['battedBall'],
): number {
  const acceleration = m.fielderAccelerationMetersPerSecond2;
  const accelerationTime = Math.min(seconds, topSpeed / acceleration);
  return (
    0.5 * acceleration * accelerationTime ** 2 + topSpeed * Math.max(0, seconds - accelerationTime)
  );
}

export function fielderTravelTime(
  distance: number,
  topSpeed: number,
  m: MatchConfig['battedBall'],
): number {
  const acceleration = m.fielderAccelerationMetersPerSecond2;
  const accelerationDistance = topSpeed ** 2 / (2 * acceleration);
  return distance <= accelerationDistance
    ? Math.sqrt((2 * distance) / acceleration)
    : topSpeed / acceleration + (distance - accelerationDistance) / topSpeed;
}
