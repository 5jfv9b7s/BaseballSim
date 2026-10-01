import { useState } from 'react';
import type { WorldView } from '../world/controller.ts';
const points = (n: number) => (n / 1000).toFixed(3);
const percent = (n: number) => (n / 10).toFixed(1);

export function PerformanceRoster({ view }: { view: WorldView }) {
  const [period, setPeriod] = useState<'today' | 'previous'>('today');
  const [teamId, setTeamId] = useState('');
  const [playerId, setPlayerId] = useState('');
  const teams = view.performance![period];
  const team = teams.find((t) => t.squadId === teamId) ?? teams[0];
  const player = team?.players.find((p) => p.playerId === playerId) ?? team?.players[0];
  return (
    <section className="panel" aria-label="試合時の能力">
      <h2>試合時の能力</h2>
      <p className="hint">
        試合開始時の調子・体力・疲労から一時的な実効値を計算します。基本能力と成長上限は変えません。係数は未校正の試作です。
      </p>
      <details>
        <summary>試合前の状態と能力補正を確認</summary>
        <label>
          補正を確認する日{' '}
          <select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)}>
            <option value="today">今日（{view.currentDate}）</option>
            <option value="previous" disabled={!view.lastCompletedDate}>
              前日（{view.lastCompletedDate ?? '未確定'}）
            </option>
          </select>
        </label>
        {!team ? (
          <p>対象日に担当球団の試合はありません。</p>
        ) : (
          <>
            <label>
              補正を確認するチーム{' '}
              <select value={team.squadId} onChange={(e) => setTeamId(e.target.value)}>
                {teams.map((t) => (
                  <option key={t.squadId} value={t.squadId}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <p data-testid="performance-status">
              {team.date}：
              {team.fixed ? '試合開始時の値で確定' : '試合前の見込み（編成変更で更新）'}
            </p>
            <label>
              補正を確認する選手{' '}
              <select value={player!.playerId} onChange={(e) => setPlayerId(e.target.value)}>
                {team.players.map((p) => (
                  <option key={p.playerId} value={p.playerId}>
                    {p.displayName}
                  </option>
                ))}
              </select>
            </label>
            <p data-testid="performance-state">
              試合前調子：{player!.conditionStage} ／ 体力：
              {(player!.energyMilli / 1000).toFixed(1)} ／ 疲労：
              {(player!.fatigueMilli / 1000).toFixed(1)}
            </p>
            <p className="hint">
              調子の寄与は中立50からの補正です。下表の増減を100%へ加えた後、倍率の上下限を適用します。現在の調子・体力が変わっても、開始した試合の値は変わりません。
            </p>
            <div className="world-table" tabIndex={0} aria-label="能力補正の理由">
              <table>
                <thead>
                  <tr>
                    <th>項目</th>
                    <th>調子</th>
                    <th>体力</th>
                    <th>疲労</th>
                    <th>実効倍率</th>
                  </tr>
                </thead>
                <tbody>
                  {player!.groups.map((g) => (
                    <tr key={g.group} data-testid={'factor-' + g.group}>
                      <th scope="row">{g.label}</th>
                      <td>
                        {g.conditionDelta > 0 ? '+' : ''}
                        {percent(g.conditionDelta)}%
                      </td>
                      <td>−{percent(g.energyPenalty)}%</td>
                      <td>−{percent(g.fatiguePenalty)}%</td>
                      <td>{percent(g.factorPermille)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="world-table" tabIndex={0} aria-label="基本能力と試合時の実効値">
              <table>
                <thead>
                  <tr>
                    <th>能力</th>
                    <th>基本能力</th>
                    <th>成長上限</th>
                    <th>試合時の実効値</th>
                  </tr>
                </thead>
                <tbody>
                  {player!.abilities.map((a) => (
                    <tr key={a.target} data-testid={'effective-' + a.target}>
                      <th scope="row">{a.label}</th>
                      <td data-testid="base">{points(a.baseMilli)}</td>
                      <td>{points(a.ceilingMilli)}</td>
                      <td data-testid="effective">{points(a.effectiveMilli)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <p className="hint">
          倍率は最終的な成功確率ではありません。左右の能力は別々に計算します。実効値は0〜120に収めますが、好調時は成長上限を超える場合があります。球速、試合中の追加消耗による再補正、怪我はこのモデルの対象外です。
        </p>
      </details>
    </section>
  );
}
