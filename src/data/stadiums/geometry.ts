import type { StadiumDefinition } from '../../world/league-structure-types.ts';

/** 現行match.tsと同じ共通試作形状。mm整数。個別球場の形状計算は後工程。 */
export const prototypeGeometry: StadiumDefinition['geometry'] = {
  model: 'symmetric-corner-center-v1',
  fenceCenterMm: 120000,
  fenceCornerMm: 100000,
  fenceHeightMm: 3000,
};
