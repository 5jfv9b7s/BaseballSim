/** 架空二軍の日程・ベンチ設定。大会細則の最終仕様ではない。 */
export const farmConfig = {
  version: 'fictional-farm-v1' as const,
  benchLimit: 26,
  annual: {
    openingDate: '2026-03-28',
    closingDate: '2026-09-15',
    homeAwayCycles: 6,
    daysBetweenRounds: 3,
  },
};
