import { fielderRestConfig } from '../../../config/fielder-rest.ts';
import type { FielderRestInput } from '../../world/fielder-rest-types.ts';

/** 一軍・二軍を別々に編集できる初期設定。開始済み保存へは反映しません。 */
export const fielderRestPolicies: FielderRestInput[] = [
  {
    squadId: 'asagiri-first',
    rules: { ...fielderRestConfig.defaultRules },
  },
  {
    squadId: 'asagiri-farm',
    rules: { ...fielderRestConfig.defaultRules },
  },
];
