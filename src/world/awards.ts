import { ensure, integer } from '../engine/validation.ts';
import { playerLeaderboard, statValue, STAT_METRICS } from './leaderboard.ts';
import { gameScope } from './squads.ts';
import type { Position, BattingLine } from '../game/types.ts';
import type {
  AwardsRules,
  AwardEvidence,
  AwardWinner,
  SeasonAward,
  SeasonHonors,
} from './awards-types.ts';
import type { SeasonSummary, WorldRecord } from './types.ts';

export const AWARD_POSITIONS: readonly Position[] = [
  'P',
  'C',
  '1B',
  '2B',
  '3B',
  'SS',
  'LF',
  'CF',
  'RF',
  'DH',
];
const compareId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function validateAwardsRules(value: unknown): asserts value is AwardsRules {
  ensure(value && typeof value === 'object' && !Array.isArray(value), '表彰の選考規則がありません');
  const r = value as AwardsRules;
  ensure(
    Object.keys(r).sort().join('|') ===
      'battingOrder|battingRolePaPerTeamGame|fieldingOrder|fieldingOutsPerTeamGame|pitchingOrder|pitchingOutsPerTeamGame|ties|version',
    '表彰規則の項目が不足または余分です',
  );
  ensure(
    r.version === 'season-awards-v1' && r.ties === 'allCoWinners',
    '表彰規則の版・同率規則が不正です',
  );
  for (const key of [
    'battingRolePaPerTeamGame',
    'pitchingOutsPerTeamGame',
    'fieldingOutsPerTeamGame',
  ] as const)
    integer(r[key], 1, 100, '表彰の最低出場係数');
  ensure(
    JSON.stringify(r.battingOrder) === '["ops","plateAppearances"]' &&
      JSON.stringify(r.pitchingOrder) === '["era","outsRecorded"]' &&
      JSON.stringify(r.fieldingOrder) === '["fieldingPercentage","chances"]',
    '未対応の表彰選考順です',
  );
}

const evidence = (
  label: string,
  numerator: number | bigint,
  denominator: number | bigint = 1,
  format: AwardEvidence['format'] = 'count',
  direction: AwardEvidence['direction'] = 'higher',
): AwardEvidence => ({
  label,
  numerator: String(numerator),
  denominator: String(denominator),
  format,
  direction,
});
function compareEvidence(a: AwardEvidence[], b: AwardEvidence[]): number {
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!,
      y = b[i]!;
    const delta =
      BigInt(x.numerator) * BigInt(y.denominator) - BigInt(y.numerator) * BigInt(x.denominator);
    if (delta !== 0n) return (delta > 0n ? -1 : 1) * (x.direction === 'lower' ? -1 : 1);
  }
  return 0;
}

/** 最後の確定試合の名簿から名前/所属を固定する。現在のdataや将来の改称を使わない。 */
function seasonSources(world: WorldRecord, summary: SeasonSummary) {
  const names = new Map<string, Omit<AwardWinner, 'actual' | 'required' | 'evidence'>>();
  const roleLines = new Map<string, BattingLine & { squadId: string; position: Position }>();
  const matches = world.definitions.schedule
    .filter(
      (m) => gameScope(world.definitions, m) === summary.statScope && m.date <= summary.completedOn,
    )
    .sort((a, b) => compareId(a.date, b.date) || compareId(a.gameId, b.gameId));
  for (const match of matches) {
    const game = world.games[match.gameId];
    ensure(
      game?.result &&
        game.state.phase === 'gameComplete' &&
        world.statApplicationMarkers[match.gameId]?.resultRevision === game.result.resultRevision,
      '表彰の試合原記録が未確定です',
    );
    const roles = new Map<string, { position: Position; squadId: string }>();
    for (const side of ['away', 'home'] as const) {
      const team = game.fixture.teams[side];
      const squadId = side === 'away' ? match.awaySquadId : match.homeSquadId;
      const club = game.fixture.clubs.find((c) => c.clubId === team.clubId)!;
      for (const player of game.fixture.players.filter((p) => club.playerIds.includes(p.playerId)))
        names.set(JSON.stringify([squadId, player.playerId]), {
          playerId: player.playerId,
          squadId,
          clubId: team.clubId,
          displayName: player.familyName + ' ' + player.givenName,
          teamName: team.name,
        });
      for (const slot of team.lineup)
        roles.set(slot.playerId, { position: slot.position, squadId });
    }
    for (const event of game.events) {
      if (event.substitution) {
        const sub = event.substitution,
          previous = roles.get(sub.outPlayerId);
        if (previous) {
          roles.delete(sub.outPlayerId);
          roles.set(sub.inPlayerId, previous);
        }
      }
      if (!event.outcome || !event.pitch) continue;
      const playerId = event.pitch.batterId,
        role = roles.get(playerId);
      ensure(role, '表彰で打席の役割を解決できません');
      const key = JSON.stringify([role.squadId, playerId, role.position]);
      let row = roleLines.get(key);
      if (!row) {
        row = {
          ...role,
          playerId,
          plateAppearances: 0,
          atBats: 0,
          hits: 0,
          doubles: 0,
          triples: 0,
          homeRuns: 0,
          runs: 0,
          runsBattedIn: 0,
          walks: 0,
          hitByPitch: 0,
          strikeouts: 0,
          sacrificeFlies: 0,
        };
        roleLines.set(key, row);
      }
      row.plateAppearances++;
      const outcome = event.outcome;
      if (outcome === 'walk') row.walks++;
      else if (outcome === 'hitByPitch') row.hitByPitch++;
      else if (outcome === 'sacrificeFly') row.sacrificeFlies = (row.sacrificeFlies ?? 0) + 1;
      else {
        row.atBats++;
        if (['single', 'double', 'triple', 'homeRun'].includes(outcome)) row.hits++;
        if (outcome === 'double') row.doubles++;
        if (outcome === 'triple') row.triples++;
        if (outcome === 'homeRun') row.homeRuns++;
        if (outcome === 'strikeout') row.strikeouts++;
      }
    }
  }
  return { names, roleLines };
}

