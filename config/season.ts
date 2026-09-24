/** 架空リーグの暫定設定。正式な試合数・日程とは区別する。 */
export const seasonConfig = {
  version: 'fictional-season-v1' as const,
  year: 2026,
  openingDate: '2026-03-27',
  closingDate: '2026-09-30',
  /** ホーム・ビジター総当たり6節を12回。1球団72試合。 */
  homeAwayCycles: 12,
  /** 節の間隔（日）。試合のない日も日次確定と保存を行う。 */
  daysBetweenRounds: 2,
};
