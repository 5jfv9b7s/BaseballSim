import { useEffect, useState } from 'react';
import type { WorldAction, WorldView } from '../world/controller.ts';
import type { IndividualRest, RestRules, RestSnapshot } from '../world/rest-types.ts';

function RulesEditor({
  value,
  onChange,
  disabled,
  label,
}: {
  value: RestRules;
  onChange: (rules: RestRules) => void;
  disabled: boolean;
  label: string;
}) {
  const fields = [
    ['consecutiveDays', '連投日数以上', 1, 14, 1],
    ['recentPitches', '直近の投球数以上', 1, 3000, 1],
    ['previousDayInnings', '前日の登板イニング数以上', 2, 12, 1],
    ['energyMilli', '体力以下', 0, 100, 1000],
    ['fatigueMilli', '疲労以上', 0, 100, 1000],
  ] as const;
  return (
    <fieldset className="rest-rules" disabled={disabled} aria-label={label}>
      <legend>{label}</legend>
      <label>
        条件に当てはまる投手の扱い{' '}
        <select
          value={value.action}
          onChange={(e) => onChange({ ...value, action: e.target.value as RestRules['action'] })}
        >
          <option value="none">自動休養なし</option>
          <option value="preferRest">ベンチ入り・休養優先</option>
          <option value="benchRest">ベンチ外を希望</option>
        </select>
      </label>
      <label>
        直近球数の対象日数{' '}
        <input
          type="number"
          min={1}
          max={14}
          step={1}
          value={value.recentDays}
          onChange={(e) => onChange({ ...value, recentDays: Number(e.target.value) })}
        />
      </label>
      {fields.map(([key, name, min, max, divisor]) => (
        <label key={key}>
          {name}{' '}
          <input
            type="number"
            min={min}
            max={max}
            step={divisor === 1000 ? 0.001 : 1}
            value={value[key] === null ? '' : value[key] / divisor}
            onChange={(e) =>
              onChange({
                ...value,
                [key]: e.target.value === '' ? null : Math.round(Number(e.target.value) * divisor),
              })
            }
          />
        </label>
      ))}
    </fieldset>
  );
}

