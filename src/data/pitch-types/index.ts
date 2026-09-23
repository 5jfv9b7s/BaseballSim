/**
 * 実装済み球種のコードと表示名。
 * 新しいコードを追加する場合は、計算モデル・配球設定・検査も対応させてください。
 * この辞書だけの追加で未知の球種を既存モデルに使用させません。
 */
export const PITCH_TYPES = {
  fastball: { name: 'ストレート' },
  slider: { name: 'スライダー' },
  fork: { name: 'フォーク' },
} as const;

export type PitchTypeCode = keyof typeof PITCH_TYPES;

export const pitchNames = Object.fromEntries(
  Object.entries(PITCH_TYPES).map(([code, definition]) => [code, definition.name]),
) as Record<PitchTypeCode, string>;
