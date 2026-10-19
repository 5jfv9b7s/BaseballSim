import { createPlayerProfileDefinitions } from './player-profiles.ts';
import { leagues } from '../competitions/leagues.ts';
import { clubHomes } from '../clubs/index.ts';
import { stadiums } from '../stadiums/index.ts';
import { clubRegions } from '../regions/club-regions.ts';
import { allWorldSquads, isFarmSquad } from '../../world/squads.ts';
import { ensure } from '../../engine/validation.ts';
import { validateLeagueStructure } from '../../world/league-structure.ts';
import type { LeagueStructure } from '../../world/league-structure-types.ts';
import type { WorldDefinitions } from '../../world/types.ts';

/** 参加時点のリーグ・本拠地を複製する。旧定義・旧日程は書き換えない。 */
export function createLeagueStructureDefinitions(
  calendar: 'short' | 'annual' = 'short',
): WorldDefinitions {
  const base = createPlayerProfileDefinitions(calendar);
  ensure(
    clubHomes.length === base.squads.length &&
      new Set(clubHomes.map((c) => c.clubId)).size === clubHomes.length &&
      clubHomes.every((c) => base.squads.some((s) => s.team.clubId === c.clubId)),
    '球団所在地データの重複・欠落・不明な球団があります',
  );
  const squads = allWorldSquads(base).map((s) => ({
    squadId: s.squadId,
    clubId: s.team.clubId,
    displayName: s.team.name,
    level: isFarmSquad(base, s.squadId) ? ('farm' as const) : ('first' as const),
  }));
  const structure: LeagueStructure = {
    version: 'league-structure-v1',
    regions: clubRegions,
    leagues,
    clubs: base.squads.map((s) => ({
      clubId: s.team.clubId,
      displayName: s.team.name,
      regionId: clubHomes.find((c) => c.clubId === s.team.clubId)!.regionId,
    })),
    squads,
    competitions: [
      {
        competitionId: base.competitionId,
        seasonId: base.seasonId,
        displayName: base.name,
        kind: 'regular',
        statScope: 'firstRegular',
      },
      {
        competitionId: base.farm!.competitionId,
        seasonId: base.seasonId,
        displayName: '架空二軍公式戦',
        kind: 'regular',
        statScope: 'farmRegular',
      },
    ],
    participations: squads.map((s) => {
      const home = clubHomes.find((c) => c.clubId === s.clubId)!;
      return {
        competitionId: s.level === 'first' ? base.competitionId : base.farm!.competitionId,
        squadId: s.squadId,
        leagueId: leagues.find((l) => l.level === s.level)!.leagueId,
        displayName: s.displayName,
        homeStadiumRef: {
          stadiumId: s.level === 'first' ? home.firstStadiumId : home.farmStadiumId,
          version: 1,
        },
      };
    }),
    stadiums,
  };
  const definitions: WorldDefinitions = structuredClone({
    ...base,
    version: 'world-definitions-v17',
    leagueStructure: structure,
    schedule: base.schedule.map((game) => ({
      ...game,
      stadiumRef: {
        ...structure.participations.find((p) => p.squadId === game.homeSquadId)!.homeStadiumRef,
      },
    })),
  });
  validateLeagueStructure(definitions);
  return definitions;
}
