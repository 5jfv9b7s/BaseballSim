import { GAME_MODEL_V9 } from './model-v9.ts';

/** 捕球失策と、失策を除く走者・アウト再構成を追加する未校正モデル。 */
export const GAME_MODEL_V10 = Object.freeze({
  ...GAME_MODEL_V9,
  version: 'game-prototype-v10',
  rulesetVersion: 'game-rules-prototype-v10',
  datasetVersion: 'game-fixture-v2',
  errorConfigSchemaVersion: 'error-config-v1',
  errorModelVersion: 'fielding-error-prototype-v1',
  earnedRunModelVersion: 'earned-runs-prototype-v1',
} as const);
