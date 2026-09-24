/** UTF-8のFNV-1a 32bit。乱数の初期化と寄与の識別専用（暗号用途ではない）。 */
export function fnv1a32(text: string): number {
  let word = 2166136261;
  for (const byte of new TextEncoder().encode(text)) {
    word = Math.imul(word ^ byte, 16777619) >>> 0;
  }
  return word;
}

/** 試合順・表示・日付操作でseedを消費しない。0だけ1へ写す。 */
export function scheduledSeed(worldSeed: number, gameId: string): number {
  return fnv1a32('game-id-fnv1a32-v1:' + worldSeed + ':' + gameId + ':attempt:1') || 1;
}
