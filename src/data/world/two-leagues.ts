import { createLeagueStructureDefinitions } from './league-structure.ts';
import { twoLeagueCatalog, firstLeagueMemberships } from '../competitions/two-leagues.ts';
import { ensure } from '../../engine/validation.ts';
import { validateLeagueStructure } from '../../world/league-structure.ts';
import type { WorldDefinitions } from '../../world/types.ts';

/** 一軍の所属を分ける。日程・試合用乱数・旧定義v17は変更しない。 */
export function createTwoLeagueDefinitions(
  calendar: 'short' | 'annual' = 'short',
): WorldDefinitions {
  const definitions = createLeagueStructureDefinitions(calendar);
  const structure = definitions.leagueStructure!;
  ensure(
    firstLeagueMemberships.length === definitions.squads.length &&
      new Set(firstLeagueMemberships.map((m) => m.squadId)).size === definitions.squads.length &&
      firstLeagueMemberships.every((m) => definitions.squads.some((s) => s.squadId === m.squadId)),
    '一軍の所属リーグに重複・欠落・不明なチームがあります',
  );
  definitions.version = 'world-definitions-v18';
  structure.version = 'league-structure-v2';
  structure.leagues = structuredClone(twoLeagueCatalog);
  for (const p of structure.participations) {
    if (p.competitionId === definitions.competitionId)
      p.leagueId = firstLeagueMemberships.find((m) => m.squadId === p.squadId)!.leagueId;
  }
  validateLeagueStructure(definitions);
  return definitions;
}
