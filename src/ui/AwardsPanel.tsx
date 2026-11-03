import { useState } from 'react';
import { formatAwardEvidence } from '../world/awards.ts';
import type { SeasonHonors, WorldHonors } from '../world/awards-types.ts';
import './memorial.css';

/** 保存済み成績を使う参考選考。受賞の確定・保存指示は送らない。 */
export function AwardsPanel({
  report,
  ownClubId,
  onlyOwn = false,
  onSelectPlayer,
}: {
  report: SeasonHonors | null;
  ownClubId?: string;
  onlyOwn?: boolean;
  onSelectPlayer: (id: string) => void;
}) {
  const [category, setCategory] = useState('title');
  return (
    <section className="season-records" aria-label="表彰の参考選考">
      <h3>
        表彰の参考選考 <small>試作</small>
      </h3>
      <p>確定した受賞履歴ではありません。現在の設定と保存済み成績から候補を再集計します。</p>
      {!report ? (
        <p>リーグ別の年度要約が確定すると表示します。旧形式の年度要約には対応していません。</p>
      ) : (
        <>
          <p>
            {report.assessedOn.slice(0, 4)}年度 ／{' '}
            {report.statScope === 'farmRegular' ? '二軍' : '一軍'} ／ {report.assessedOn}まで
          </p>
          <label className="memorial-filter">
            表彰の部門
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="title">個人タイトル</option>
              <option value="bestNine">ベストナイン</option>
              <option value="goldGlove">ゴールデングラブ</option>
            </select>
          </label>
          {report.leagues.map((league) => (
            <section key={league.leagueId} aria-label={`${league.displayName}の参考選考`}>
              <h4>{league.displayName}</h4>
              <div
                className="world-table memorial-table awards-table"
                tabIndex={0}
                role="region"
                aria-label={`${league.displayName}の候補一覧（横スクロール）`}
              >
                <table aria-label={`${league.displayName}の表彰候補`}>
                  <thead>
                    <tr>
                      <th scope="col">賞・位置</th>
                      <th scope="col">候補・所属</th>
                      <th scope="col">選考指標</th>
                      <th scope="col">出場条件</th>
                    </tr>
                  </thead>
                  <tbody>
                    {league.awards
                      .filter((award) => award.category === category)
                      .map((award) => {
                        const winners = award.winners.filter(
                          (w) => !onlyOwn || w.clubId === ownClubId,
                        );
                        return (
                          <tr
                            key={award.awardId}
                            data-own-club={winners.some((w) => w.clubId === ownClubId)}
                          >
                            <th scope="row">{award.position ?? award.name}</th>
                            {winners.length === 0 ? (
                              <td colSpan={3}>
                                {award.status === 'notRecorded'
                                  ? '必要な記録が未観測'
                                  : award.status === 'noEligiblePlayer'
                                    ? '条件を満たす選手なし'
                                    : '自球団の候補なし'}
                              </td>
                            ) : (
                              <>
                                <td>
                                  <ul className="awards-list">
                                    {winners.map((w) => (
                                      <li key={w.playerId}>
                                        {w.clubId === ownClubId && (
                                          <span className="memorial-own" aria-label="自球団">
                                            自
                                          </span>
                                        )}
                                        <button
                                          type="button"
                                          className="secondary"
                                          onClick={() => onSelectPlayer(w.playerId)}
                                        >
                                          {w.displayName}
                                        </button>
                                        <span>{w.teamName}</span>
                                      </li>
                                    ))}
                                  </ul>
                                  {award.winners.length > 1 && (
                                    <span>同率・全{award.winners.length}人</span>
                                  )}
                                </td>
                                <td>
                                  <ul className="awards-list">
                                    {winners.map((w) => (
                                      <li key={w.playerId}>
                                        {w.evidence.map((e) => (
                                          <span key={e.label}>
                                            {e.label} {formatAwardEvidence(e)}
                                          </span>
                                        ))}
                                      </li>
                                    ))}
                                  </ul>
                                </td>
                                <td>
                                  <ul className="awards-list">
                                    {winners.map((w) => (
                                      <li key={w.playerId}>
                                        {w.required === null
                                          ? '最低出場条件なし'
                                          : `${award.category === 'goldGlove' ? '守備アウト' : award.position === 'P' || award.code === 'era' ? '投球アウト' : '打席'} ${w.actual} / ${w.required}以上`}
                                      </li>
                                    ))}
                                  </ul>
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          <details className="memorial-notes">
            <summary>試作の選考ルール・未対応</summary>
            <p>
              打率・出塁率は規定打席、防御率は規定投球回の到達者が対象です。数量タイトルは0件の達成者を作りません。最多勝・セーブ等の未記録項目は対象外です。
            </p>
            <p>
              B9野手は当該位置の打席が球団試合数×{report.rules.battingRolePaPerTeamGame}
              以上。OPS→打席数の順です。投手は投球アウトが球団試合数×
              {report.rules.pitchingOutsPerTeamGame}以上で、防御率の低さ→投球アウトの順です。
            </p>
            <p>
              GGは当該位置の守備アウトが球団試合数×{report.rules.fieldingOutsPerTeamGame}
              以上。守備率→守備機会の順で、失策が未観測なら選びません。位置はP・C・1B・2B・3B・SS・LF・CF・RF。B9にはDHも含め、同じ選手の複数位置選出を許す試作です。
            </p>
            <p>
              丸め前の値が全指標で同じなら全員掲載します。投票や公式な選考基準を再現するものではありません。移籍をまたぐ資格特例・確定受賞履歴の独立保存は未実装です。
            </p>
          </details>
        </>
      )}
    </section>
  );
}

export function PlayerAwardCandidates({
  reports,
  playerId,
}: {
  reports: WorldHonors;
  playerId: string;
}) {
  const items = [reports.firstRegular, reports.farmRegular].flatMap((report) =>
    report
      ? report.leagues.flatMap((league) =>
          league.awards.flatMap((award) =>
            award.winners
              .filter((w) => w.playerId === playerId)
              .map((w) => ({ report, league, award, w })),
          ),
        )
      : [],
  );
  return (
    <section aria-label="選手の表彰候補">
      <h3>
        今季の表彰候補 <small>参考選考</small>
      </h3>
      <p>現在の設定での参考表示です。確定受賞履歴としては保存していません。</p>
      {items.length === 0 ? (
        <p>
          {[reports.firstRegular, reports.farmRegular].every((r) => r === null)
            ? 'リーグ別の年度要約が確定すると表示します。'
            : '確定済みの大会で、この選手の候補掲載はありません。'}
        </p>
      ) : (
        <ul className="awards-player-list">
          {items.map(({ report, league, award, w }) => (
            <li key={award.awardId}>
              <strong>
                {report.assessedOn.slice(0, 4)}年度・{award.name}
                {award.position && `（${award.position}）`}
              </strong>
              <span>
                {report.statScope === 'farmRegular' ? '二軍' : '一軍'} ／ {league.displayName} ／{' '}
                {w.teamName} ／ {w.displayName}
              </span>
              <span>
                {w.evidence.map((e) => `${e.label} ${formatAwardEvidence(e)}`).join(' ／ ')}
                {award.winners.length > 1 && ` ／ 同率${award.winners.length}人`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
