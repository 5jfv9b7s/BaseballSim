import type { BullpenInput } from '../../world/bullpen.ts';

/** 一軍・二軍を独立して編集。falseは従来どおり準備完了を登板条件にしない。 */
export const bullpenInputs: BullpenInput[] = [
  { squadId: 'aonagi-first', enabled: true },
  { squadId: 'aonagi-farm', enabled: true },
];
