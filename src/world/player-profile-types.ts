import type { Position } from '../game/types.ts';

/** データ設計5.2のプロフィール部分。姓名・投打は保存内の選手名簿を正本とする。 */
export interface PlayerProfile {
  playerId: string;
  displayName: string | null;
  birthDate: string;
  birthplace: { countryCode: string; regionId: string | null };
  background: 'highSchool' | 'university' | 'corporate' | 'independent' | 'overseas';
  heightMm: number;
  weightGrams: number;
  primaryPosition: Position;
  careerStage: 'candidate' | 'active' | 'retired';
  firstProYear: number | null;
  firstJapanSeasonId: string | null;
  generationBatchId: string;
}

/** 地名辞書も開始時に保存する。読込時に現在のdataを補わない。 */
export interface PlayerProfileCatalog {
  version: 'player-profiles-v1';
  countries: { countryCode: string; name: string }[];
  regions: { regionId: string; countryCode: string; name: string }[];
  players: PlayerProfile[];
}

export const PROFILE_POSITIONS: Position[] = [
  'P',
  'C',
  '1B',
  '2B',
  '3B',
  'SS',
  'LF',
  'CF',
  'RF',
  'DH',
];
export const BACKGROUND_NAMES: Record<PlayerProfile['background'], string> = {
  highSchool: '高校',
  university: '大学',
  corporate: '社会人',
  independent: '独立リーグ',
  overseas: '海外',
};
