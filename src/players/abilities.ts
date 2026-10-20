/** データ設計5.3/5.5の共通辞書。候補・通常選手で同じコードを使う。 */
export const COMMON_ABILITIES = {
  'batting.contactVsRight': '対右ミート',
  'batting.contactVsLeft': '対左ミート',
  'batting.powerVsRight': '対右パワー',
  'batting.powerVsLeft': '対左パワー',
  'batting.plateDiscipline': '選球眼',
  'batting.bunting': 'バント技術',
  'running.speed': '走力',
  'running.stealing': '盗塁技術',
  'running.baserunning': '走塁技術',
  'fielding.range': '守備範囲',
  'fielding.catching': '捕球',
  'fielding.armStrength': '肩力',
  'fielding.throwing': 'スローイング',
  'fielding.positioning': 'ポジショニング',
  'catching.gameCalling': '配球判断',
  'catching.blocking': 'ブロッキング',
  'catching.framing': 'フレーミング',
  'physical.stamina': 'スタミナ',
  'physical.recovery': '疲労回復能力',
  'physical.injuryResistance': '怪我のしにくさ',
  'pitching.quickDelivery': 'クイック',
  'pitching.pickoff': '牽制',
} as const;
export type CommonAbilityCode = keyof typeof COMMON_ABILITIES;
export const FIELD_POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'] as const;
export type FieldPosition = (typeof FIELD_POSITIONS)[number];

/** v11が既に使う11能力。値の正本は従来の選手・身体入力に一度だけ保持する。 */
export const EXISTING_ABILITY_CODES = [
  'batting.contactVsRight',
  'batting.contactVsLeft',
  'batting.powerVsRight',
  'batting.powerVsLeft',
  'batting.plateDiscipline',
  'running.speed',
  'fielding.range',
  'fielding.catching',
  'fielding.armStrength',
  'physical.stamina',
  'physical.recovery',
] as const satisfies readonly CommonAbilityCode[];
export type ExistingAbilityCode = (typeof EXISTING_ABILITY_CODES)[number];
export type AdditionalAbilityCode = Exclude<CommonAbilityCode, ExistingAbilityCode>;
export const ADDITIONAL_ABILITY_CODES = (
  Object.keys(COMMON_ABILITIES) as CommonAbilityCode[]
).filter(
  (code): code is AdditionalAbilityCode =>
    !(EXISTING_ABILITY_CODES as readonly string[]).includes(code),
);

/** 表示は内部値を切り捨てる。評価境界だけに追加の試合効果を設けない。 */
export function abilityRank(valueMilli: number): string {
  if (!Number.isSafeInteger(valueMilli) || valueMilli < 0 || valueMilli > 120000)
    throw new Error('能力の値が不正です');
  const value = Math.floor(valueMilli / 1000);
  if (value >= 100) return 'SS';
  if (value >= 90) return 'S';
  if (value >= 80) return 'A';
  if (value >= 70) return 'B';
  if (value >= 60) return 'C';
  if (value >= 50) return 'D';
  if (value >= 40) return 'E';
  if (value >= 30) return 'F';
  return 'G';
}