/** 確定済みの年度要約と試合原記録から参考候補を集計する。確定受賞履歴ではない。確率抽選・総合能力評価を使わない。 */
export function selectSeasonHonors(
  world: WorldRecord,
  summary: SeasonSummary,
  rules: AwardsRules,
): SeasonHonors {
  validateAwardsRules(rules);
  ensure(summary.version === 'season-summary-v2', '表彰には保存内のリーグ別年度要約が必要です');
  ensure(
    summary.seasonId === world.definitions.seasonId &&
      summary.competitionId ===
        (summary.statScope === 'farmRegular'
          ? world.definitions.farm?.competitionId
          : world.definitions.competitionId),
    '表彰と年度・大会が一致しません',
  );
  const { names, roleLines } = seasonSources(world, summary);
  const winner = (
    squadId: string,
    playerId: string,
    actual: number,
    required: number | null,
    ev: AwardEvidence[],
  ): AwardWinner => {
    const display = names.get(JSON.stringify([squadId, playerId]));
    ensure(display, '受賞時の選手名簿がありません');
    return { ...display, actual, required, evidence: ev };
  };
  const leagues = summary.leagues.map((league) => {
    ensure(league.leagueId, '表彰のリーグIDがありません');
    const ids = league.clubs.map((c) => c.squadId);
    const awards: SeasonAward[] = [];
    const add = (
      code: string,
      name: string,
      category: SeasonAward['category'],
      position: Position | null,
      candidates: AwardWinner[],
      recorded = true,
    ) => {
      candidates.sort(
        (a, b) => compareEvidence(a.evidence, b.evidence) || compareId(a.playerId, b.playerId),
      );
      const best = candidates[0];
      awards.push({
        awardId: JSON.stringify([
          summary.seasonId,
          summary.competitionId,
          league.leagueId,
          code,
          position,
        ]),
        code,
        name,
        category,
        position,
        status: best ? 'awarded' : recorded ? 'noEligiblePlayer' : 'notRecorded',
        eligibleCount: candidates.length,
        winners: best
          ? candidates.filter((c) => compareEvidence(c.evidence, best.evidence) === 0)
          : [],
      });
    };
    const titles = [
      ['batting', 'average', '首位打者'],
      ['batting', 'hits', '最多安打'],
      ['batting', 'homeRuns', '本塁打王'],
      ['batting', 'runsBattedIn', '打点王'],
      ['batting', 'onBasePercentage', '最高出塁率'],
      ['pitching', 'era', '最優秀防御率'],
      ['pitching', 'strikeouts', '最多奪三振'],
    ] as const;
    for (const [category, key, name] of titles) {
      const metric = STAT_METRICS[category].find((m) => m.key === key)!;
      const rows = playerLeaderboard(summary.stats, {
        seasonId: summary.seasonId,
        competitionId: summary.competitionId,
        statScope: summary.statScope,
        category,
        metric: key,
        includedSquadIds: ids,
        qualifiedOnly: true,
      });
      const candidates = rows.flatMap((row) => {
        const value = statValue(row, metric);
        const rate = !!metric.qualification || key === 'onBasePercentage';
        if (
          !value ||
          row.squadIds.length !== 1 ||
          (rate && !row.qualification?.reached) ||
          (!rate && value.numerator === 0n)
        )
          return [];
        return [
          winner(
            row.squadIds[0]!,
            row.playerId,
            rate ? row.qualification!.actual : Number(value.numerator),
            rate ? row.qualification!.required : null,
            [
              evidence(
                metric.label,
                value.numerator,
                value.denominator,
                metric.format === 'era' ? 'era' : metric.format === 'average' ? 'average' : 'count',
                metric.direction === 'ascending' ? 'lower' : 'higher',
              ),
            ],
          ),
        ];
      });
      add(key, name, 'title', null, candidates);
    }
    for (const position of AWARD_POSITIONS) {
      const candidates: AwardWinner[] = [];
      if (position === 'P') {
        for (const row of summary.stats.pitching.filter((p) => ids.includes(p.squadId))) {
          const games = summary.stats.teams.find((t) => t.squadId === row.squadId)?.games ?? 0;
          const required = games * rules.pitchingOutsPerTeamGame;
          if (games === 0 || row.outsRecorded === 0 || row.outsRecorded < required) continue;
          candidates.push(
            winner(row.squadId, row.playerId, row.outsRecorded, required, [
              evidence('防御率', 27n * BigInt(row.earnedRuns), row.outsRecorded, 'era', 'lower'),
              evidence('投球アウト', row.outsRecorded),
            ]),
          );
        }
      } else {
        for (const row of roleLines.values()) {
          if (row.position !== position || !ids.includes(row.squadId)) continue;
          const games = summary.stats.teams.find((t) => t.squadId === row.squadId)?.games ?? 0;
          const required = games * rules.battingRolePaPerTeamGame;
          const obpD = row.atBats + row.walks + row.hitByPitch + (row.sacrificeFlies ?? 0);
          if (games === 0 || row.plateAppearances < required || row.atBats === 0 || obpD === 0)
            continue;
          const bases = row.hits + row.doubles + 2 * row.triples + 3 * row.homeRuns;
          const numerator =
            BigInt(row.hits + row.walks + row.hitByPitch) * BigInt(row.atBats) +
            BigInt(bases) * BigInt(obpD);
          candidates.push(
            winner(row.squadId, row.playerId, row.plateAppearances, required, [
              evidence('当該位置のOPS', numerator, BigInt(row.atBats) * BigInt(obpD), 'average'),
              evidence('当該位置の打席', row.plateAppearances),
            ]),
          );
        }
      }
      add('bestNine', 'ベストナイン', 'bestNine', position, candidates);
      if (position === 'DH') continue;
      const fielders = summary.stats.fielding.filter(
        (f) => ids.includes(f.squadId) && f.position === position,
      );
      const gloves = fielders.flatMap((row) => {
        const games = summary.stats.teams.find((t) => t.squadId === row.squadId)?.games ?? 0;
        const required = games * rules.fieldingOutsPerTeamGame;
        if (games === 0 || row.fieldingOuts < required || row.errors === undefined) return [];
        const chances = row.putouts + row.assists + row.errors;
        if (chances === 0) return [];
        return [
          winner(row.squadId, row.playerId, row.fieldingOuts, required, [
            evidence('守備率', row.putouts + row.assists, chances, 'average'),
            evidence('守備機会', chances),
          ]),
        ];
      });
      const missing = fielders.some((f) => f.errors === undefined);
      add('goldGlove', 'ゴールデングラブ', 'goldGlove', position, missing ? [] : gloves, !missing);
    }
    return { leagueId: league.leagueId, displayName: league.displayName, awards };
  });
  return structuredClone({
    version: 'reference-season-honors-v1',
    seasonId: summary.seasonId,
    competitionId: summary.competitionId,
    statScope: summary.statScope,
    assessedOn: summary.completedOn,
    rules,
    leagues,
  });
}

export function formatAwardEvidence(e: AwardEvidence): string {
  const n = BigInt(e.numerator),
    d = BigInt(e.denominator);
  if (e.format === 'count') return String(n / d);
  if (e.format === 'innings') return `${n / 3n}.${n % 3n}`;
  const scale = e.format === 'era' ? 100n : 1000n;
  const value = (n * scale * 2n + d) / (2n * d);
  const text = `${value / scale}.${String(value % scale).padStart(e.format === 'era' ? 2 : 3, '0')}`;
  return e.format === 'average' ? text.replace(/^0\./, '.') : text;
}
