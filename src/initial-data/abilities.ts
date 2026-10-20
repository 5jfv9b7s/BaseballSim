/** データ設計5.3。旧試合の部分型へ欠損値を埋めず、初期候補で全22項目を保持する。 */
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
