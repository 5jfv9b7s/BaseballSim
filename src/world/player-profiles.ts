import { ensure, integer } from '../engine/validation.ts';
import { playerProfileBoundsV1 } from '../../config/player-profiles.ts';
import { PROFILE_POSITIONS, BACKGROUND_NAMES } from './player-profile-types.ts';
import type { PlayerProfile } from './player-profile-types.ts';
import type { WorldDefinitions } from './types.ts';

export function isDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

/** 端末の時計を使わずゲーム内日付から導出。非閏年の2/29生まれは3/1に加齢する。 */
export function playerAge(birthDate: string, gameDate: string): number | null {
  if (!isDateOnly(birthDate) || !isDateOnly(gameDate) || birthDate > gameDate) return null;
  return (
    Number(gameDate.slice(0, 4)) -
    Number(birthDate.slice(0, 4)) -
    Number(gameDate.slice(5) < birthDate.slice(5))
  );
}

function text(value: unknown): asserts value is string {
  ensure(
    typeof value === 'string' && value.trim().length > 0 && value.length <= 200,
    'プロフィールの文字列が不正です',
  );
}
function identifier(value: unknown): asserts value is string {
  text(value);
  ensure(!Object.hasOwn(Object.prototype, value), 'プロフィールに使用できないIDです');
}
function fields(value: unknown, keys: string[]): void {
  ensure(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    'プロフィールの項目が不正です',
  );
  const actual = Object.keys(value);
  ensure(
    actual.length === keys.length && keys.every((k) => Object.hasOwn(value, k)),
    'プロフィールの項目が不足または余分です',
  );
}

export function validatePlayerProfiles(definitions: WorldDefinitions): void {
  const catalog = definitions.playerProfiles;
  if (
    ![
      'world-definitions-v16',
      'world-definitions-v17',
      'world-definitions-v18',
      'world-definitions-v19',
      'world-definitions-v20',
    ].includes(definitions.version)
  ) {
    ensure(catalog === undefined, '旧定義へプロフィールを追加できません');
    return;
  }
  fields(catalog, ['version', 'countries', 'regions', 'players']);
  ensure(catalog!.version === 'player-profiles-v1', '未対応のプロフィール版です');
  ensure(
    Array.isArray(catalog!.countries) &&
      Array.isArray(catalog!.regions) &&
      Array.isArray(catalog!.players),
    'プロフィールの辞書・名簿が必要です',
  );
  const countries = new Set<string>();
  for (const country of catalog!.countries) {
    fields(country, ['countryCode', 'name']);
    text(country.countryCode);
    text(country.name);
    ensure(
      /^[A-Z]{2}$/.test(country.countryCode) && !countries.has(country.countryCode),
      '出生国コードが不正または重複しています',
    );
    countries.add(country.countryCode);
  }
  const regions = new Map<string, string>();
  for (const region of catalog!.regions) {
    fields(region, ['regionId', 'countryCode', 'name']);
    identifier(region.regionId);
    text(region.name);
    ensure(
      countries.has(region.countryCode) && !regions.has(region.regionId),
      '出生地域の参照が不正または重複しています',
    );
    regions.set(region.regionId, region.countryCode);
  }
  const ids = new Set(definitions.squads.flatMap((s) => s.players.map((p) => p.playerId)));
  ensure(catalog!.players.length === ids.size, '全選手のプロフィールが必要です');
  const seen = new Set<string>();
  for (const p of catalog!.players) {
    fields(p, [
      'playerId',
      'displayName',
      'birthDate',
      'birthplace',
      'background',
      'heightMm',
      'weightGrams',
      'primaryPosition',
      'careerStage',
      'firstProYear',
      'firstJapanSeasonId',
      'generationBatchId',
    ]);
    identifier(p.playerId);
    ensure(
      ids.has(p.playerId) && !seen.has(p.playerId),
      'プロフィールの選手が不明または重複しています',
    );
    seen.add(p.playerId);
    if (p.displayName !== null) text(p.displayName);
    ensure(isDateOnly(p.birthDate) && p.birthDate <= definitions.startDate, '生年月日が不正です');
    integer(
      Number(p.birthDate.slice(0, 4)),
      playerProfileBoundsV1.minBirthYear,
      Number(definitions.startDate.slice(0, 4)),
      '生年',
    );
    fields(p.birthplace, ['countryCode', 'regionId']);
    ensure(countries.has(p.birthplace.countryCode), '出生国が辞書にありません');
    ensure(
      p.birthplace.countryCode !== 'JP' || p.birthplace.regionId !== null,
      '日本出生には都道府県が必要です',
    );
    if (p.birthplace.regionId !== null)
      ensure(
        regions.get(p.birthplace.regionId) === p.birthplace.countryCode,
        '出生地域と国が一致しません',
      );
    ensure(Object.hasOwn(BACKGROUND_NAMES, p.background), '出身区分が不正です');
    integer(p.heightMm, 1, playerProfileBoundsV1.maxHeightMm, '身長mm');
    integer(p.weightGrams, 1, playerProfileBoundsV1.maxWeightGrams, '体重g');
    ensure(PROFILE_POSITIONS.includes(p.primaryPosition), '代表守備位置が不正です');
    // 引退・候補の起用制御は未実装。現行の所属名簿は現役だけを受け付ける。
    ensure(p.careerStage === 'active', '現行名簿のプロフィールは現役が必要です');
    if (p.firstProYear !== null)
      integer(
        p.firstProYear,
        Number(p.birthDate.slice(0, 4)),
        Number(definitions.startDate.slice(0, 4)),
        'プロ入り年',
      );
    if (p.firstJapanSeasonId !== null) identifier(p.firstJapanSeasonId);
    identifier(p.generationBatchId);
  }
}

export function playerProfile(
  definitions: WorldDefinitions,
  playerId: string,
): PlayerProfile | undefined {
  return definitions.playerProfiles?.players.find((p) => p.playerId === playerId);
}
export function profileBirthplace(definitions: WorldDefinitions, profile: PlayerProfile): string {
  const catalog = definitions.playerProfiles;
  const country =
    catalog?.countries.find((c) => c.countryCode === profile.birthplace.countryCode)?.name ??
    profile.birthplace.countryCode;
  const region = catalog?.regions.find((r) => r.regionId === profile.birthplace.regionId)?.name;
  return region ? country + '・' + region : country;
}
