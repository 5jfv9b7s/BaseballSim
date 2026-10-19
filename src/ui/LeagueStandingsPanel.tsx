import { useId, useState } from 'react';
import type { LeagueStandings } from '../world/league-standings.ts';

/** 同率順位と未観測を保ち、ゲーム差は首位との勝敗差から表示だけを導出する。 */
export function StandingsTable({
  group,
  squadName,
  ownSquadId,
}: {
  group: LeagueStandings;
  squadName: (id: string) => string;
  ownSquadId?: string;
}) {
  const hintId = useId();
  const leader = group.clubs.find((row) => row.rank === 1);
  return (
    <>
      <p className="standings-scroll-hint" id={hintId}>
        横にスクロールして勝率・ゲーム差・得失点を確認 →
      </p>
      <div
        className="world-table"
        tabIndex={0}
        role="region"
        aria-label={group.displayName + 'の表スクロール領域'}
        aria-describedby={hintId}
      >
        <table aria-label={group.displayName + 'の順位表'}>
          <caption>{group.displayName}</caption>
          <thead>
            <tr>
              <th scope="col">順位</th>
              <th scope="col">球団</th>
              <th scope="col">試合</th>
              <th scope="col">勝</th>
              <th scope="col">敗</th>
              <th scope="col">分</th>
              <th scope="col">勝率</th>
              <th scope="col">差</th>
              <th scope="col">得点</th>
              <th scope="col">失点</th>
            </tr>
          </thead>
          <tbody>
            {group.clubs.map((row) => (
              <tr key={row.squadId} data-own-club={row.squadId === ownSquadId}>
                <td>{row.rank ?? '—'}</td>
                <th scope="row">
                  {squadName(row.squadId)}
                  {row.squadId === ownSquadId && <small> 自球団</small>}
                </th>
                <td>{row.games}</td>
                <td>{row.wins}</td>
                <td>{row.losses}</td>
                <td>{row.draws}</td>
                <td>{row.winPercentage?.toFixed(3) ?? '—'}</td>
                <td>
                  {leader && row.rank !== null
                    ? ((leader.wins - row.wins + row.losses - leader.losses) / 2).toFixed(1)
                    : '—'}
                </td>
                <td>{row.runsFor}</td>
                <td>{row.runsAgainst}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function LeagueStandingsPanel({
  groups,
  ownSquadId,
  squadName,
  confirmedThrough,
}: {
  groups: LeagueStandings[];
  ownSquadId?: string;
  squadName: (id: string) => string;
  confirmedThrough: string | null;
}) {
  const [choice, setChoice] = useState<string | null>(null);
  const ownGroup = groups.find((g) => g.clubs.some((r) => r.squadId === ownSquadId));
  const selected = groups.find((g) => g.leagueId === choice) ?? ownGroup ?? groups[0];
  return (
    <section className="panel" aria-label="順位表">
      <h2>順位表</h2>
      {groups.length > 1 && (
        <label>
          表示するリーグ
          <select value={selected?.leagueId ?? ''} onChange={(e) => setChoice(e.target.value)}>
            {groups.map((g) => (
              <option key={g.leagueId} value={g.leagueId ?? ''}>
                {g.displayName}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="hint">
        {confirmedThrough ? `${confirmedThrough}まで日次確定` : '日次未確定'} ／ 確定済み試合を集計
      </p>
      {selected && (
        <StandingsTable group={selected} squadName={squadName} ownSquadId={ownSquadId} />
      )}
      <details>
        <summary>順位・ゲーム差の見方</summary>
        <p>
          交流戦も一軍公式戦の成績に含めます。勝率は勝÷（勝＋敗）、引分は分母から除きます。同率は同順位とする試作規則です。勝敗が未観測の球団は順位・勝率・差を「—」と表示します。
        </p>
        <p>
          差は首位とのゲーム差です。カレンダーの貯金・借金（勝−敗）とは別の値です。現在の新規プレイは4球団による一軍2リーグ・二軍1リーグの検証構成です。
        </p>
      </details>
    </section>
  );
}
