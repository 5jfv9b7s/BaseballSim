/**
 * ホームから共用する表示用の配色。正式な球団ロゴ・ユニフォーム設定ではない。
 * clubIdに結び付け、名簿順・戦力・勝敗から色を作らない。保存・試合計算には使わない。
 */
export const CLUB_IDENTITIES: Readonly<Record<string, { mark: string; color: string }>> = {
  'club-a': { mark: '星', color: '#984823' },
  'club-h': { mark: '青', color: '#12626c' },
  kohaku: { mark: '湖', color: '#345887' },
  asagiri: { mark: '朝', color: '#6c467e' },
};

export function clubIdentity(clubId?: string) {
  if (clubId && Object.hasOwn(CLUB_IDENTITIES, clubId)) return CLUB_IDENTITIES[clubId]!;
  return { mark: '球', color: '#51605b' };
}
