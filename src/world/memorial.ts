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

/**
 * 当季の確定試合から作る読み取り専用の記録索引。
 * 投球の再実行・乱数消費・保存の変更は行わず、別セーブではその保存から作り直す。
 * 0本だけの段階は達成者なし。同率は選手×試合で全件を保持する。
 */
export function singleGameHomeRunRecord(
  world: WorldRecord,
  statScope: StatKey['statScope'] = 'firstRegular',
): HomeRunRecord {
  const competition = statScope === 'farmRegular' ? world.definitions.farm : world.definitions;
  ensure(competition, '対象の大会がありません');
  const scheduled = world.definitions.schedule.filter(
    (game) => gameScope(world.definitions, game) === statScope,
  );
  const record: HomeRunRecord = {
    version: 'single-game-home-runs-v1',
    seasonId: world.definitions.seasonId,
    competitionId: competition.competitionId,
    statScope,
    status: 'inProgress',
    completedGames: 0,
    scheduledGames: scheduled.length,
    maximum: null,
    entries: [],
  };

  for (const match of scheduled) {
    const game = world.games[match.gameId];
    const result = game?.result;
    const marker = world.statApplicationMarkers[match.gameId];
    if (!result || game.state.phase !== 'gameComplete' || !marker) continue;
    ensure(
      result.gameId === match.gameId && marker.resultRevision === result.resultRevision,
      '試合結果と成績確定版が一致しません',
    );
    record.completedGames++;

    for (const line of result.batting) {
      if (line.homeRuns <= 0 || line.homeRuns < (record.maximum ?? 0)) continue;
      if (record.maximum === null || line.homeRuns > record.maximum) {
        record.maximum = line.homeRuns;
        record.entries = [];
      }

      // 所属は試合の名簿で解決する。昇降格・移籍後の現在所属を使わない。
      const club = game.fixture.clubs.find((item) => item.playerIds.includes(line.playerId));
      const player = game.fixture.players.find((item) => item.playerId === line.playerId);
      ensure(club && player, '記録達成者の試合時点情報がありません');
      const side = game.fixture.teams.away.clubId === club.clubId ? 'away' : 'home';
      const other = side === 'away' ? 'home' : 'away';
      record.entries.push({
        recordId: JSON.stringify([
          record.seasonId,
          record.competitionId,
          record.version,
          match.gameId,
          line.playerId,
        ]),
        seasonId: record.seasonId,
        competitionId: record.competitionId,
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
      });
    }
  }

  // 日程の配列順や端末のロケールで表示順を変えない。同率を順位付けしない。
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
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
  return record;
}
