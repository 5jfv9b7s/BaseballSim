import { battingAverage, earnedRunAverage, inningsPitched } from '../game/results.ts';
import type { GameResult } from '../game/types.ts';
import type { WorldDefinitions } from '../world/types.ts';

type Lines = Pick<GameResult, 'batting' | 'pitching' | 'fielding'>;

/** 日別結果と累計で同じカウンタ表示を使う。未観測の率は「-」。 */
export function WorldStats({
  lines,
  definitions,
}: {
  lines: Lines;
  definitions: WorldDefinitions;
}) {
  const players = definitions.squads.flatMap((squad) =>
    squad.players.map((player) => ({
      ...player,
      teamName: squad.team.name,
    })),
  );
  const player = (id: string) => {
    const found = players.find((entry) => entry.playerId === id)!;
    return found.familyName + ' ' + found.givenName;
  };
  const team = (id: string) => players.find((entry) => entry.playerId === id)!.teamName;

  return (
    <>
      <h3>打撃成績</h3>
      <div className="world-table">
        <table>
          <thead>
            <tr>
              <th>球団</th>
              <th>選手</th>
              <th>打席</th>
              <th>打数</th>
              <th>安打</th>
              <th>二塁打</th>
              <th>三塁打</th>
              <th>本塁打</th>
              <th>得点</th>
              <th>打点</th>
              <th>四球</th>
              <th>死球</th>
              <th>三振</th>
              <th>犠飛</th>
              <th>併殺打</th>
              <th>打率</th>
            </tr>
          </thead>
          <tbody>
            {lines.batting.map((row) => (
              <tr key={row.playerId}>
                <td>{team(row.playerId)}</td>
                <th>{player(row.playerId)}</th>
                <td>{row.plateAppearances}</td>
                <td>{row.atBats}</td>
                <td>{row.hits}</td>
                <td>{row.doubles}</td>
                <td>{row.triples}</td>
                <td>{row.homeRuns}</td>
                <td>{row.runs}</td>
                <td>{row.runsBattedIn}</td>
                <td>{row.walks}</td>
                <td>{row.hitByPitch}</td>
                <td>{row.strikeouts}</td>
                <td>{row.sacrificeFlies ?? '-'}</td>
                <td>{row.groundedIntoDoublePlays ?? '-'}</td>
                <td>{battingAverage(row.hits, row.atBats)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>投手成績</h3>
      <div className="world-table">
        <table>
          <thead>
            <tr>
              <th>球団</th>
              <th>選手</th>
              <th>投球回</th>
              <th>投球数</th>
              <th>対戦打者</th>
              <th>被安打</th>
              <th>被本塁打</th>
              <th>奪三振</th>
              <th>四球</th>
              <th>死球</th>
              <th>失点</th>
              <th>自責点</th>
              <th>防御率</th>
            </tr>
          </thead>
          <tbody>
            {lines.pitching.map((row) => (
              <tr key={row.playerId}>
                <td>{team(row.playerId)}</td>
                <th>{player(row.playerId)}</th>
                <td>{inningsPitched(row.outsRecorded)}</td>
                <td>{row.pitches}</td>
                <td>{row.battersFaced}</td>
                <td>{row.hitsAllowed}</td>
                <td>{row.homeRunsAllowed}</td>
                <td>{row.strikeouts}</td>
                <td>{row.walks}</td>
                <td>{row.hitBatters}</td>
                <td>{row.runsAllowed}</td>
                <td>{row.earnedRuns}</td>
                <td>{earnedRunAverage(row.earnedRuns, row.outsRecorded)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>守備成績</h3>
      <div className="world-table">
        <table>
          <thead>
            <tr>
              <th>球団</th>
              <th>選手</th>
              <th>位置</th>
              <th>出場試合</th>
              <th>守備回</th>
              <th>刺殺</th>
              <th>補殺</th>
              <th>併殺関与</th>
              <th>失策</th>
            </tr>
          </thead>
          <tbody>
            {lines.fielding?.map((row) => (
              <tr key={row.playerId + ':' + row.position}>
                <td>{team(row.playerId)}</td>
                <th>{player(row.playerId)}</th>
                <td>{row.position}</td>
                <td>{row.gamesAtPosition}</td>
                <td>{inningsPitched(row.fieldingOuts)}</td>
                <td>{row.putouts}</td>
                <td>{row.assists}</td>
                <td>{row.doublePlayParticipations}</td>
                <td>{row.errors ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
