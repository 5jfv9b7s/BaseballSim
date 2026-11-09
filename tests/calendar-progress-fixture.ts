import { createPitchLearningDefinitions } from '../src/data/world/pitch-learning.ts';
import { createPitchLearningWorld } from '../src/world/engine.ts';

/** 保存境界だけを確認する、試合のない短期日程。ゲームの試合計算を実行しない。 */
export function createCalendarRestWorld() {
  const definitions = createPitchLearningDefinitions();
  definitions.schedule = [];
  return createPitchLearningWorld(42, undefined, definitions);
}
