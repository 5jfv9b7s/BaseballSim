import type { ReliefConfig } from '../src/game/relief-types.ts';

/** 未校正の起用規則。役割は適性・能力ではありません。球数基準は既存試合モデルです。 */
export const reliefConfig: ReliefConfig = {
  version: 'conditional-relief-v1',
  // 条件が重なる場合の暫定優先順。同役割では小さいpriority、同順位は既存候補順。
  roleOrder: ['closer', 'setup', 'longRelief', 'relief'],
  // 新しく役割を追加する際の編集用ひな形。実際の登板条件は選手ごとに保存します。
  templates: {
    relief: {
      startInning: 1,
      endInning: 12,
      scoreStates: ['lead', 'tied', 'trailing'],
      minScoreDifference: null,
      maxScoreDifference: null,
    },
    setup: {
      startInning: 7,
      endInning: 8,
      scoreStates: ['lead', 'tied'],
      minScoreDifference: 0,
      maxScoreDifference: 3,
    },
    closer: {
      startInning: 9,
      endInning: 12,
      scoreStates: ['lead'],
      minScoreDifference: 1,
      maxScoreDifference: 3,
    },
    longRelief: {
      startInning: 1,
      endInning: 6,
      scoreStates: ['lead', 'tied', 'trailing'],
      minScoreDifference: null,
      maxScoreDifference: null,
    },
  },
};
