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
  screwBall: { name: 'スクリュー' },
  knuckleBall: { name: 'ナックルボール' },
  slowCurve: { name: 'スローカーブ' },
  sweeper: { name: 'スイーパー' },
  gyroBall: { name: 'ジャイロボール' },
  knuckleCurve: { name: 'ナックルカーブ' },
  twoSeamer: { name: 'ツーシーム' },
  oneSeamer: { name: 'ワンシーム' },
  circleChange: { name: 'サークルチェンジ' },
  gyroSlider: { name: 'ジャイロスライダー' },
  gyroFork: { name: 'ジャイロフォーク' },
  fastSlider: { name: 'ファストスライダー' },
  sinkingFastball: { name: 'シンキングファストボール' },
  palmBall: { name: 'パームボール' },
  powerCurve: { name: 'パワーカーブ' },
  sweepingCurve: { name: 'スイーピングカーブ' },
  verticalSlider: { name: '縦スライダー' },
  verticalCutter: { name: '縦カッター' },
  verticalCurve: { name: '縦カーブ' },
  sinkingSplitter: { name: 'シンキングスプリッター' },
  naturalShuuto: { name: 'ナチュラルシュート' },
  massura: { name: '真っスラ' },
  slurve: { name: 'スラーブ' },
  slowSlider: { name: 'スロースライダー' },
  vulcanChangeup: { name: 'バルカンチェンジ' },
  slutter: { name: 'スラッター' },
  eephus: { name: 'イーファス' },
  splitChange: { name: 'スプリットチェンジ' },
} as const;

export type PitchTypeCode = keyof typeof PITCH_TYPES;

export const pitchNames = Object.fromEntries(
  Object.entries(PITCH_TYPES).map(([code, definition]) => [code, definition.name]),
) as Record<PitchTypeCode, string>;
