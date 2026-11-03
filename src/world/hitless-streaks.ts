import { ensure } from '../engine/validation.ts';
import { gameScope } from './squads.ts';
import type { HitStreakGame } from './hit-streaks.ts';
import type { StatKey, WorldRecord } from './types.ts';

/** 保存を変更しない読取索引。連続試合ではなく、連続する公式打数を数える試作。 */
export const HITLESS_STREAK_VERSION = 'consecutive-hitless-at-bats-v1';
export interface HitlessAtBat extends HitStreakGame {
  eventIndex: number;
  outcome: string;
}
export interface HitlessPeriod {
  recordId: string;
  length: number;
  status: 'ongoing' | 'ended' | 'seasonClosed';
  start: HitlessAtBat;
  lastAtBat: HitlessAtBat;
  endedBy: HitlessAtBat | null;
}
export interface HitlessRecord {
  version: typeof HITLESS_STREAK_VERSION;
  statScope: StatKey['statScope'];
  status: 'inProgress' | 'final';
  completedGames: number;
  scheduledGames: number;
  maximum: number | null;
  players: {
    playerId: string;
    maximum: number;
    current: HitlessPeriod | null;
    longest: HitlessPeriod[];
  }[];
}
export interface HitlessRecords {
  overall: HitlessRecord;
  byClub: Record<string, HitlessRecord>;
}

/** 四死球・犠飛・欠場は維持。安打で終了し、同一試合の複数期間も別々に保持する。 */
export function consecutiveHitlessAtBats(
  world: WorldRecord,
  statScope: StatKey['statScope'] = 'firstRegular',
): HitlessRecords {
  const competition = statScope === 'farmRegular' ? world.definitions.farm : world.definitions;
  ensure(competition, '対象の大会がありません');
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const schedule = world.definitions.schedule
    .filter((m) => gameScope(world.definitions, m) === statScope)
    .sort((a, b) => compare(a.date, b.date) || compare(a.gameId, b.gameId));
  const counts = new Map(competition.squads.map((s) => [s.team.clubId, 0]));
  const active = new Map<string, HitlessPeriod>();
  const periods: HitlessPeriod[] = [];
  let completedGames = 0;
  for (const match of schedule) {
    const game = world.games[match.gameId];
    const marker = world.statApplicationMarkers[match.gameId];
    if (!game?.result || game.state.phase !== 'gameComplete' || !marker) continue;
    ensure(
      game.result.gameId === match.gameId && marker.resultRevision === game.result.resultRevision,
      '試合結果と成績確定版が一致しません',
    );
    completedGames++;
    for (const side of ['away', 'home'] as const) {
      const clubId = game.fixture.teams[side].clubId;
      ensure(counts.has(clubId), '試合時点の球団が大会にありません');
      counts.set(clubId, counts.get(clubId)! + 1);
    }
    for (const [eventIndex, event] of game.events.entries()) {
      if (
        !event.outcome ||
        !event.pitch ||
        ['walk', 'hitByPitch', 'sacrificeFly'].includes(event.outcome)
      )
        continue;
      const playerId = event.pitch.batterId;
      const club = game.fixture.clubs.find((c) => c.playerIds.includes(playerId));
      const player = game.fixture.players.find((p) => p.playerId === playerId);
      ensure(club && player, '無安打記録の試合時点情報がありません');
      const side = game.fixture.teams.away.clubId === club.clubId ? 'away' : 'home';
      const point: HitlessAtBat = {
        seasonId: world.definitions.seasonId,
        competitionId: competition.competitionId,
        statScope,
        squadId: side === 'away' ? match.awaySquadId : match.homeSquadId,
        clubId: club.clubId,
        playerId,
        gameId: match.gameId,
        resultRevision: game.result.resultRevision,
        achievedOn: match.date,
        eventIndex,
        outcome: event.outcome,
        display: {
          playerName: player.familyName + ' ' + player.givenName,
          teamName: game.fixture.teams[side].name,
          opponentName: game.fixture.teams[side === 'away' ? 'home' : 'away'].name,
        },
      };
      const current = active.get(playerId);
      if (['single', 'double', 'triple', 'homeRun'].includes(event.outcome)) {
        if (current) {
          current.status = 'ended';
          current.endedBy = point;
          active.delete(playerId);
        }
      } else if (current) {
        current.length++;
        current.lastAtBat = point;
      } else {
        const period: HitlessPeriod = {
          recordId: JSON.stringify([
            point.seasonId,
            point.competitionId,
            HITLESS_STREAK_VERSION,
            playerId,
            match.gameId,
            eventIndex,
          ]),
          length: 1,
          status: 'ongoing',
          start: point,
          lastAtBat: point,
          endedBy: null,
        };
        active.set(playerId, period);
        periods.push(period);
      }
    }
  }
  const final =
    completedGames === schedule.length &&
    world.currentDate > competition.endDate &&
    world.completedDates.includes(competition.endDate);
  if (final) for (const period of active.values()) period.status = 'seasonClosed';
  const record = (clubId?: string): HitlessRecord => {
    const grouped = new Map<string, HitlessPeriod[]>();
    for (const period of periods) {
      if (clubId !== undefined && period.lastAtBat.clubId !== clubId) continue;
      const list = grouped.get(period.lastAtBat.playerId) ?? [];
      list.push(period);
      grouped.set(period.lastAtBat.playerId, list);
    }
    const players = [...grouped]
      .map(([playerId, entries]) => {
        const maximum = Math.max(...entries.map((e) => e.length)),
          current = active.get(playerId);
        return {
          playerId,
          maximum,
          current: current && entries.includes(current) ? structuredClone(current) : null,
          longest: entries.filter((e) => e.length === maximum).map((e) => structuredClone(e)),
        };
      })
      .sort((a, b) => b.maximum - a.maximum || compare(a.playerId, b.playerId));
    return {
      version: HITLESS_STREAK_VERSION,
      statScope,
      status: final ? 'final' : 'inProgress',
      completedGames: clubId === undefined ? completedGames : counts.get(clubId)!,
      scheduledGames:
        clubId === undefined
          ? schedule.length
          : schedule.filter((m) =>
              competition.squads.some(
                (s) =>
                  s.team.clubId === clubId &&
                  (s.squadId === m.awaySquadId || s.squadId === m.homeSquadId),
              ),
            ).length,
      maximum: players[0]?.maximum ?? null,
      players,
    };
  };
  return {
    overall: record(),
    byClub: Object.fromEntries([...counts.keys()].map((clubId) => [clubId, record(clubId)])),
  };
}
