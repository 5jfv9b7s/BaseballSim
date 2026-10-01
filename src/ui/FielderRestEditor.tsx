import { useEffect, useState } from 'react';
import type { WorldAction, WorldView } from '../world/controller.ts';
import type { FielderRestSnapshot } from '../world/fielder-rest-types.ts';

function Preview({
  view,
  snapshot,
  label,
}: {
  view: WorldView;
  snapshot?: FielderRestSnapshot;
  label: string;
}) {
  const names = new Map(
    view.definitions.squads.flatMap((s) =>
      s.players.map((p) => [p.playerId, p.familyName + ' ' + p.givenName] as const),
    ),
  );
  const labels = {
    starting: 'スタメン',
    resting: '休養・ベンチ内',
    reserve: '控え',
    outsideBench: 'ベンチ外',
  };
  return (
    <section aria-label={label}>
      <h3>{label}</h3>
      {!snapshot ? (
        <p>担当チームは今日は試合がありません。</p>
      ) : (
        <>
          <p>{snapshot.date}の試合前の状態で判定。開始後の名簿と判定は固定します。</p>
          <div className="world-table" tabIndex={0} aria-label={label + '一覧'}>
            <table>
              <thead>
                <tr>
                  <th>野手</th>
                  <th>当日の扱い</th>
                  <th>代役</th>
                  <th>理由</th>
                  <th>試合前体力／疲労</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.decisions.map((row) => (
                  <tr key={row.playerId} data-testid={'fielder-rest-' + row.playerId}>
                    <th scope="row">{names.get(row.playerId)}</th>
                    <td data-testid="outcome">{labels[row.outcome]}</td>
                    <td>{row.replacementId ? names.get(row.replacementId) : '—'}</td>
                    <td>
                      {[...row.reasons, row.exception].filter(Boolean).join('・') || '休養条件なし'}
                    </td>
                    <td data-testid="state">
                      {(row.energyMilli / 1000).toFixed(1)} ／{' '}
                      {(row.fatigueMilli / 1000).toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

export function FielderRestEditor({
  view,
  disabled,
  send,
}: {
  view: WorldView;
  disabled: boolean;
  send: (action: WorldAction) => void;
}) {
  const saved = view.fielderRestPolicy!;
  const [rules, setRules] = useState(saved.rules);
  const savedKey = JSON.stringify(saved);
  useEffect(() => {
    setRules(saved.rules);
  }, [savedKey]);
  const locked = disabled || !view.canEditManagement;
  const changed = JSON.stringify(rules) !== JSON.stringify(saved.rules);
  return (
    <section className="panel" aria-label="野手の休養方針">
      <h2>野手の休養方針</h2>
      <p className="hint">
        体力・疲労の条件に当てはまる野手を、当日だけ控えと入れ替えます。理想オーダーと一軍登録は保持します。
      </p>
      <details>
        <summary>野手の休養条件と当日オーダーを確認・編集</summary>
        <fieldset className="rest-rules" disabled={locked} aria-label="一軍野手の休養条件">
          <legend>一軍野手の休養条件</legend>
          <label>
            野手の自動休養{' '}
            <select
              value={rules.enabled ? 'on' : 'off'}
              onChange={(e) => setRules({ ...rules, enabled: e.target.value === 'on' })}
            >
              <option value="on">有効</option>
              <option value="off">無効</option>
            </select>
          </label>
          {(
            [
              ['energyMilli', '野手の体力以下'],
              ['fatigueMilli', '野手の疲労以上'],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}{' '}
              <input
                type="number"
                min={0}
                max={100}
                step={0.001}
                value={rules[key] === null ? '' : rules[key] / 1000}
                onChange={(e) =>
                  setRules({
                    ...rules,
                    [key]: e.target.value === '' ? null : Math.round(Number(e.target.value) * 1000),
                  })
                }
              />
            </label>
          ))}
        </fieldset>
        <p className="hint">
          どちらかの条件で休養対象になります。空欄の条件は使いません。閾値は未校正の試作です。
        </p>
        <button
          disabled={locked || !changed}
          onClick={() =>
            send({
              kind: 'setFielderRestPolicy',
              squadId: view.management!.controlledSquadId,
              rules,
            })
          }
        >
          野手の休養方針を確定して保存
        </button>
        <p>保存済み方針版：{saved.policyRevision}。下の判定は保存済み設定によります。</p>
        <p className="hint">
          手動の当日オーダーを優先します。代役はベンチ内で休養条件に該当しない控えを所属名簿順で選び、打順と守備位置を引き継ぎます。代役不足なら起用を維持して理由を表示します。守備適性・育成方針の総合評価は未対応です。二軍と他球団は初期設定で運用します。
        </p>
        <Preview
          view={view}
          snapshot={view.registrationPreview?.roster.fielderRestSnapshot}
          label="今日の一軍野手"
        />
        <Preview
          view={view}
          snapshot={view.farm?.preview?.roster.fielderRestSnapshot}
          label="今日の二軍野手"
        />
      </details>
    </section>
  );
}
