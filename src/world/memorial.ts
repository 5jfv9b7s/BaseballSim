import { ensure } from '../engine/validation.ts';
import { gameScope } from './squads.ts';
import type { StatKey, WorldRecord } from './types.ts';

export interface HomeRunRecordEntry extends StatKey {
  recordId: string;
  gameId: string;
  resultRevision: number;
  playerId: string;
  achievedOn: string;
  homeRuns: number;
  display: {
    playerName: string;
    teamName: string;
    opponentName: string;
  };
}

export interface HomeRunRecord {
  version: 'single-game-home-runs-v1';
  seasonId: string;
  competitionId: string;
  statScope: StatKey['statScope'];
  status: 'inProgress' | 'final';
  completedGames: number;
  scheduledGames: number;
  maximum: number | null;
  entries: HomeRunRecordEntry[];
}

export interface HomeRunRecords {
  overall: HomeRunRecord;
  byClub: Record<string, HomeRunRecord>;
}

/**
 * 当季の確定試合から作る読み取り専用の記録索引。
 * 球団内の最多も独立集計する。球界最多の達成者を絞るだけにはしない。
 * 投球の再実行・乱数消費・保存の変更は行わない。
 */
export function singleGameHomeRunRecords(
  world: WorldRecord,
  statScope: StatKey['statScope'] = 'firstRegular',
): HomeRunRecords {
  const competition = statScope === 'farmRegular' ? world.definitions.farm : world.definitions;
  ensure(competition, '対象の大会がありません');
  const scheduled = world.definitions.schedule.filter(
    (game) => gameScope(world.definitions, game) === statScope,
  );
  const empty = (scheduledGames: number): HomeRunRecord => ({
    version: 'single-game-home-runs-v1',
    seasonId: world.definitions.seasonId,
    competitionId: competition.competitionId,
    statScope,
    status: 'inProgress',
    completedGames: 0,
    scheduledGames,
    maximum: null,
    entries: [],
  });
  const byClub = Object.fromEntries(
    competition.squads.map((squad) => [
      squad.team.clubId,
      empty(
        scheduled.filter(
          (game) => game.awaySquadId === squad.squadId || game.homeSquadId === squad.squadId,
        ).length,
      ),
    ]),
  );
  const overall = empty(scheduled.length);

  function add(record: HomeRunRecord, entry: HomeRunRecordEntry) {
    if (entry.homeRuns < (record.maximum ?? 0)) return;
    if (record.maximum === null || entry.homeRuns > record.maximum) {
      record.maximum = entry.homeRuns;
      record.entries = [];
    }
    // 二つの表示索引も参照を共有しない。正本や別の表示へ変更を伝えない。
    record.entries.push({ ...entry, display: { ...entry.display } });
  }

  for (const match of scheduled) {
    const game = world.games[match.gameId];
    const result = game?.result;
    const marker = world.statApplicationMarkers[match.gameId];
    if (!result || game.state.phase !== 'gameComplete' || !marker) continue;
    ensure(
      result.gameId === match.gameId && marker.resultRevision === result.resultRevision,
      '試合結果と成績確定版が一致しません',
    );
    overall.completedGames++;
    for (const side of ['away', 'home'] as const) {
      const clubRecord = byClub[game.fixture.teams[side].clubId];
      ensure(clubRecord, '試合時点の球団が大会にありません');
      clubRecord.completedGames++;
    }

    for (const line of result.batting) {
      if (line.homeRuns <= 0) continue;
      // 選手の所属・氏名は試合時点の名簿から解決する。
      const club = game.fixture.clubs.find((item) => item.playerIds.includes(line.playerId));
      const player = game.fixture.players.find((item) => item.playerId === line.playerId);
      ensure(club && player, '記録達成者の試合時点情報がありません');
      const side = game.fixture.teams.away.clubId === club.clubId ? 'away' : 'home';
      const other = side === 'away' ? 'home' : 'away';
      const entry: HomeRunRecordEntry = {
        recordId: JSON.stringify([
          overall.seasonId,
          overall.competitionId,
          overall.version,
          match.gameId,
          line.playerId,
        ]),
        seasonId: overall.seasonId,
        competitionId: overall.competitionId,
        statScope,
        squadId: side === 'away' ? match.awaySquadId : match.homeSquadId,
        gameId: match.gameId,
        resultRevision: result.resultRevision,
        playerId: line.playerId,
        achievedOn: match.date,
        homeRuns: line.homeRuns,
        display: {
          playerName: player.familyName + ' ' + player.givenName,
          teamName: game.fixture.teams[side].name,
          opponentName: game.fixture.teams[other].name,
        },
      };
      const clubRecord = byClub[club.clubId];
      ensure(clubRecord, '記録達成時の球団が大会にありません');
      add(overall, entry);
      add(clubRecord, entry);
    }
  }

  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  for (const record of [overall, ...Object.values(byClub)]) {
    // 日程の配列順や端末のロケールで表示順を変えない。同率を順位付けしない。
    record.entries.sort(
      (a, b) =>
        compare(a.achievedOn, b.achievedOn) ||
        compare(a.gameId, b.gameId) ||
        compare(a.playerId, b.playerId),
    );
    if (
      record.completedGames === record.scheduledGames &&
      world.currentDate > competition.endDate &&
      world.completedDates.includes(competition.endDate)
    )
      record.status = 'final';
  }
  return { overall, byClub };
}

/** 従来の球界全体の索引。既存の表示・照会の形式を維持する。 */
export function singleGameHomeRunRecord(
  world: WorldRecord,
  statScope: StatKey['statScope'] = 'firstRegular',
): HomeRunRecord {
  return singleGameHomeRunRecords(world, statScope).overall;
}
