import { useState } from 'react';
import { STATISTICS_RULES } from '../../config/statistics.ts';
import {
  STAT_METRICS,
  formatStatValue,
  statValue,
  type StatCategory,
  type SortDirection,
} from '../world/leaderboard.ts';
import { leaderboardLeagues, leaguePlayerLeaderboard } from '../world/league-leaderboard.ts';
import type { SeasonStats, StatKey, WorldDefinitions } from '../world/types.ts';
import './leaderboard.css';

const CATEGORY_NAMES = { batting: '打撃', pitching: '投手', fielding: '守備' } as const;

export function SeasonLeaderboard({
  stats,
  definitions,
  scope,
  currentDate,
  completedOn,
  controlledSquadId,
  onSelectPlayer,
}: {
  stats: SeasonStats;
  definitions: WorldDefinitions;
  scope: StatKey['statScope'];
  currentDate: string;
  completedOn?: string;
  controlledSquadId?: string;
  onSelectPlayer?: (id: string) => void;
}) {
  const [category, setCategory] = useState<StatCategory>('batting');
  const [metricKey, setMetricKey] = useState('average');
  const [direction, setDirection] = useState<SortDirection>('descending');
  const [qualifiedOnly, setQualifiedOnly] = useState(false);
  const [clubFilter, setClubFilter] = useState('');
  const [leagueSelections, setLeagueSelections] = useState<Partial<Record<typeof scope, string>>>(
    {},
  );
  const [position, setPosition] = useState('');
  const competition = scope === 'farmRegular' ? definitions.farm! : definitions;
  const squads = competition.squads;
  const ownClub = definitions.squads.find((squad) => squad.squadId === controlledSquadId)?.team
    .clubId;
  const metrics = STAT_METRICS[category];
  const metric = metrics.find((entry) => entry.key === metricKey)!;
  const leagues = leaderboardLeagues(definitions, scope);
  const ownSquad = squads.find((squad) => squad.team.clubId === ownClub);
  const defaultLeague =
    leagues.find((league) => ownSquad && league.squadIds.includes(ownSquad.squadId)) ?? leagues[0];
  const requestedLeague = leagueSelections[scope];
  const leagueId =
    (requestedLeague === '' && leagues.length > 1) ||
    leagues.some((league) => league.leagueId === requestedLeague)
      ? requestedLeague!
      : (defaultLeague?.leagueId ?? '');
  const league = leagues.find((entry) => entry.leagueId === (leagueId || null));
  const leagueName = league?.displayName ?? '全リーグ（合算）';
  const selectableSquads = league
    ? squads.filter((squad) => league.squadIds.includes(squad.squadId))
    : squads;
  const squadId = selectableSquads.find((squad) => squad.team.clubId === clubFilter)?.squadId;
  const rows = leaguePlayerLeaderboard(definitions, stats, {
    seasonId: definitions.seasonId,
    competitionId: competition.competitionId,
    statScope: scope,
    leagueId: league?.leagueId ?? undefined,
    category,
    metric: metric.key,
    direction,
    qualifiedOnly,
    squadId,
    position: category === 'fielding' ? position : undefined,
  });
  const players = definitions.squads.flatMap((squad) => squad.players);
  const chooseMetric = (key: string) => {
    const next = metrics.find((entry) => entry.key === key)!;
    setMetricKey(key);
    setDirection(next.direction);
  };
  const selectCategory = (next: StatCategory) => {
    setCategory(next);
    setMetricKey(STAT_METRICS[next][0]!.key);
    setDirection(STAT_METRICS[next][0]!.direction);
  };

  return (
    <div className="season-leaderboard">
      <p>
        {definitions.seasonId} ／ {scope === 'farmRegular' ? '二軍公式戦' : '一軍公式戦'} ／{' '}
        {leagueName} ／
        {completedOn ? ` 今季確定（${completedOn}終了）` : ` ${currentDate}現在・確定試合のみ`}
      </p>
      <div className="world-controls" role="group" aria-label="成績の種類">
        {(Object.keys(CATEGORY_NAMES) as StatCategory[]).map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={category === kind}
            onClick={() => selectCategory(kind)}
          >
            {CATEGORY_NAMES[kind]}
          </button>
        ))}
      </div>
      <div className="world-controls">
        <label>
          成績のリーグ
          <select
            value={leagueId}
            disabled={leagues.length <= 1}
            onChange={(event) => {
              setLeagueSelections({ ...leagueSelections, [scope]: event.target.value });
              setClubFilter('');
            }}
          >
            {leagues.length > 1 && <option value="">全リーグ（合算）</option>}
            {leagues.map((entry) => (
              <option key={entry.leagueId ?? 'unrecorded'} value={entry.leagueId ?? ''}>
                {entry.displayName}
                {entry.leagueId && ownSquad && entry.squadIds.includes(ownSquad.squadId)
                  ? '（自リーグ）'
                  : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          成績の球団
          <select
            value={squadId ? clubFilter : ''}
            onChange={(event) => setClubFilter(event.target.value)}
          >
            <option value="">全球団</option>
            {selectableSquads.map((squad) => (
              <option key={squad.squadId} value={squad.team.clubId}>
                {squad.team.name}
                {squad.team.clubId === ownClub ? '（担当球団）' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          並べ替える指標
          <select value={metric.key} onChange={(event) => chooseMetric(event.target.value)}>
            {metrics.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          並び順
          <select
            value={direction}
            onChange={(event) => setDirection(event.target.value as SortDirection)}
          >
            <option value="descending">多い順</option>
            <option value="ascending">少ない順</option>
          </select>
        </label>
        <label>
          率の対象
          <select
            value={qualifiedOnly ? 'qualified' : 'all'}
            disabled={!metric.qualification}
            onChange={(event) => setQualifiedOnly(event.target.value === 'qualified')}
          >
            <option value="all">全選手</option>
            <option value="qualified">規定到達者のみ</option>
          </select>
        </label>
        {category === 'fielding' && (
          <label>
            守備位置
            <select value={position} onChange={(event) => setPosition(event.target.value)}>
              <option value="">全位置</option>
              {['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <details>
        <summary>集計基準と規定を確認</summary>
        <p className="hint">
          規定打席＝球団の実施試合数×
          {STATISTICS_RULES.plateAppearancesPerGame.numerator /
            STATISTICS_RULES.plateAppearancesPerGame.denominator}
          を四捨五入。 規定投球回＝実施試合数×{STATISTICS_RULES.pitchingOutsPerGame / 3}。
          規定による絞り込みは打率・防御率だけに適用します。
          丸め前の値が同じなら同順位です。球団で絞っても選択したリーグ内の順位を保ちます。
        </p>
        <p className="hint">
          安打などの積算値に出場最低数は設けません。出場記録のない選手は載せず、
          未観測の率・旧保存にない項目は「—」とし順位を付けません。
          分母0の率は「—」です。K/BBの与四球0も無限大の順位にはしません。
          リーグを選ぶと、そのリーグの参加球団で残した成績だけを合算します（交流戦を含む）。
          全リーグは合算順位です。複数球団での規定の移籍特例は未対応のため資格未判定とします。
          出塁率・長打率・OPS・奪三振率・WHIP・K/BB・守備率には、未決定の規定を追加しません。
          旧保存に犠飛がない場合は、出塁率とOPSも「—」です。
          これは成績の並べ替えで、タイトル・B9・GGの受賞判定ではありません。
        </p>
      </details>
      <h3>
        {leagueName} ／ {CATEGORY_NAMES[category]}ランキング：{metric.label}
      </h3>
      {metric.formula && (
        <p className="hint">
          {metric.label}＝{metric.formula}
        </p>
      )}
      <p>
        {rows.length}件{category === 'fielding' ? '（選手・守備位置別）' : ''}
      </p>
      {rows.length === 0 ? (
        <p>条件に合う成績がありません。</p>
      ) : (
        <div
          className="world-table leaderboard-table"
          tabIndex={0}
          role="region"
          aria-label="成績表の横スクロール"
        >
          <table aria-label={`${CATEGORY_NAMES[category]}ランキング`}>
            <thead>
              <tr>
                <th className="leaderboard-player">選手・球団</th>
                <th>順位</th>
                {category === 'fielding' ? <th>位置</th> : <th>規定到達</th>}
                {metrics.map((entry) => (
                  <th key={entry.key} aria-sort={metric.key === entry.key ? direction : 'none'}>
                    <button
                      type="button"
                      onClick={() =>
                        metric.key === entry.key
                          ? setDirection(direction === 'ascending' ? 'descending' : 'ascending')
                          : chooseMetric(entry.key)
                      }
                      aria-label={`${entry.label}で並べ替え`}
                    >
                      {entry.label}
                      {metric.key === entry.key ? (direction === 'ascending' ? ' ↑' : ' ↓') : ''}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const player = players.find((entry) => entry.playerId === row.playerId);
                const teams = squads.filter((squad) => row.squadIds.includes(squad.squadId));
                const own = teams.some((squad) => squad.team.clubId === ownClub);
                const qualification = row.qualification;
                return (
                  <tr key={JSON.stringify([row.playerId, row.position])} data-own-club={own}>
                    <th scope="row" className="leaderboard-player">
                      {onSelectPlayer && player ? (
                        <button
                          className="player-link"
                          onClick={() => onSelectPlayer(row.playerId)}
                        >
                          {player.familyName} {player.givenName}
                        </button>
                      ) : player ? (
                        `${player.familyName} ${player.givenName}`
                      ) : (
                        row.playerId
                      )}
                      <span className="leaderboard-team">
                        {teams.map((squad) => squad.team.name).join(' ／ ') || '所属不明'}
                      </span>
                      {own && <span className="leaderboard-team">担当球団</span>}
                    </th>
                    <td>{row.rank ?? '—'}</td>
                    {category === 'fielding' ? (
                      <td>{row.position}</td>
                    ) : (
                      <td>
                        {qualification ? (
                          <>
                            {qualification.reached ? '到達' : '未到達'}
                            <span className="leaderboard-team">
                              {category === 'batting'
                                ? `${qualification.actual} / ${qualification.required}打席`
                                : `${formatStatValue(
                                    { numerator: BigInt(qualification.actual), denominator: 1n },
                                    metrics.find((entry) => entry.key === 'outsRecorded')!,
                                  )} / ${qualification.required / 3}回`}
                            </span>
                            <span className="leaderboard-team">球団 {qualification.games}試合</span>
                          </>
                        ) : (
                          '資格未判定'
                        )}
                      </td>
                    )}
                    {metrics.map((entry) => (
                      <td
                        key={entry.key}
                        title={statValue(row, entry) ? undefined : '未観測または必要な記録なし'}
                      >
                        {formatStatValue(statValue(row, entry), entry)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
