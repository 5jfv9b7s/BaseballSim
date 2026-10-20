import { STATISTICS_RULES } from '../../config/statistics.ts';
import { ensure, integer } from '../engine/validation.ts';
import type { SeasonStats, StatKey } from './types.ts';

export type StatCategory = 'batting' | 'pitching' | 'fielding';
export type SortDirection = 'ascending' | 'descending';
export type StatValue = { numerator: bigint; denominator: bigint } | null;

export interface StatMetric {
  key: string;
  label: string;
  direction: SortDirection;
  format?: 'average' | 'era' | 'ratio' | 'innings';
  formula?: string;
  qualification?: 'plateAppearances' | 'outsRecorded';
}

const count = (key: string, label: string): StatMetric => ({
  key,
  label,
  direction: 'descending',
});

/** 現在記録している指標だけを公開する。勝利・セーブ等を0で補わない。 */
export const STAT_METRICS: Record<StatCategory, readonly StatMetric[]> = {
  batting: [
    {
      key: 'average',
      label: '打率',
      direction: 'descending',
      format: 'average',
      qualification: 'plateAppearances',
    },
    count('plateAppearances', '打席'),
    count('atBats', '打数'),
    count('hits', '安打'),
    count('doubles', '二塁打'),
    count('triples', '三塁打'),
    count('homeRuns', '本塁打'),
    count('runs', '得点'),
    count('runsBattedIn', '打点'),
    count('walks', '四球'),
    count('hitByPitch', '死球'),
    count('strikeouts', '三振'),
    count('sacrificeFlies', '犠飛'),
    count('groundedIntoDoublePlays', '併殺打'),
    {
      key: 'onBasePercentage',
      label: '出塁率',
      direction: 'descending',
      format: 'average',
      formula: '（安打＋四球＋死球）÷（打数＋四球＋死球＋犠飛）',
    },
    {
      key: 'sluggingPercentage',
      label: '長打率',
      direction: 'descending',
      format: 'average',
      formula: '（安打＋二塁打＋2×三塁打＋3×本塁打）÷打数',
    },
    {
      key: 'ops',
      label: 'OPS',
      direction: 'descending',
      format: 'average',
      formula: '丸め前の出塁率＋丸め前の長打率',
    },
  ],
  pitching: [
    {
      key: 'era',
      label: '防御率',
      direction: 'ascending',
      format: 'era',
      qualification: 'outsRecorded',
    },
    { ...count('outsRecorded', '投球回'), format: 'innings' },
    count('pitches', '投球数'),
    count('battersFaced', '対戦打者'),
    count('hitsAllowed', '被安打'),
    count('homeRunsAllowed', '被本塁打'),
    count('strikeouts', '奪三振'),
    count('walks', '与四球'),
    count('hitBatters', '与死球'),
    count('runsAllowed', '失点'),
    count('earnedRuns', '自責点'),
    {
      key: 'strikeoutsPerNine',
      label: '奪三振率',
      direction: 'descending',
      format: 'ratio',
      formula: '27×奪三振÷投球アウト（9回当たり）',
    },
    {
      key: 'whip',
      label: 'WHIP',
      direction: 'ascending',
      format: 'ratio',
      formula: '3×（被安打＋与四球）÷投球アウト（1回当たり）',
    },
    {
      key: 'strikeoutWalkRatio',
      label: 'K/BB',
      direction: 'descending',
      format: 'ratio',
      formula: '奪三振÷与四球。与四球0は「—」（順位なし）',
    },
  ],
  fielding: [
    { ...count('fieldingOuts', '守備回'), format: 'innings' },
    count('gamesAtPosition', '出場試合'),
    count('putouts', '刺殺'),
    count('assists', '補殺'),
    count('doublePlayParticipations', '併殺関与'),
    count('errors', '失策'),
    {
      key: 'fieldingPercentage',
      label: '守備率',
      direction: 'descending',
      format: 'average',
      formula: '（刺殺＋補殺）÷（刺殺＋補殺＋失策）。守備機会0は「—」',
    },
  ],
};

export interface LeaderboardRow {
  playerId: string;
  squadIds: string[];
  position: string | null;
  counters: Record<string, number | undefined>;
  /** 複数所属の資格規則は未決定。該当時に推測した規定を作らない。 */
  qualification: { games: number; required: number; actual: number; reached: boolean } | null;
  rank: number | null;
}

