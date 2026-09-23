import { ensure } from '../engine/validation.ts';
import { getPlayer } from './fixture.ts';
import { FIELD_POSITIONS } from './model.ts';
import { GAME_MODEL_V7 } from './model-v7.ts';
import { fielderTravelTime } from './batted-ball-configured.ts';
import type { BattedBall, FieldingEvaluation, GameFixture, GameState, GameEvent } from './types.ts';

/** 追加抽選は行わず、捕球・送球・走者到達の時間を比較する限定的な試作。 */
export function evaluateInPlay(
  state: GameState,
  fixture: GameFixture,
  ball: BattedBall | null,
  pitch: GameEvent['pitch'],
): FieldingEvaluation | undefined {
  if (state.simulationVersion !== GAME_MODEL_V7.version) return undefined;

  return evaluateInPlayTiming(state, fixture, ball, pitch);
}

/** v7の到達時間式。版ごとの結果選択から独立させ、旧保存も同じ式で再実行する。 */
export function evaluateInPlayTiming(
  state: GameState,
  fixture: GameFixture,
  ball: BattedBall | null,
  pitch: GameEvent['pitch'],
): FieldingEvaluation | undefined {
  if (
    state.outs >= 2 ||
    !ball ||
    ball.projectedBases !== 0 ||
    !ball.fielderId ||
    !ball.fieldingPosition ||
    !ball.fieldingContact
  )
    return undefined;

  ensure(state.config, '新モデルには開始時の設定が必要です');
  const config = state.config;
  const m = config.battedBall;
  const running = config.running;
  const plays = config.plays;
  const team = fixture.teams[state.half === 'top' ? 'home' : 'away'];
  const fielder = getPlayer(fixture, ball.fielderId);
  const origin = ball.fieldingContact.location;
  const catchTime = ball.fieldingContact.timeMs / 1000;
  const throwSpeed = (playerId: string) =>
    m.throwBaseMetersPerSecond +
    (m.throwAbilityMetersPerSecond * getPlayer(fixture, playerId).armStrength.valueMilli) / 120000;
  const runnerSpeed = (playerId: string) =>
    running.runnerBaseMetersPerSecond +
    (running.runnerAbilityMetersPerSecond * getPlayer(fixture, playerId).runningSpeed.valueMilli) /
      120000;
  const baseDistance = GAME_MODEL_V7.baseDistanceMeters;
  const at = (position: 'SS' | '2B' | '1B' | 'C') =>
    team.lineup.find((p) => p.position === position)!;
  const participants: FieldingEvaluation['participants'] = [
    { playerId: fielder.playerId, position: ball.fieldingPosition, role: 'field' },
  ];
  const ms = (seconds: number) => Math.round(seconds * 1000);

  if (
    ball.type === 'ground' &&
    state.baseOccupants[0] &&
    ['P', '3B', 'SS', '2B'].includes(ball.fieldingPosition)
  ) {
    const pivot = at(ball.fieldingPosition === '2B' ? 'SS' : '2B');
    const receiver = at('1B');
    ensure(pitch, '併殺の塁カバー判定には投球記録が必要です');
    // フォース可能な状況では投球中から塁カバーを開始する試作の守備判断。
    const preparation =
      (config.pitch.deliveryDistanceMeters / (pitch.velocityCentiKph / 360)) *
      plays.coverPreparationPitchFraction;
    const cover = (slot: typeof pivot, x: number, y: number) => {
      const player = getPlayer(fixture, slot.playerId);
      const start = FIELD_POSITIONS[slot.position as 'SS' | '2B' | '1B'];
      return Math.max(
        0,
        m.fielderReactionBaseSeconds -
          (m.fielderReactionReductionSeconds * player.fieldingRange.valueMilli) / 120000 +
          fielderTravelTime(
            Math.hypot(start.x - x, start.y - y),
            4 + (4 * player.runningSpeed.valueMilli) / 120000,
            m,
          ) -
          preparation,
      );
    };
    const coverTime = cover(pivot, 0, 38.794);
    const forceTime = Math.max(
      catchTime +
        plays.transferSeconds +
        Math.hypot(origin.xMm / 1000, origin.yMm / 1000 - 38.794) / throwSpeed(fielder.playerId),
      coverTime,
    );
    const firstTime = Math.max(
      forceTime + plays.pivotSeconds + Math.hypot(19.397, 19.397) / throwSpeed(pivot.playerId),
      cover(receiver, 19.397, 19.397),
    );
    const runnerTime =
      running.runnerReactionSeconds +
      (baseDistance - running.runnerLeadMeters) /
        runnerSpeed(state.baseOccupants[0].currentRunnerId);

    participants.push({ ...pivot, role: 'pivot' }, { ...receiver, role: 'receive' });
    const defenseArrivalMs = [ms(forceTime), ms(firstTime)];
    const runnerArrivalMs = [ms(runnerTime), ball.batterFirstBaseTimeMs];
    return {
      modelVersion: 'in-play-prototype-v1',
      play: 'doublePlay',
      preparationTimeMs: ms(preparation),
      completed: defenseArrivalMs.every((time, i) => time < runnerArrivalMs[i]!),
      participants,
      defenseArrivalMs,
      runnerArrivalMs,
    };
  }

  if (
    ball.type === 'fly' &&
    state.baseOccupants[2] &&
    ['LF', 'CF', 'RF'].includes(ball.fieldingPosition)
  ) {
    const receiver = at('C');
    participants.push({ ...receiver, role: 'receive' });
    const returnTime =
      catchTime +
      plays.transferSeconds +
      Math.hypot(origin.xMm, origin.yMm) / 1000 / throwSpeed(fielder.playerId);
    // 捕球まで帰塁して待ち、三塁からリードなしでスタートする。
    const runnerTime =
      catchTime +
      plays.tagUpReactionSeconds +
      baseDistance / runnerSpeed(state.baseOccupants[2].currentRunnerId);
    return {
      modelVersion: 'in-play-prototype-v1',
      play: 'tagUp',
      preparationTimeMs: 0,
      completed: ms(runnerTime + plays.tagUpSafetySeconds) < ms(returnTime),
      participants,
      defenseArrivalMs: [ms(returnTime)],
      runnerArrivalMs: [ms(runnerTime)],
    };
  }

  return undefined;
}
