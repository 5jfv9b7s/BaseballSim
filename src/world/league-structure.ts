import { ensure, integer } from '../engine/validation.ts';
import { leagueStructureBoundsV1 as bounds } from '../../config/league-structure.ts';
import { allWorldSquads, isFarmSquad } from './squads.ts';
import type { StadiumRef } from './league-structure-types.ts';
import type { WorldDefinitions } from './types.ts';

function fields(value: unknown, expected: string[]): void {
  ensure(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    '大会構造の項目が不正です',
  );
  ensure(
    Object.keys(value).length === expected.length &&
      expected.every((key) => Object.hasOwn(value, key)),
    '大会構造の項目が不足または余分です',
  );
}
function text(value: unknown): asserts value is string {
  ensure(
    typeof value === 'string' && value.trim().length > 0 && value.length <= bounds.maxTextLength,
    '大会構造の文字列が不正です',
  );
}
function identifier(value: unknown): asserts value is string {
  text(value);
  ensure(!Object.hasOwn(Object.prototype, value), '大会構造に使用できないIDです');
}
const stadiumKey = (ref: StadiumRef) => JSON.stringify([ref.stadiumId, ref.version]);
function validateRef(ref: StadiumRef) {
  fields(ref, ['stadiumId', 'version']);
  identifier(ref.stadiumId);
  ensure(ref.version === 1, '未対応の球場版です');
}

/** 保存内の参照のみを使い、現行dataを補わない。 */
export function stadiumByRef(definitions: WorldDefinitions, ref?: StadiumRef) {
  return ref
    ? definitions.leagueStructure?.stadiums.find(
        (s) => s.stadiumId === ref.stadiumId && s.version === ref.version,
      )
    : undefined;
}
export function gameStadium(definitions: WorldDefinitions, gameId: string) {
  return stadiumByRef(
    definitions,
    definitions.schedule.find((g) => g.gameId === gameId)?.stadiumRef,
  );
}
export function squadParticipation(definitions: WorldDefinitions, squadId: string) {
  return definitions.leagueStructure?.participations.find((p) => p.squadId === squadId);
}

