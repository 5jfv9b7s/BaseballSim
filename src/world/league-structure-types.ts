/** データ設計4章の識別・参加・本拠地部分。人気・契約・資金は未モデル化。 */
export type SquadLevel = 'first' | 'farm';
export interface StadiumRef {
  stadiumId: string;
  version: 1;
}
export interface StadiumDefinition extends StadiumRef {
  displayName: string;
  modelSourceId: 'shared-prototype-field-v1';
  regionId: string;
  capacity: number;
  roofType: 'open';
  geometry: {
    model: 'symmetric-corner-center-v1';
    fenceCenterMm: number;
    fenceCornerMm: number;
    fenceHeightMm: number;
  };
}
export interface LeagueStructure {
  version: 'league-structure-v1';
  regions: { regionId: string; displayName: string }[];
  leagues: {
    leagueId: string;
    displayName: string;
    level: SquadLevel;
    rankingRuleRef: 'win-percentage-shared-rank-v1';
  }[];
  clubs: { clubId: string; displayName: string; regionId: string }[];
  squads: { squadId: string; clubId: string; level: SquadLevel; displayName: string }[];
  competitions: {
    competitionId: string;
    seasonId: string;
    displayName: string;
    kind: 'regular';
    statScope: 'firstRegular' | 'farmRegular';
  }[];
  participations: {
    competitionId: string;
    squadId: string;
    leagueId: string;
    homeStadiumRef: StadiumRef;
    displayName: string;
  }[];
  stadiums: StadiumDefinition[];
}
/** 編集用の参照。氏名と同様、球団名は既存のteams/を正本にする。 */
export interface ClubHomeInput {
  clubId: string;
  regionId: string;
  firstStadiumId: string;
  farmStadiumId: string;
}
export interface NewPlayOptions {
  short: NewPlayCalendarOption;
  annual: NewPlayCalendarOption;
}
export interface NewPlayCalendarOption {
  startDate: string;
  endDate: string;
  clubs: {
    squadId: string;
    displayName: string;
    leagueName: string;
    regionName: string;
    homeStadiumName: string;
    farmStadiumName: string;
  }[];
}
