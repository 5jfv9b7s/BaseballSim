import { players as hoshiharaPlayers } from '../farm/hoshihara/players.ts';
import { repertoires as hoshiharaPitches } from '../farm/hoshihara/repertoires.ts';
import { squad as hoshiharaTeam } from '../farm/hoshihara/team.ts';
import { registrations as hoshiharaRegistrations } from '../farm/hoshihara/registrations.ts';
import { preferences as hoshiharaPolicy } from '../farm/hoshihara/roster-policy.ts';
import { players as aonagiPlayers } from '../farm/aonagi/players.ts';
import { repertoires as aonagiPitches } from '../farm/aonagi/repertoires.ts';
import { squad as aonagiTeam } from '../farm/aonagi/team.ts';
import { registrations as aonagiRegistrations } from '../farm/aonagi/registrations.ts';
import { preferences as aonagiPolicy } from '../farm/aonagi/roster-policy.ts';
import { players as kohakuPlayers } from '../farm/kohaku/players.ts';
import { repertoires as kohakuPitches } from '../farm/kohaku/repertoires.ts';
import { squad as kohakuTeam } from '../farm/kohaku/team.ts';
import { registrations as kohakuRegistrations } from '../farm/kohaku/registrations.ts';
import { preferences as kohakuPolicy } from '../farm/kohaku/roster-policy.ts';
import { players as asagiriPlayers } from '../farm/asagiri/players.ts';
import { repertoires as asagiriPitches } from '../farm/asagiri/repertoires.ts';
import { squad as asagiriTeam } from '../farm/asagiri/team.ts';
import { registrations as asagiriRegistrations } from '../farm/asagiri/registrations.ts';
import { preferences as asagiriPolicy } from '../farm/asagiri/roster-policy.ts';
import { farmConfig } from '../../../config/farm.ts';
import { seasonConfig } from '../../../config/season.ts';
import { farmCalendar, farmSchedule } from '../farm/schedule.ts';
import { createAnnualDefinitions } from './annual.ts';
import { createRosterPolicyDefinitions } from './roster-policies.ts';
import { ensure, integer } from '../../engine/validation.ts';
import type { WorldDefinitions } from '../../world/types.ts';

const additions = {
  'hoshihara-first': {
    players: hoshiharaPlayers,
    pitches: hoshiharaPitches,
    squad: hoshiharaTeam,
    registrations: hoshiharaRegistrations,
    policy: hoshiharaPolicy,
  },
  'aonagi-first': {
    players: aonagiPlayers,
    pitches: aonagiPitches,
    squad: aonagiTeam,
    registrations: aonagiRegistrations,
    policy: aonagiPolicy,
  },
  'kohaku-first': {
    players: kohakuPlayers,
    pitches: kohakuPitches,
    squad: kohakuTeam,
    registrations: kohakuRegistrations,
    policy: kohakuPolicy,
  },
  'asagiri-first': {
    players: asagiriPlayers,
    pitches: asagiriPitches,
    squad: asagiriTeam,
    registrations: asagiriRegistrations,
    policy: asagiriPolicy,
  },
};

/** 既存入力へ追加の独立データを結合。能力・選手IDは開始後も球団で一元保持する。 */
export function createFarmDefinitions(calendar: 'short' | 'annual' = 'short'): WorldDefinitions {
  ensure(farmConfig.version === 'fictional-farm-v1', '二軍日程設定の版が不正です');
  integer(farmConfig.benchLimit, 10, 70, '二軍ベンチ上限');
  const base = createRosterPolicyDefinitions(calendar);
  const annual =
    calendar === 'annual'
      ? createAnnualDefinitions({ ...seasonConfig, ...farmConfig.annual })
      : null;
  const farmGames = annual
    ? annual.schedule.map((game, index) => ({
        ...game,
        gameId: 'G' + seasonConfig.year + '-farm-' + String(index + 1).padStart(4, '0'),
        awaySquadId: additions[game.awaySquadId as keyof typeof additions].squad.squadId,
        homeSquadId: additions[game.homeSquadId as keyof typeof additions].squad.squadId,
      }))
    : farmSchedule;
  return structuredClone({
    ...base,
    version: 'world-definitions-v6',
    squads: base.squads.map((squad) => {
      const added = additions[squad.squadId as keyof typeof additions];
      return {
        ...squad,
        team: {
          ...squad.team,
          pitcherIds: [...squad.team.pitcherIds, ...added.squad.team.pitcherIds],
        },
        reserveBatterIds: [
          ...squad.reserveBatterIds!,
          ...added.players
            .map((player) => player.playerId)
            .filter((id) => !added.squad.team.pitcherIds.includes(id)),
        ],
        players: [...squad.players, ...added.players],
        pitches: [...squad.pitches, ...added.pitches],
        registrationInputs: [...squad.registrationInputs!, ...added.registrations],
        rosterPolicyInput: {
          ...squad.rosterPolicyInput!,
          preferences: [...squad.rosterPolicyInput!.preferences, ...added.policy],
        },
      };
    }),
    farm: {
      version: 'farm-competition-v1',
      competitionId: base.competitionId + '-farm',
      statScope: 'farmRegular',
      startDate: annual?.startDate ?? farmCalendar.startDate,
      endDate: annual?.endDate ?? farmCalendar.endDate,
      benchLimit: farmConfig.benchLimit,
      squads: Object.values(additions).map((added) => added.squad),
    },
    schedule: [...base.schedule, ...farmGames],
  });
}
