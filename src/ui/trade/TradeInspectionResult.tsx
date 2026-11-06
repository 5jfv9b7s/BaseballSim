import type { TradeInspectionReport } from '../../recruitment/trade-inspection-types.ts';
import type { WorldView } from '../../world/controller.ts';
import { tradePlayerName } from './trade-preview.ts';

const preferences = { firstFixed: '一軍固定', farmFixed: '二軍固定', auto: 'おまかせ' };

export function TradeInspectionResult({
  view,
  report,
}: {
  view: WorldView;
  report: TradeInspectionReport;
}) {
  const clubName = (clubId: string) =>
    view.definitions.squads.find((s) => s.team.clubId === clubId)?.team.name ?? clubId;
  return (
    <section className="trade-inspection" aria-label="成立条件の確認結果">
      <h4>確定には準備が必要です</h4>
      <p>{report.currentDate}現在の記録を確認しました。</p>
      <ul>
        {report.blockers.map((b, index) => (
          <li key={index}>
            {b.playerId && `${tradePlayerName(view, b.playerId)}：`}
            {b.message}
          </li>
        ))}
      </ul>
      {report.counts && (
        <dl className="trade-finance">
          {report.counts.map((c) => (
            <div key={c.clubId}>
              <dt>{clubName(c.clubId)}の所属人数</dt>
              <dd>
                {c.before} → {c.after}人
              </dd>
            </div>
          ))}
        </dl>
      )}
      {report.players.length > 0 && (
        <>
          <h5>選手ごとの登録と編成への影響</h5>
          <ul className="trade-impact-list">
            {report.players.map((p) => (
              <li key={p.playerId}>
                <strong>{tradePlayerName(view, p.playerId)}</strong>
                <p>
                  {clubName(p.fromClubId)} → {clubName(p.toClubId)}
                </p>
                <p>
                  現在の登録：
                  {p.registration
                    ? p.registration.category === 'first'
                      ? '一軍'
                      : '二軍'
                    : '記録なし'}
                  {' ／ 固定希望：'}
                  {p.preference ? preferences[p.preference] : '記録なし'}
                  {p.registration?.nextFirstEligibleOn &&
                    ` ／ 一軍再登録可能日：${p.registration.nextFirstEligibleOn}`}
                </p>
                {p.roles.length ? (
                  <ul>
                    {p.roles.map((r) => (
                      <li key={r.squadId}>
                        {r.squadName}：
                        {[
                          r.battingSlots.length ? `${r.battingSlots.join('・')}番の補充` : '',
                          r.positions.length ? `守備${r.positions.join('・')}の補充` : '',
                          r.rotationSlots.length ? `先発枠${r.rotationSlots.join('・')}の補充` : '',
                          r.relief ? '通常救援から解除' : '',
                        ]
                          .filter(Boolean)
                          .join(' ／ ')}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>打順・守備・先発・通常救援への指定なし</p>
                )}
                {p.futureGameIds.length > 0 && (
                  <p>未開始試合の指定あり：{p.futureGameIds.length}試合（成立時に再検査が必要）</p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
