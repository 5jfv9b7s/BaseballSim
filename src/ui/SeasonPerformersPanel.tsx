import { useState } from 'react';
import type { WorldView } from '../world/controller.ts';
import { formatStatValue, statValue } from '../world/leaderboard.ts';
import { seasonClubPerformers } from '../world/season-performers.ts';
import type { SeasonPerformanceMetric } from '../world/season-performers.ts';
import type { SeasonSummary } from '../world/types.ts';
import { ClubMark } from './visuals/BaseballVisuals.tsx';
import './season-performers.css';

const EMPTY_LABELS = {
  noRecord: '成績記録なし',
  noPositiveValue: '該当記録なし（全員0）',
  noQualifiedPlayer: '規定到達者なし',
};

/** 保存された年度要約の表示。球団切替・選手の選択で世界を変更しない。 */
export function SeasonPerformersPanel({
  summary,
  view,
  ownSquadId,
  onSelectPlayer,
}: {
  summary: SeasonSummary;
  view: WorldView;
  ownSquadId?: string;
  onSelectPlayer: (id: string) => void;
}) {
  const [choice, setChoice] = useState('');
  const competition =
    summary.statScope === 'farmRegular' ? view.definitions.farm! : view.definitions;
  const squad =
    competition.squads.find((entry) => entry.squadId === choice) ??
    competition.squads.find((entry) => entry.squadId === ownSquadId) ??
    competition.squads[0]!;
  const metrics = seasonClubPerformers(view.definitions, summary, squad.squadId);
  const result = summary.clubs.find((row) => row.squadId === squad.squadId);
  const players = view.definitions.squads.flatMap((entry) => entry.players);
  const playerName = (id: string) => {
    const player = players.find((entry) => entry.playerId === id);
    return player ? `${player.familyName} ${player.givenName}` : `氏名未記録（${id}）`;
  };
  function metricRow(item: SeasonPerformanceMetric) {
    const { metric, leaders, emptyReason } = item;
    const label = metric.label + (metric.qualification ? '（規定）' : '');
    return (
      <tr key={metric.key} data-metric={metric.key}>
        <th scope="row">{label}</th>
        <td className="season-performer-value">
          {leaders[0] ? formatStatValue(statValue(leaders[0], metric), metric) : '—'}
        </td>
        <td>
          {emptyReason ? (
            <span className="hint">{EMPTY_LABELS[emptyReason]}</span>
          ) : (
            <>
              {leaders.length > 1 && <small>同率{leaders.length}人</small>}
              <ul className="season-performer-names">
                {leaders.map((row) => (
                  <li key={row.playerId}>
                    <button
                      className="player-link"
                      type="button"
                      onClick={() => onSelectPlayer(row.playerId)}
                      aria-label={`${label} ${playerName(row.playerId)}の選手詳細`}
                    >
                      {playerName(row.playerId)}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </td>
      </tr>
    );
  }

  return (
    <section className="season-performers" aria-label="シーズンの活躍選手">
      <div className="season-performer-heading">
        <h3>今季の活躍選手</h3>
        <span>
          {summary.seasonId} ／ {summary.statScope === 'farmRegular' ? '二軍公式戦' : '一軍公式戦'}
          {' ／ '}
          <time dateTime={summary.completedOn}>{summary.completedOn}確定</time>
        </span>
      </div>
      <label className="season-performer-filter">
        活躍を確認する球団
        <select value={squad.squadId} onChange={(event) => setChoice(event.target.value)}>
          {competition.squads.map((entry) => (
            <option key={entry.squadId} value={entry.squadId}>
              {entry.team.name}
              {entry.squadId === ownSquadId ? '（自球団）' : ''}
            </option>
          ))}
        </select>
      </label>
      <div className="season-performer-club" data-own-club={squad.squadId === ownSquadId}>
        <ClubMark clubId={squad.team.clubId} small />
        <strong>{squad.team.name}</strong>
        {squad.squadId === ownSquadId && <span className="season-growth-own">自球団</span>}
      </div>
      {result && (
        <dl className="season-performer-result" aria-label="選択球団の最終結果">
          <div>
            <dt>最終順位</dt>
            <dd>{result.rank === null ? '—' : `${result.rank}位`}</dd>
          </div>
          <div>
            <dt>勝</dt>
            <dd>{result.wins}</dd>
          </div>
          <div>
            <dt>敗</dt>
            <dd>{result.losses}</dd>
          </div>
          <div>
            <dt>分</dt>
            <dd>{result.draws}</dd>
          </div>
          <div>
            <dt>{result.wins >= result.losses ? '貯金' : '借金'}</dt>
            <dd>{Math.abs(result.wins - result.losses)}</dd>
          </div>
        </dl>
      )}
      <div className="season-performer-tables">
        {(['batting', 'pitching'] as const).map((category) => (
          <table
            key={category}
            aria-label={category === 'batting' ? '球団内の打撃実績' : '球団内の投手実績'}
          >
            <caption>{category === 'batting' ? '打撃' : '投手'}</caption>
            <thead>
              <tr>
                <th scope="col">部門</th>
                <th scope="col">成績</th>
                <th scope="col">選手</th>
              </tr>
            </thead>
            <tbody>{metrics.filter((item) => item.category === category).map(metricRow)}</tbody>
          </table>
        ))}
      </div>
      <p className="hint">
        数量は球団内最多、打率は規定到達者の最高、防御率は規定到達者の最小。選手名から詳細を開けます。
      </p>
      <details>
        <summary>選出・規定の見方</summary>
        <p>
          この球団の確定成績を部門ごとに比較し、同率者は全員表示します。率は丸め前の分数で比較します。投球回はアウト数から表示し、数量が全員0の部門は該当記録なしとします。
        </p>
        <p>
          規定打席・規定投球回は詳細成績と同じ試作規則です。未到達・所属をまたぐ資格未決定は率の対象外です。他球団での成績は加算しません。総合評価・タイトル・B9・GGの表彰ではありません。
        </p>
      </details>
    </section>
  );
}