export function validateLeagueStructure(definitions: WorldDefinitions): void {
  const catalog = definitions.leagueStructure;
  const multiLeague = [
    'world-definitions-v18',
    'world-definitions-v19',
    'world-definitions-v20',
    'world-definitions-v21',
    'world-definitions-v22',
    'world-definitions-v23',
    'world-definitions-v24',
  ].includes(definitions.version);
  if (definitions.version !== 'world-definitions-v17' && !multiLeague) {
    ensure(
      catalog === undefined && definitions.schedule.every((g) => g.stadiumRef === undefined),
      '旧定義へ大会・球場情報を追加できません',
    );
    return;
  }
  fields(catalog, [
    'version',
    'regions',
    'leagues',
    'clubs',
    'squads',
    'competitions',
    'participations',
    'stadiums',
  ]);
  ensure(
    catalog!.version === (multiLeague ? 'league-structure-v2' : 'league-structure-v1'),
    '定義と大会構造の版が一致しません',
  );
  for (const key of [
    'regions',
    'leagues',
    'clubs',
    'squads',
    'competitions',
    'participations',
    'stadiums',
  ] as const)
    ensure(Array.isArray(catalog![key]), '大会構造の一覧が必要です');
  const data = catalog!;
  const regions = new Set<string>();
  for (const region of data.regions) {
    fields(region, ['regionId', 'displayName']);
    identifier(region.regionId);
    text(region.displayName);
    ensure(!regions.has(region.regionId), '所在地IDが重複しています');
    regions.add(region.regionId);
  }
  const leagues = new Map<string, (typeof data.leagues)[number]>();
  ensure(data.leagues.length === (multiLeague ? 3 : 2), 'リーグ数が構造版と一致しません');
  for (const league of data.leagues) {
    fields(league, ['leagueId', 'displayName', 'level', 'rankingRuleRef']);
    identifier(league.leagueId);
    text(league.displayName);
    ensure(
      ['first', 'farm'].includes(league.level) &&
        (multiLeague || ![...leagues.values()].some((l) => l.level === league.level)),
      'リーグの階級または階級ごとのリーグ数が不正です',
    );
    ensure(
      !leagues.has(league.leagueId) && league.rankingRuleRef === definitions.standingsRule,
      'リーグIDまたは順位規則が不正です',
    );
    leagues.set(league.leagueId, league);
  }
  if (multiLeague) {
    ensure(
      data.leagues.filter((l) => l.level === 'first').length === 2 &&
        data.leagues.filter((l) => l.level === 'farm').length === 1,
      '大会構造v2は一軍2リーグ・二軍1リーグです',
    );
  }
  const clubs = new Map<string, (typeof data.clubs)[number]>();
  ensure(data.clubs.length === definitions.squads.length, '全球団の所在地情報が必要です');
  for (const club of data.clubs) {
    fields(club, ['clubId', 'displayName', 'regionId']);
    identifier(club.clubId);
    text(club.displayName);
    const squad = definitions.squads.find((s) => s.team.clubId === club.clubId);
    ensure(
      squad &&
        squad.team.name === club.displayName &&
        !clubs.has(club.clubId) &&
        regions.has(club.regionId),
      '球団・所在地の参照が不正です',
    );
    clubs.set(club.clubId, club);
  }
  const squads = new Map<string, (typeof data.squads)[number]>();
  const actualSquads = allWorldSquads(definitions);
  ensure(data.squads.length === actualSquads.length, '一軍・二軍の全チーム情報が必要です');
  for (const squad of data.squads) {
    fields(squad, ['squadId', 'clubId', 'level', 'displayName']);
    identifier(squad.squadId);
    text(squad.displayName);
    const actual = actualSquads.find((s) => s.squadId === squad.squadId);
    ensure(
      actual &&
        actual.team.clubId === squad.clubId &&
        actual.team.name === squad.displayName &&
        clubs.has(squad.clubId) &&
        !squads.has(squad.squadId),
      'チーム・球団の参照が不正です',
    );
    ensure(
      squad.level === (isFarmSquad(definitions, squad.squadId) ? 'farm' : 'first'),
      'チーム階級が不正です',
    );
    squads.set(squad.squadId, squad);
  }
  const competitions = new Map<string, (typeof data.competitions)[number]>();
  ensure(definitions.farm && data.competitions.length === 2, '現行モデルは一軍・二軍各1大会です');
  for (const competition of data.competitions) {
    fields(competition, ['competitionId', 'seasonId', 'displayName', 'kind', 'statScope']);
    identifier(competition.competitionId);
    text(competition.displayName);
    ensure(
      competition.seasonId === definitions.seasonId &&
        competition.kind === 'regular' &&
        !competitions.has(competition.competitionId),
      '大会年度・種別が不正です',
    );
    ensure(
      (competition.statScope === 'firstRegular' &&
        competition.competitionId === definitions.competitionId) ||
        (competition.statScope === 'farmRegular' &&
          competition.competitionId === definitions.farm!.competitionId),
      '大会の成績区分が不正です',
    );
    competitions.set(competition.competitionId, competition);
  }
  const stadiums = new Set<string>();
  for (const stadium of data.stadiums) {
    fields(stadium, [
      'stadiumId',
      'version',
      'displayName',
      'modelSourceId',
      'regionId',
      'capacity',
      'roofType',
      'geometry',
    ]);
    identifier(stadium.stadiumId);
    text(stadium.displayName);
    ensure(
      stadium.version === 1 && !stadiums.has(stadiumKey(stadium)) && regions.has(stadium.regionId),
      '球場ID・版・所在地が不正です',
    );
    ensure(
      stadium.roofType === 'open' && stadium.modelSourceId === 'shared-prototype-field-v1',
      '現行モデルは共通形状の屋外球場のみです',
    );
    integer(stadium.capacity, 1, bounds.maxCapacity, '球場収容人数');
    fields(stadium.geometry, ['model', 'fenceCenterMm', 'fenceCornerMm', 'fenceHeightMm']);
    ensure(stadium.geometry.model === 'symmetric-corner-center-v1', '未対応の球場形状です');
    for (const [mm, meters] of [
      ['fenceCenterMm', 'fenceCenterMeters'],
      ['fenceCornerMm', 'fenceCornerMeters'],
      ['fenceHeightMm', 'fenceHeightMeters'],
    ] as const) {
      integer(stadium.geometry[mm], 1, bounds.maxDistanceMm, '球場距離mm');
      ensure(
        stadium.geometry[mm] === definitions.matchConfig.battedBall[meters] * 1000,
        '現行モデルの球場形状はmatch.tsの共通形状と一致させてください',
      );
    }
    stadiums.add(stadiumKey(stadium));
  }
  const participations = new Map<string, (typeof data.participations)[number]>();
  ensure(data.participations.length === squads.size, '全チームの年度参加情報が必要です');
  for (const p of data.participations) {
    fields(p, ['competitionId', 'squadId', 'leagueId', 'homeStadiumRef', 'displayName']);
    text(p.displayName);
    validateRef(p.homeStadiumRef);
    const squad = squads.get(p.squadId),
      competition = competitions.get(p.competitionId),
      league = leagues.get(p.leagueId);
    ensure(
      squad &&
        competition &&
        league &&
        !participations.has(p.squadId) &&
        p.displayName === squad.displayName &&
        stadiums.has(stadiumKey(p.homeStadiumRef)),
      '大会参加・本拠地の参照が不正です',
    );
    ensure(
      league.level === squad.level &&
        competition.statScope === (squad.level === 'first' ? 'firstRegular' : 'farmRegular'),
      '大会参加の階級が不正です',
    );
    participations.set(p.squadId, p);
  }
  if (multiLeague) {
    for (const league of data.leagues) {
      ensure(
        data.participations.filter((p) => p.leagueId === league.leagueId).length >= 2,
        '各リーグに2チーム以上の年度参加情報が必要です',
      );
    }
  }
  for (const game of definitions.schedule) {
    validateRef(game.stadiumRef!);
    const home = participations.get(game.homeSquadId),
      away = participations.get(game.awaySquadId);
    ensure(
      home &&
        away &&
        home.competitionId === away.competitionId &&
        stadiumKey(game.stadiumRef!) === stadiumKey(home.homeStadiumRef),
      '日程の大会・開催球場が不正です',
    );
  }
}
