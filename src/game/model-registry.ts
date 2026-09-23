import { ensure } from '../engine/validation.ts';
import { GAME_MODEL } from './model.ts';
import { GAME_MODEL_V2 } from './model-v2.ts';
import { GAME_MODEL_V3 } from './model-v3.ts';
import { GAME_MODEL_V7 } from './model-v7.ts';
import { GAME_MODEL_V6 } from './model-v6.ts';
import { GAME_MODEL_V5 } from './model-v5.ts';
import { GAME_MODEL_V4 } from './model-v4.ts';

export type GameModelVersion =
  | typeof GAME_MODEL.version
  | typeof GAME_MODEL_V2.version
  | typeof GAME_MODEL_V3.version
  | typeof GAME_MODEL_V4.version
  | typeof GAME_MODEL_V5.version
  | typeof GAME_MODEL_V6.version
  | typeof GAME_MODEL_V7.version;
export const GAME_MODEL_VERSIONS: readonly GameModelVersion[] = [
  'game-prototype-v1',
  'game-prototype-v2',
  'game-prototype-v3',
  'game-prototype-v4',
  'game-prototype-v5',
  'game-prototype-v6',
  'game-prototype-v7',
];
export const CURRENT_GAME_MODEL = GAME_MODEL_V7.version;
export function gameModel(version: GameModelVersion = GAME_MODEL.version) {
  ensure(GAME_MODEL_VERSIONS.includes(version), '未対応の試合モデル版です');
  switch (version) {
    case 'game-prototype-v1':
      return GAME_MODEL;
    case 'game-prototype-v2':
      return GAME_MODEL_V2;
    case 'game-prototype-v7':
      return GAME_MODEL_V7;
    case 'game-prototype-v6':
      return GAME_MODEL_V6;
    case 'game-prototype-v5':
      return GAME_MODEL_V5;
    case 'game-prototype-v4':
      return GAME_MODEL_V4;
    case 'game-prototype-v3':
      return GAME_MODEL_V3;
  }
}