export interface LeaderboardQuery {
  seasonId: string;
  competitionId: string;
  statScope: StatKey['statScope'];
  category: StatCategory;
  metric: string;
  direction?: SortDirection;
  qualifiedOnly?: boolean;
  squadId?: string;
  /** 集計前の参加チーム制限。球団絞り込み（順位を維持）とは別。空なら0件。 */
  includedSquadIds?: readonly string[];
  position?: string;
}

/** 四捨五入は整数演算。予定試合数・経過日数ではなく球団の実施試合数を渡す。 */
export function qualificationThreshold(games: number, category: 'batting' | 'pitching'): number {
  integer(games, 0, Number.MAX_SAFE_INTEGER, '実施試合数');
  const ratio = STATISTICS_RULES.plateAppearancesPerGame;
  integer(ratio.numerator, 1, Number.MAX_SAFE_INTEGER, '規定打席の分子');
  integer(ratio.denominator, 1, Number.MAX_SAFE_INTEGER, '規定打席の分母');
  integer(STATISTICS_RULES.pitchingOutsPerGame, 1, Number.MAX_SAFE_INTEGER, '規定投球アウト');
  const value =
    category === 'batting'
      ? (2n * BigInt(games) * BigInt(ratio.numerator) + BigInt(ratio.denominator)) /
        (2n * BigInt(ratio.denominator))
      : BigInt(games) * BigInt(STATISTICS_RULES.pitchingOutsPerGame);
  const result = Number(value);
  integer(result, 0, Number.MAX_SAFE_INTEGER, '規定到達基準');
  return result;
}

/** 不明なカウンタは0にせず、和・積も最初から整数で計算する。 */
export function statValue(row: LeaderboardRow, metric: StatMetric): StatValue {
  const total = (...terms: (string | [string, bigint])[]): bigint | null => {
    let result = 0n;
    for (const term of terms) {
      const [key, coefficient] = typeof term === 'string' ? [term, 1n] : term;
      const value = row.counters[key];
      if (value === undefined) return null;
      result += BigInt(value) * coefficient;
    }
    return result;
  };
  const ratio = (numerator: bigint | null, denominator: bigint | null): StatValue =>
    numerator === null || denominator === null || denominator === 0n
      ? null
      : { numerator, denominator };
  const onBase = () =>
    ratio(
      total('hits', 'walks', 'hitByPitch'),
      total('atBats', 'walks', 'hitByPitch', 'sacrificeFlies'),
    );
  const slugging = () =>
    ratio(total('hits', 'doubles', ['triples', 2n], ['homeRuns', 3n]), total('atBats'));

  switch (metric.key) {
    case 'average':
      return ratio(total('hits'), total('atBats'));
    case 'era':
      return ratio(total(['earnedRuns', 27n]), total('outsRecorded'));
    case 'onBasePercentage':
      return onBase();
    case 'sluggingPercentage':
      return slugging();
    case 'ops': {
      const obp = onBase();
      const slg = slugging();
      // それぞれの表示値を足さず、分数のまま加算してから最後に丸める。
      return obp && slg
        ? {
            numerator: obp.numerator * slg.denominator + slg.numerator * obp.denominator,
            denominator: obp.denominator * slg.denominator,
          }
        : null;
    }
    case 'strikeoutsPerNine':
      return ratio(total(['strikeouts', 27n]), total('outsRecorded'));
    case 'whip':
      return ratio(total(['hitsAllowed', 3n], ['walks', 3n]), total('outsRecorded'));
    case 'strikeoutWalkRatio':
      return ratio(total('strikeouts'), total('walks'));
    case 'fieldingPercentage':
      return ratio(total('putouts', 'assists'), total('putouts', 'assists', 'errors'));
    default:
      return ratio(total(metric.key), 1n);
  }
}

/** 表示は最後に丸める。投球回の小数表記を率の分母へ使わない。 */
export function formatStatValue(value: StatValue, metric: StatMetric): string {
  if (!value) return '—';
  const { numerator, denominator } = value;
  if (metric.format === 'innings') return `${numerator / 3n}.${numerator % 3n}`;
  if (!metric.format) return String(numerator);
  const digits = STATISTICS_RULES.decimalPlaces[metric.format];
  const scale = 10n ** BigInt(digits);
  const rounded = (numerator * scale * 2n + denominator) / (denominator * 2n);
  const text = `${rounded / scale}.${String(rounded % scale).padStart(digits, '0')}`;
  return metric.format === 'average' ? text.replace(/^0\./, '.') : text;
}

