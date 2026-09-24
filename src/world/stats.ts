import { ensure, integer } from '../engine/validation.ts';
import type { GameRecord, TeamSide } from '../game/types.ts';
import { canonicalJson } from '../storage/codec.ts';
import { fnv1a32 } from './identity.ts';
import type {
  GameContribution,
  ScheduledGame,
  SeasonStats,
  StatKey,
  TeamCounters,
  TeamStats,
  WorldDefinitions,
  WorldRecord,
} from './types.ts';

function key(definitions: WorldDefinitions, squadId: string): StatKey {
  return {
    seasonId: definitions.seasonId,
    competitionId: definitions.competitionId,
    statScope: definitions.statScope,
    squadId,
  };
}

const emptyCounters = (): TeamCounters => ({
  games: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  runsFor: 0,
  runsAgainst: 0,
});

export function emptyStats(definitions: WorldDefinitions): SeasonStats {
  return {
    teams: definitions.squads.map((squad) => ({
      ...key(definitions, squad.squadId),
      ...emptyCounters(),
    })),
    matchups: [],
    batting: [],
    pitching: [],
    fielding: [],
  };
}

/** 確定結果から集計先と増分を作る。打者・投手・位置別守備を別の行として持つ。 */
export function gameContribution(
  definitions: WorldDefinitions,
  scheduled: ScheduledGame,
  game: GameRecord,
): GameContribution {
  const result = game.result;
  ensure(result && game.state.phase === 'gameComplete', '未確定試合は集計できません');
  ensure(result.gameId === scheduled.gameId, '日程と結果のIDが一致しません');
  const stats: SeasonStats = { teams: [], matchups: [], batting: [], pitching: [], fielding: [] };

  for (const side of ['away', 'home'] as const) {
    const other: TeamSide = side === 'away' ? 'home' : 'away';
    const squadId = side === 'away' ? scheduled.awaySquadId : scheduled.homeSquadId;
    const opponentSquadId = side === 'away' ? scheduled.homeSquadId : scheduled.awaySquadId;
    const scope = key(definitions, squadId);
    const team: TeamStats = {
      ...scope,
      games: 1,
      wins: Number(result.winner === side),
      losses: Number(result.winner === other),
      draws: Number(result.winner === 'draw'),
      runsFor: result.score[side],
      runsAgainst: result.score[other],
    };
    const roster = game.fixture.clubs.find(
      (club) => club.clubId === game.fixture.teams[side].clubId,
    )!;
    stats.teams.push(team);
    stats.matchups.push({ ...team, opponentSquadId });
    stats.batting.push(
      ...result.batting
        .filter((row) => roster.playerIds.includes(row.playerId))
        .map((row) => ({ ...scope, ...row })),
    );
    stats.pitching.push(
      ...result.pitching
        .filter((row) => roster.playerIds.includes(row.playerId))
        .map((row) => ({ ...scope, ...row })),
    );
    stats.fielding.push(
      ...(result.fielding ?? [])
        .filter((row) => roster.playerIds.includes(row.playerId))
        .map((row) => ({ ...scope, ...row })),
    );
  }

  return { gameId: scheduled.gameId, attemptNo: 1, resultRevision: 1, stats };
}

function rowKey(row: object): string {
  const item = row as Record<string, unknown>;
  return canonicalJson([
    item.seasonId,
    item.competitionId,
    item.statScope,
    item.squadId,
    item.opponentSquadId ?? null,
    item.playerId ?? null,
    item.position ?? null,
  ]);
}

function addRows<T extends object>(target: T[], delta: T[]): void {
  for (const increment of delta) {
    const existing = target.find((row) => rowKey(row) === rowKey(increment));
    if (!existing) {
      target.push(structuredClone(increment));
      continue;
    }
    const mutable = existing as Record<string, unknown>;
    for (const [name, value] of Object.entries(increment)) {
      if (typeof value !== 'number') continue;
      const sum = ((mutable[name] as number | undefined) ?? 0) + value;
      integer(sum, 0, Number.MAX_SAFE_INTEGER, '集計カウンタ');
      mutable[name] = sum;
    }
  }
}

/** 同じ試合の再適用は無操作。結果改訂は未実装なので異なる寄与を拒否する。 */
export function applyContribution(world: WorldRecord, contribution: GameContribution): void {
  const fingerprint = canonicalJson(contribution);
  const previous = world.contributions[contribution.gameId];
  if (previous) {
    ensure(canonicalJson(previous) === fingerprint, '確定済み試合の寄与が異なります');
    return;
  }

  // 全増分の検査・合算が成功してから反映する。
  const next = structuredClone(world.stats);
  addRows(next.teams, contribution.stats.teams);
  addRows(next.matchups, contribution.stats.matchups);
  addRows(next.batting, contribution.stats.batting);
  addRows(next.pitching, contribution.stats.pitching);
  addRows(next.fielding, contribution.stats.fielding);
  world.stats = next;
  world.contributions[contribution.gameId] = structuredClone(contribution);
  world.statApplicationMarkers[contribution.gameId] = {
    attemptNo: 1,
    resultRevision: 1,
    contributionHash: 'fnv1a32-' + fnv1a32(fingerprint).toString(16).padStart(8, '0'),
  };
}

/** 引分を分母に入れない試作規則。同率は同順位。未観測は順位・率ともnull。 */
export function standings(
  stats: SeasonStats,
): (TeamStats & { rank: number | null; winPercentage: number | null })[] {
  const compare = (a: TeamStats, b: TeamStats): number => {
    const da = a.wins + a.losses;
    const db = b.wins + b.losses;
    if (!da || !db) return da ? -1 : db ? 1 : 0;
    const difference = BigInt(b.wins) * BigInt(da) - BigInt(a.wins) * BigInt(db);
    return difference < 0n ? -1 : difference > 0n ? 1 : 0;
  };
  const ordered = [...stats.teams].sort(
    (a, b) => compare(a, b) || (a.squadId < b.squadId ? -1 : a.squadId > b.squadId ? 1 : 0),
  );
  let rank: number | null = null;
  return ordered.map((row, index) => {
    const denominator = row.wins + row.losses;
    if (!denominator) rank = null;
    else if (index === 0 || compare(row, ordered[index - 1]!) !== 0) rank = index + 1;
    return { ...row, rank, winPercentage: denominator ? row.wins / denominator : null };
  });
}
