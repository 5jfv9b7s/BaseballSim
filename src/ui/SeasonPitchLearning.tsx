import type { WorldView } from '../world/controller.ts';
import type { SeasonSummary } from '../world/types.ts';
import { pitchNames } from '../data/pitch-types/index.ts';

export function SeasonPitchLearning({
  view,
  summary,
  onSelectPlayer,
}: {
  view: WorldView;
  summary: SeasonSummary;
  onSelectPlayer: (id: string) => void;
}) {
  const learning = view.growth?.pitchLearning;
  if (!learning) return null;
  const rows = view.definitions.squads
    .flatMap((squad) =>
      squad.pitches.flatMap((pitch) => {
        const acquired = learning.acquisition[pitch.pitchId];
        if (!acquired?.acquiredOn || acquired.acquiredOn > summary.completedOn) return [];
        const player = squad.players.find((p) => p.playerId === pitch.playerId)!;
        return [
          {
            pitch,
            acquiredOn: acquired.acquiredOn,
            name: `${player.familyName} ${player.givenName}`,
            club: squad.team.name,
          },
        ];
      }),
    )
    .sort(
      (a, b) =>
        a.acquiredOn.localeCompare(b.acquiredOn) || a.pitch.pitchId.localeCompare(b.pitch.pitchId),
    );
  return (
    <section aria-label="今季の新球種習得">
      <h3>新球種の習得（{rows.length}球）</h3>
      <p className="hint">
        {summary.completedOn}
        までの確定分。投手の所属名簿を一度だけ数え、一軍・二軍を合算した能力成長とは別に表示します。
      </p>
      {!rows.length ? (
        <p>今季、この集計日までに新球種を習得した選手はいません。</p>
      ) : (
        <div className="world-table">
          <table aria-label="新球種の習得記録">
            <thead>
              <tr>
                <th>日付</th>
                <th>選手</th>
                <th>球団</th>
                <th>球種</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.pitch.pitchId}>
                  <td>{r.acquiredOn}</td>
                  <th>
                    <button
                      className="player-link"
                      onClick={() => onSelectPlayer(r.pitch.playerId)}
                    >
                      {r.name}
                    </button>
                  </th>
                  <td>{r.club}</td>
                  <td>{pitchNames[r.pitch.pitchTypeCode]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