function RestPreview({
  snapshot,
  view,
  label,
}: {
  snapshot: RestSnapshot | undefined;
  view: WorldView;
  label: string;
}) {
  const names = new Map(
    view.definitions.squads.flatMap((s) =>
      s.players.map((p) => [p.playerId, p.familyName + ' ' + p.givenName] as const),
    ),
  );
  const outcomes = {
    starter: '先発',
    relief: '通常救援',
    preferRest: 'ベンチ内・休養優先',
    benchRest: 'ベンチ外',
    notSelected: '起用枠外',
  };
  return (
    <section aria-label={label}>
      <h3>{label}</h3>
      {!snapshot ? (
        <p>担当チームは今日は試合がありません。</p>
      ) : (
        <div className="world-table" tabIndex={0} aria-label={label + '一覧'}>
          <table>
            <thead>
              <tr>
                <th>投手</th>
                <th>扱い</th>
                <th>理由・手動指定</th>
                <th>前回登板</th>
                <th>中何日</th>
                <th>連投</th>
                <th>直近球数</th>
                <th>前日イニング</th>
                <th>試合前体力／疲労</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.decisions.map((row) => (
                <tr key={row.playerId} data-testid={'rest-' + row.playerId}>
                  <th scope="row">{names.get(row.playerId)}</th>
                  <td>{outcomes[row.outcome]}</td>
                  <td>
                    {[...row.reasons, row.exception].filter(Boolean).join('・') || '休養条件なし'}
                  </td>
                  <td>{row.metrics.lastPitchedOn ?? '登板なし'}</td>
                  <td>{row.metrics.restDays ?? '—'}</td>
                  <td>{row.metrics.consecutiveDays}日</td>
                  <td>
                    {row.metrics.recentPitches}球／{row.metrics.recentDays}日
                  </td>
                  <td>{row.metrics.previousDayInnings}</td>
                  <td>
                    {(row.metrics.energyMilli / 1000).toFixed(1)}／
                    {(row.metrics.fatigueMilli / 1000).toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function RestPolicyEditor({
  view,
  disabled,
  send,
}: {
  view: WorldView;
  disabled: boolean;
  send: (action: WorldAction) => void;
}) {
  const saved = view.restPolicy!;
  const squadId = view.management!.controlledSquadId;
  const squad = view.definitions.squads.find((s) => s.squadId === squadId)!;
  const [rules, setRules] = useState(saved.teamRestPolicy);
  const [individual, setIndividual] = useState<IndividualRest[]>(saved.individualRest);
  const [selected, setSelected] = useState(squad.team.pitcherIds[0]!);
  const savedKey = JSON.stringify(saved);
  useEffect(() => {
    setRules(saved.teamRestPolicy);
    setIndividual(saved.individualRest);
  }, [savedKey]);
  const entry = individual.find((row) => row.playerId === selected) ?? {
    playerId: selected,
    mode: 'inherit' as const,
  };
  const setEntry = (value: IndividualRest) =>
    setIndividual([...individual.filter((row) => row.playerId !== selected), value]);
  const locked = disabled || !view.canEditManagement;
  const changed =
    JSON.stringify([rules, individual]) !==
    JSON.stringify([saved.teamRestPolicy, saved.individualRest]);
  return (
    <section className="panel" aria-label="投手の休養方針">
      <h2>投手の休養方針</h2>
      <p className="hint">
        試合前に休養条件を判定します。ベンチ内の休養優先投手は通常救援の後に回し、必要なら登板します。ベンチ外の投手は登板しません。
      </p>
      <details>
        <summary>休養条件と今日の起用を確認・編集</summary>
        <p className="hint">
          いずれかの条件に当てはまると休養を優先します。空欄の条件は使いません。数値は未校正の運用目安です。今日の実績は次戦へ反映し、開始済みの名簿は変えません。
        </p>
        <RulesEditor value={rules} onChange={setRules} disabled={locked} label="一軍の既定条件" />
        <label>
          個別設定する投手{' '}
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            {squad.team.pitcherIds.map((id) => {
              const p = squad.players.find((p) => p.playerId === id)!;
              return (
                <option value={id} key={id}>
                  {p.familyName} {p.givenName}
                </option>
              );
            })}
          </select>
        </label>
        <label>
          個別条件の使い方{' '}
          <select
            disabled={locked}
            value={entry.mode}
            onChange={(e) =>
              setEntry(
                e.target.value === 'inherit'
                  ? { playerId: selected, mode: 'inherit' }
                  : { playerId: selected, mode: 'custom', rules: structuredClone(rules) },
              )
            }
          >
            <option value="inherit">一軍の既定を継承</option>
            <option value="custom">この投手の条件を指定</option>
          </select>
        </label>
        {entry.mode === 'custom' && (
          <RulesEditor
            label="投手個別の条件"
            value={entry.rules}
            onChange={(value) => setEntry({ playerId: selected, mode: 'custom', rules: value })}
            disabled={locked}
          />
        )}
        <button
          disabled={locked || !changed}
          onClick={() =>
            send({
              kind: 'setRestPolicy',
              squadId,
              teamRestPolicy: rules,
              individualRest: individual,
            })
          }
        >
          休養方針を確定して保存
        </button>
        <p>保存済み方針版：{saved.policyRevision}。以下の起用は保存済みの設定に基づきます。</p>
        <p className="hint">
          当日の手動先発・ベンチ指定を優先します。先発候補が全員休養対象なら、試合成立のため1人の休養希望を保留して理由を表示します。登録・外国人枠の制限は守ります。二軍と他球団は保存された初期方針で自動運用します。
        </p>
        <RestPreview
          view={view}
          snapshot={view.registrationPreview?.roster.restSnapshot}
          label="今日の一軍投手"
        />
        <RestPreview
          view={view}
          snapshot={view.farm?.preview?.roster.restSnapshot}
          label="今日の二軍投手"
        />
      </details>
    </section>
  );
}
