import type { RestRules } from '../src/world/rest-types.ts';

/** 未校正の運用目安。能力補正や制度上の登板禁止ではありません。 */
export const restConfig: { version: 'pitcher-rest-v1'; defaultRules: RestRules } = {
  version: 'pitcher-rest-v1',
  defaultRules: {
    // 条件が一つでも成立したときの扱い。none / preferRest / benchRest。
    action: 'preferRest',

    // 条件値のnullは無効。昨日までの連続登板日数。
    consecutiveDays: 2,
    // 今日を除く過去3暦日で、合計80球以上。
    recentDays: 3,
    recentPitches: 80,
    // 昨日、1球以上投げた異なるイニングが2つ以上。
    previousDayInnings: 2,
    // 内部単位は表示値×1000。体力35以下、または疲労40以上。
    energyMilli: 35000,
    fatigueMilli: 40000,
  },
};
