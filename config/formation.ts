/** 編成画面で「僅差」を新規に指定したときだけ使う編集用の仮値。
 * 最終仕様・校正値ではない。既存保存の条件は書き換えず、個別編集できる。
 */
export const formationDefaults = { closeGameScoreDifference: 3 } as const;
