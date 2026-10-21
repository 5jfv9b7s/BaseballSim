import { createDailyTrainingDefinitions } from './daily-training.ts';
import type { NewPlayOptions, StadiumRef } from '../../world/league-structure-types.ts';

/** 新規作成の確認用。読込中の旧プレイではなく、Worker内の現行初期データから作る。 */
export function createNewPlayOptions(): NewPlayOptions {
  const option = (calendar: 'short' | 'annual') => {
    const definitions = createDailyTrainingDefinitions(calendar),
      data = definitions.leagueStructure!;
    const stadiumName = (ref: StadiumRef) =>
      data.stadiums.find((s) => s.stadiumId === ref.stadiumId && s.version === ref.version)!
        .displayName;
    return {
      startDate: definitions.startDate,
      endDate: definitions.endDate,
      clubs: definitions.squads.map((s) => {
        const club = data.clubs.find((c) => c.clubId === s.team.clubId)!;
        const first = data.participations.find((p) => p.squadId === s.squadId)!;
        const farmSquad = data.squads.find((t) => t.clubId === club.clubId && t.level === 'farm')!;
        return {
          squadId: s.squadId,
          displayName: club.displayName,
          leagueName: data.leagues.find((l) => l.leagueId === first.leagueId)!.displayName,
          regionName: data.regions.find((r) => r.regionId === club.regionId)!.displayName,
          homeStadiumName: stadiumName(first.homeStadiumRef),
          farmStadiumName: stadiumName(
            data.participations.find((p) => p.squadId === farmSquad.squadId)!.homeStadiumRef,
          ),
        };
      }),
    };
  };
  return { short: option('short'), annual: option('annual') };
}
