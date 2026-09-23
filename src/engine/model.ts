/** 未校正の試作定数。式・値を変更するときは版も変更する。 */
export const MODEL = Object.freeze({
  id: 'pitch-prototype', version: 'pitch-prototype-v1',
  schemaId: 'pitch-prototype-config-v1', rulesetVersion: 'pitch-lab-rules-v1',
  baseWeights: Object.freeze({ fastball: 50, slider: 30, fork: 20 }),
  twoStrike: Object.freeze({ fastball: 0.8, slider: 1.2, fork: 1.4 }),
  threeBall: Object.freeze({ fastball: 1.4, slider: 0.8, fork: 0.6 }),
  oppositeSide: Object.freeze({ fastball: 1, slider: 0.9, fork: 1.1 }),
  zone: Object.freeze({ leftMm: -216, rightMm: 216, bottomMm: 500, topMm: 1100 }),
  positionErrorMinMm: 35, positionErrorScaleMm: 300,
  velocityRepeatabilityReduction: 0.7,
  swingInBase: 0.6, swingInAggression: 0.3, swingInDiscipline: 0.1,
  swingOutBase: 0.32, swingOutAggression: 0.25, swingOutDiscipline: 0.25,
  contactBase: 0.45, contactAbility: 0.45,
  contactSpeedReferenceKph: 130, contactSpeedPenaltyPerKph: 0.004,
  contactOutsidePenalty: 0.18, contactMin: 0.05, contactMax: 0.98,
  foulBase: 0.4, foulAbilityReduction: 0.15,
} as const);
