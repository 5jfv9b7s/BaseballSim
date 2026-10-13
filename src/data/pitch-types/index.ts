/**
 * 実装済み球種のコードと表示名。
 * 新しいコードを追加する場合は、計算モデル・配球設定・検査も対応させてください。
 * この辞書だけの追加で未知の球種を既存モデルに使用させません。
 */
export const PITCH_TYPES = {
  fastball: { name: 'ストレート' },
  slider: { name: 'スライダー' },
  fork: { name: 'フォーク' },
  splitter: { name: 'スプリッター' },
  curve: { name: 'カーブ' },
  changeup: { name: 'チェンジアップ' },
  cutter: { name: 'カッター' },
  sinker: { name: 'シンカー' },
  shuuto: { name: 'シュート' },
  screwball: { name: 'スクリュー' },
  knuckleball: { name: 'ナックルボール' },
  slowcurve: { name: 'スローカーブ' },
  sweeper: { name: 'スイーパー' },
  gyroball: { name: 'ジャイロボール' },
  knucklecurve: { name: 'ナックルカーブ' },
  twoseamer: { name: 'ツーシーム' },
  oneSeamer: { name: 'ワンシーム' },
  circleChange: { name: 'サークルチェンジ' },
  gyroslider: { name: 'ジャイロスライダー' },
  gyrofork: { name: 'ジャイロフォーク' },
  fastslider: { name: 'ファストスライダー' },
  sinkingfastball: { name: 'シンキングファストボール' },
  palmball: { name: 'パームボール' },
  powercurve: { name: 'パワーカーブ' },
  sweepingcurve: { name: 'スイーピングカーブ' },
  verticalslider: { name: '縦スライダー' },
  verticalcutter: { name: '縦カッター' },
  verticalcurve: { name: '縦カーブ' },
  sinkingsplitter: { name: 'シンキングスプリッター' },
  naturalshuuto: { name: 'ナチュラルシュート' },
  massura: { name: '真っスラ' },
  slurve: { name: 'スラーブ' },
  slowslider: { name: 'スロースライダー' },
  vulcanchangeup: { name: 'バルカンチェンジ' },
} as const;

export type PitchTypeCode = keyof typeof PITCH_TYPES;

export const pitchNames = Object.fromEntries(
  Object.entries(PITCH_TYPES).map(([code, definition]) => [code, definition.name]),
) as Record<PitchTypeCode, string>;
