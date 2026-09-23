import type { Location, ZoneBounds, ZoneCode } from './types.ts';
import { ensure, integer } from './validation.ts';

/** 分割線上は右・上側、最大端点は最終区画。設計書9.6。 */
export function classifyZone(p: Location, b: ZoneBounds): ZoneCode {
  for (const value of [...Object.values(p), ...Object.values(b)]) integer(value, -100000, 100000, '座標');
  ensure(b.leftMm < b.rightMm && b.bottomMm < b.topMm, 'ゾーン境界が不正です');
  const horizontal = p.xMm < b.leftMm ? 'W' : p.xMm > b.rightMm ? 'E' : '';
  const vertical = p.zMm < b.bottomMm ? 'S' : p.zMm > b.topMm ? 'N' : '';
  if (horizontal || vertical) return `B_${vertical}${horizontal}` as ZoneCode;
  const col = Math.min(2, Math.floor(3 * (p.xMm - b.leftMm) / (b.rightMm - b.leftMm)));
  const row = Math.min(2, Math.floor(3 * (p.zMm - b.bottomMm) / (b.topMm - b.bottomMm)));
  return `S_${['L', 'M', 'H'][row]}${['L', 'C', 'R'][col]}` as ZoneCode;
}
