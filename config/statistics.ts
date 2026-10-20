/**
 * 個人成績の表示規則。要件FR-HIST-06の基準を今季の途中順位にも使う。
 * 試合係数・表彰選考ではない。変更すると既存保存の表示も再計算される。
 */
export const STATISTICS_RULES = {
  version: 'season-leaderboard-v2',
  // 率は丸め前の分数で比較し、表示時だけこの桁数で四捨五入する。
  decimalPlaces: { average: 3, era: 2, ratio: 2 },
  plateAppearancesPerGame: { numerator: 31, denominator: 10 },
  pitchingOutsPerGame: 3,
} as const;