const compareId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** 純粋なQuery。年度・大会で抽出→選手（守備は位置も）で合算→正確な率で順位付け。 */
export function playerLeaderboard(stats: SeasonStats, query: LeaderboardQuery): LeaderboardRow[] {
  const metric = STAT_METRICS[query.category].find((entry) => entry.key === query.metric);
  ensure(metric, '未対応の成績指標です');
  const inScope = (row: StatKey) =>
    row.seasonId === query.seasonId &&
    row.competitionId === query.competitionId &&
    row.statScope === query.statScope;
  const teams = stats.teams.filter(inScope);
  const included = query.includedSquadIds && new Set(query.includedSquadIds);
  const sources = stats[query.category].filter(inScope);
  // 他リーグ分を除いても、移籍による資格未決定を単一所属に見せない。
  const memberships = new Map<string, Set<string>>();
  for (const source of sources) {
    const squads = memberships.get(source.playerId) ?? new Set<string>();
    squads.add(source.squadId);
    memberships.set(source.playerId, squads);
  }
  const rows = new Map<string, LeaderboardRow>();

  const fields = STAT_METRICS[query.category].filter(
    (item) => !item.format || item.format === 'innings',
  );
  for (const source of sources) {
    if (included && !included.has(source.squadId)) continue;
    const position = 'position' in source ? source.position : null;
    if (query.position && position !== query.position) continue;
    const key = JSON.stringify([source.playerId, position]);
    let row = rows.get(key);
    if (!row) {
      row = {
        playerId: source.playerId,
        squadIds: [],
        position,
        counters: {},
        qualification: null,
        rank: null,
      };
      rows.set(key, row);
    }
    const first = row.squadIds.length === 0;
    for (const field of fields) {
      const value = (source as unknown as Record<string, unknown>)[field.key];
      if (value === undefined || (!first && row.counters[field.key] === undefined)) {
        row.counters[field.key] = undefined;
      } else {
        ensure(typeof value === 'number', '成績カウンタの型が不正です');
        integer(value, 0, Number.MAX_SAFE_INTEGER, '成績カウンタ');
        const sum = (row.counters[field.key] ?? 0) + value;
        integer(sum, 0, Number.MAX_SAFE_INTEGER, '合算成績カウンタ');
        row.counters[field.key] = sum;
      }
    }
    if (!row.squadIds.includes(source.squadId)) row.squadIds.push(source.squadId);
  }

  const observed = [...rows.values()].filter((row) => {
    row.squadIds.sort(compareId);
    if (query.category === 'batting') return (row.counters.plateAppearances ?? 0) > 0;
    if (query.category === 'pitching')
      return (
        (row.counters.pitches ?? 0) > 0 ||
        (row.counters.battersFaced ?? 0) > 0 ||
        (row.counters.outsRecorded ?? 0) > 0
      );
    return (row.counters.gamesAtPosition ?? 0) > 0;
  });
  for (const row of observed) {
    if (query.category === 'fielding' || memberships.get(row.playerId)!.size !== 1) continue;
    const team = teams.find((entry) => entry.squadId === row.squadIds[0]);
    if (!team) continue;
    const required = qualificationThreshold(team.games, query.category);
    const actual =
      row.counters[query.category === 'batting' ? 'plateAppearances' : 'outsRecorded'] ?? 0;
    row.qualification = {
      games: team.games,
      required,
      actual,
      reached: team.games > 0 && actual >= required,
    };
  }
  const candidates = observed.filter(
    (row) => !metric.qualification || !query.qualifiedOnly || row.qualification?.reached,
  );
  const direction = query.direction ?? metric.direction;
  const compare = (a: LeaderboardRow, b: LeaderboardRow): number => {
    const av = statValue(a, metric);
    const bv = statValue(b, metric);
    // 未観測・旧版の未対応は昇順でも末尾。数値0と同順位にしない。
    if (!av || !bv) return av ? -1 : bv ? 1 : 0;
    const delta = av.numerator * bv.denominator - bv.numerator * av.denominator;
    const order = delta < 0n ? -1 : delta > 0n ? 1 : 0;
    return direction === 'ascending' ? order : -order;
  };
  candidates.sort(
    (a, b) =>
      compare(a, b) ||
      compareId(a.playerId, b.playerId) ||
      compareId(a.position ?? '', b.position ?? ''),
  );
  for (let index = 0; index < candidates.length; index++) {
    const row = candidates[index]!;
    if (!statValue(row, metric)) continue;
    row.rank =
      index > 0 && compare(row, candidates[index - 1]!) === 0
        ? candidates[index - 1]!.rank
        : index + 1;
  }
  // 球団で絞っても、参加チーム制限内の順位と当季合計を維持する。
  return candidates.filter((row) => !query.squadId || row.squadIds.includes(query.squadId));
}
