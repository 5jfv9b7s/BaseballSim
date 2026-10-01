import { useState } from 'react';
import type { WorldView } from '../world/controller.ts';
import { activityCounts } from '../world/physical.ts';
import type { ActivityKind } from '../world/physical-types.ts';

const points = (milli: number) => (milli / 1000).toFixed(1);
const labels: Record<ActivityKind, string> = {
  pitching: '投球（球）',
  batting: '打撃（対戦球）',
  fielding: '守備（配置球）',
  running: '走塁（塁）',
  preparation: '登板準備（回）',
};

/** 正本を変更せず、担当球団の現在値・実績・回復理由を表示する。 */
export function PhysicalRoster({ view }: { view: WorldView }) {
  const [period, setPeriod] = useState<'today' | 'previous'>('today');
  const rows = view.physical!;
  const adviceCount = rows.filter((row) => row.restReasons.length > 0).length;

  return (
    <section className="panel" aria-label="体力・疲労">
      <h2>体力・疲労</h2>
      <p>
        休養検討：{adviceCount}人 ／ 所属{rows.length}人
      </p>
      <p className="hint">
        体力は高いほど余力があり、疲労は高いほど蓄積しています（各0〜100）。
        休養の目安は試作値です。
        {view.performance
          ? '試合開始時の体力・疲労を一時的な能力補正へ使います。'
          : 'この保存では能力補正に使いません。'}
        {view.restPolicy
          ? '投手の自動起用には、別欄で保存した休養方針を使います。'
          : 'この保存では自動的な起用変更には使いません。'}
        休ませる場合は、試合前にオーダー・先発・ベンチを変更してください。
      </p>
      <details>
        <summary>全選手の体力・負荷を確認</summary>
        <label>
          負荷を表示する日
          <select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)}>
            <option value="today">今日（{view.currentDate}）</option>
            <option value="previous" disabled={!view.lastCompletedDate}>
              前日（{view.lastCompletedDate ?? '未確定'}）
            </option>
          </select>
        </label>
        <p className="hint">
          体力・疲労は現在値、負荷は選んだ日の実績です。守備は投手・DH以外の配置中の投球数、
          走塁は進んだ塁数とアウト時の進塁試行を数える試作です。
          登板準備は実際に投げた投手へ1試合1回。未登板の準備・練習負荷は未対応です。
        </p>
        <div className="world-table" tabIndex={0} aria-label="選手の身体状態一覧">
          <table>
            <thead>
              <tr>
                <th>選手</th>
                <th>登録</th>
                <th>体力</th>
                <th>疲労</th>
                <th>休養の目安</th>
                <th>基礎スタミナ</th>
                <th>回復能力</th>
                {Object.entries(labels).map(([kind, label]) => (
                  <th key={kind}>{label}</th>
                ))}
                <th>前日の回復（体力／疲労）</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const registration = view.registration?.registrations.find(
                  (p) => p.playerId === row.playerId,
                );
                const activity = period === 'today' ? row.activity : row.previousActivity;
                return (
                  <tr key={row.playerId} data-testid={'physical-' + row.playerId}>
                    <th scope="row">{row.displayName}</th>
                    <td>{registration?.category === 'first' ? '一軍' : '二軍'}</td>
                    <td data-testid="energy">{points(row.energyMilli)}</td>
                    <td data-testid="fatigue">{points(row.fatigueMilli)}</td>
                    <td>{row.restReasons.join('・') || '目安内'}</td>
                    <td>{points(row.physical.stamina.valueMilli)}</td>
                    <td>{points(row.physical.recovery.valueMilli)}</td>
                    {(Object.keys(labels) as ActivityKind[]).map((kind) => (
                      <td key={kind} data-testid={kind}>
                        {activityCounts(activity, kind)}
                      </td>
                    ))}
                    <td>
                      {row.recovery
                        ? `${row.recovery.rested ? '休養' : '活動後'} +${points(row.recovery.energyRecoveredMilli)} / −${points(row.recovery.fatigueRecoveredMilli)}`
                        : '未実施'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
