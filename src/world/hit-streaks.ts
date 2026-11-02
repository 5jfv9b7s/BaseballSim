import { ensure } from '../engine/validation.ts';
import { gameScope } from './squads.ts';
import type { StatKey, WorldRecord } from './types.ts';

/** 算定細則は試作。計算モデルではなく、保存済み試合を読む索引の版。 */
export const HIT_STREAK_VERSION = 'consecutive-game-hits-v1';

export interface HitStreakGame extends StatKey {
  clubId: string;
  playerId: string;
  gameId: string;
  resultRevision: number;
  achievedOn: string;
  display: { playerName: string; teamName: string; opponentName: string };
}

export interface HitStreakEntry {
  recordId: string;
  length: number;
  status: 'ongoing' | 'ended' | 'seasonClosed';
  start: HitStreakGame;
  lastHit: HitStreakGame;
  endedBy: HitStreakGame | null;
}

export interface PlayerHitStreak {
  playerId: string;
  maximum: number;
  current: HitStreakEntry | null;
  /** 自己最長に並ぶ期間をすべて保持。同じ選手の別期間も別件。 */
  longest: HitStreakEntry[];
}

export interface HitStreakRecord {
  version: typeof HIT_STREAK_VERSION;
  seasonId: string;
  competitionId: string;
  statScope: StatKey['statScope'];
  status: 'inProgress' | 'final';
  completedGames: number;
  scheduledGames: number;
  maximum: number | null;
  players: PlayerHitStreak[];
}

export interface HitStreakRecords {
  overall: HitStreakRecord;
  byClub: Record<string, HitStreakRecord>;
}

/**
 * 当季・大会内の連続試合安打。React・乱数・DBから独立した読取集計。
 * 試作規則：1安打以上で+1、打数あり/無安打で終了、欠場/打数0は維持。
 * 同日複数試合は日付→試合ID順。未確定は数えず、途切れの根拠にもしない。
 */
export function consecutiveGameHits(
  world: WorldRecord,
  statScope: StatKey['statScope'] = 'firstRegular',
): HitStreakRecords {
  const competition = statScope === 'farmRegular' ? world.definitions.farm : world.definitions;
  ensure(competition, '対象の大会がありません');
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const schedule = world.definitions.schedule
    .filter((match) => gameScope(world.definitions, match) === statScope)
    .sort((a, b) => compare(a.date, b.date) || compare(a.gameId, b.gameId));
  const counts = new Map(competition.squads.map((s) => [s.team.clubId, 0]));
  const active = new Map<string, HitStreakEntry>();
  const episodes: HitStreakEntry[] = [];
  let completedGames = 0;

  for (const match of schedule) {
    const game = world.games[match.gameId];
    const result = game?.result;
    const marker = world.statApplicationMarkers[match.gameId];
    if (!result || game.state.phase !== 'gameComplete' || !marker) continue;
    ensure(
      result.gameId === match.gameId && marker.resultRevision === result.resultRevision,
      '試合結果と成績確定版が一致しません',
    );
    completedGames++;
    for (const side of ['away', 'home'] as const) {
      const clubId = game.fixture.teams[side].clubId;
      ensure(counts.has(clubId), '試合時点の球団が大会にありません');
      counts.set(clubId, counts.get(clubId)! + 1);
    }
    for (const line of result.batting) {
      // 打数0の出場・欠場は伸ばさず、切らない。1試合に何本打っても+1。
      if (line.hits === 0 && line.atBats === 0) continue;
      const club = game.fixture.clubs.find((c) => c.playerIds.includes(line.playerId));
      const player = game.fixture.players.find((p) => p.playerId === line.playerId);
      ensure(club && player, '継続記録の試合時点情報がありません');
      const side = game.fixture.teams.away.clubId === club.clubId ? 'away' : 'home';
      const other = side === 'away' ? 'home' : 'away';
      const point: HitStreakGame = {
        seasonId: world.definitions.seasonId,
        competitionId: competition.competitionId,
        statScope,
        squadId: side === 'away' ? match.awaySquadId : match.homeSquadId,
        clubId: club.clubId,
        playerId: line.playerId,
        gameId: match.gameId,
        resultRevision: result.resultRevision,
        achievedOn: match.date,
        display: {
          playerName: player.familyName + ' ' + player.givenName,
          teamName: game.fixture.teams[side].name,
          opponentName: game.fixture.teams[other].name,
        },
      };
      const current = active.get(line.playerId);
      if (line.hits > 0) {
        if (current) {
          current.length++;
          current.lastHit = point;
        } else {
          const entry: HitStreakEntry = {
            recordId: JSON.stringify([
              point.seasonId,
              point.competitionId,
              HIT_STREAK_VERSION,
              line.playerId,
              match.gameId,
            ]),
            length: 1,
            status: 'ongoing',
            start: point,
            lastHit: point,
            endedBy: null,
          };
          active.set(line.playerId, entry);
          episodes.push(entry);
        }
      } else if (current) {
        current.status = 'ended';
        current.endedBy = point;
        active.delete(line.playerId);
      }
    }
  }

  const final =
    completedGames === schedule.length &&
    world.currentDate > competition.endDate &&
    world.completedDates.includes(competition.endDate);
  if (final) for (const entry of active.values()) entry.status = 'seasonClosed';

  const record = (clubId?: string): HitStreakRecord => {
    const grouped = new Map<string, HitStreakEntry[]>();
    // 球団別も独立集計。所属はその期間の最後の安打時点で扱う試作規則。
    for (const entry of episodes) {
      if (clubId !== undefined && entry.lastHit.clubId !== clubId) continue;
      const list = grouped.get(entry.lastHit.playerId) ?? [];
      list.push(entry);
      grouped.set(entry.lastHit.playerId, list);
    }
    const players: PlayerHitStreak[] = [];
    for (const [playerId, entries] of grouped) {
      const maximum = Math.max(...entries.map((e) => e.length));
      const current = active.get(playerId);
      players.push({
        playerId,
        maximum,
        current: current && entries.includes(current) ? structuredClone(current) : null,
        longest: entries.filter((e) => e.length === maximum).map((e) => structuredClone(e)),
      });
    }
    players.sort((a, b) => b.maximum - a.maximum || compare(a.playerId, b.playerId));
    return {
      version: HIT_STREAK_VERSION,
      seasonId: world.definitions.seasonId,
      competitionId: competition.competitionId,
      statScope,
      status: final ? 'final' : 'inProgress',
      completedGames: clubId === undefined ? completedGames : counts.get(clubId)!,
      scheduledGames:
        clubId === undefined
          ? schedule.length
          : schedule.filter((g) =>
              competition.squads.some(
                (s) =>
                  s.team.clubId === clubId &&
                  (s.squadId === g.awaySquadId || s.squadId === g.homeSquadId),
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
