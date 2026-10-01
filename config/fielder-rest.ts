import type { FielderRestRules } from '../src/world/fielder-rest-types.ts';

/** 未校正の起用閾値。身体消耗・回復・能力補正の係数は変更しません。 */
export const fielderRestConfig = {
  version: 'fielder-rest-v1' as const,
  defaultRules: {
    enabled: true,
    // 体力35以下、または疲労40以上なら控えを優先。整数1000が1ポイント。
    energyMilli: 35000,
    fatigueMilli: 40000,
  } satisfies FielderRestRules,
};
