import { GAME_MODEL } from './model.ts';
import { ensure } from '../engine/validation.ts';

const { angleSpanDegrees: _legacyAngleSpan, ...sharedModel } = GAME_MODEL;

export const GAME_MODEL_V2 = Object.freeze({
  ...sharedModel,
  version: 'game-prototype-v2',
  rulesetVersion: 'game-rules-prototype-v2',
  battedBallVersion: 'batted-ball-prototype-v2',
  angleMinimumDegrees: -45,
  angleModeDegrees: 5,
  angleMaximumDegrees: 75,
  fielderAccelerationMetersPerSecond2: 8,
  runnerLeadMeters: 3,
  runnerReactionSeconds: 0.2,
  extraBaseSafetySeconds: 0.8,
} as const);

export type GameModelVersion = typeof GAME_MODEL.version | typeof GAME_MODEL_V2.version;
export const CURRENT_GAME_MODEL = GAME_MODEL_V2.version;

/** 旧保存には状態の版フィールドがない。旧版の意味を変えずに解決する。 */
export function gameModel(version: GameModelVersion = GAME_MODEL.version) {
  ensure(
    version === GAME_MODEL.version || version === GAME_MODEL_V2.version,
    '未対応の試合モデル版です',
  );
  return version === GAME_MODEL.version ? GAME_MODEL : GAME_MODEL_V2;
}
