import { useEffect, useState } from 'react';
import { isFarmSquad } from '../world/squads.ts';
import type { WorldAction, WorldView } from '../world/controller.ts';
import { reliefRoles, type ReliefRole, type ReliefRoleRule } from '../game/relief-types.ts';
import { reliefRoleLabels, validateReliefRules } from '../game/relief.ts';

export function ReliefPolicyEditor({
  view,
  disabled,
  send,
}: {
  view: WorldView;
  disabled: boolean;
  send: (action: WorldAction) => void;
}) {
  const saved = view.relief!;
  const squadId = view.management!.controlledSquadId;
  const squad = view.definitions.squads.find((s) => s.squadId === squadId)!;
  const [rules, setRules] = useState(saved.reliefRoles);
  const [playerId, setPlayerId] = useState(squad.team.pitcherIds[1] ?? squad.team.pitcherIds[0]!);
  const savedKey = JSON.stringify([saved.policyRevision, saved.reliefRoles]);
  useEffect(() => {
    setRules(saved.reliefRoles);
  }, [savedKey]);
  const names = new Map(
    view.definitions.squads.flatMap((s) =>
      s.players.map((p) => [p.playerId, p.familyName + ' ' + p.givenName] as const),
    ),
  );
  const locked = disabled || !view.canEditManagement;
  const changed = JSON.stringify(rules) !== JSON.stringify(saved.reliefRoles);
  let invalid = '';
  try {
    validateReliefRules(rules, squad.team.pitcherIds);
  } catch (error) {
    invalid = error instanceof Error ? error.message : '設定を確認してください';
  }
  const update = (role: ReliefRole, next: ReliefRoleRule | null) =>
    setRules([
      ...rules.filter((r) => r.playerId !== playerId || r.role !== role),
      ...(next ? [next] : []),
    ]);
  return (
    <section className="panel" aria-label="救援の役割・登板条件">
      <h2>救援の役割・登板条件</h2>
      <p className="hint">
        球数基準に達した打席の区切りで、回・点差・得点状況に合う未登板投手を選びます。役割名による能力補正はありません。
      </p>
      <details>
        <summary>救援条件と登板判断を確認・編集</summary>
        <label>
          条件を編集する投手{' '}
          <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} disabled={locked}>
            {squad.team.pitcherIds.map((id) => (
              <option key={id} value={id}>
                {names.get(id)}
              </option>
            ))}
          </select>
        </label>
        <p className="hint">
          複数の役割は、いずれかの条件に合えば候補になります。抑え専任にする場合は通常救援を解除してください。ローテーション・ベンチの設定は「球団運営」で行い、候補外の投手はこの設定だけでは登板しません。
        </p>
        {reliefRoles.map((role) => {
          const entry = rules.find((r) => r.playerId === playerId && r.role === role);
          const label = reliefRoleLabels[role];
          return (
            <fieldset
              key={role}
              className="rest-rules"
              disabled={locked}
              aria-label={label + 'の登板条件'}
            >
              <legend>{label}</legend>
              <label>
                <input
                  type="checkbox"
                  checked={!!entry}
                  onChange={(e) =>
                    update(
                      role,
                      e.target.checked
                        ? {
                            playerId,
                            role,
                            priority: 1,
                            conditions: structuredClone(
                              view.definitions.reliefConfig!.templates[role],
                            ),
                          }
                        : null,
                    )
                  }
                />{' '}
                {label}を割り当てる
              </label>
              {entry && (
                <>
                  <label>
                    同役割内の優先順位{' '}
                    <input
                      type="number"
                      min={1}
                      max={99}
                      step={1}
                      value={entry.priority}
                      onChange={(e) => update(role, { ...entry, priority: Number(e.target.value) })}
                    />
                  </label>
                  {(
                    [
                      ['startInning', '開始回'],
                      ['endInning', '終了回'],
                      ['minScoreDifference', '点差の下限'],
                      ['maxScoreDifference', '点差の上限'],
                    ] as const
                  ).map(([key, title]) => (
                    <label key={key}>
                      {title}{' '}
                      <input
                        type="number"
                        min={key.endsWith('Inning') ? 1 : -999}
                        max={key.endsWith('Inning') ? 12 : 999}
                        step={1}
                        value={entry.conditions[key] ?? ''}
                        onChange={(e) =>
                          update(role, {
                            ...entry,
                            conditions: {
                              ...entry.conditions,
                              [key]:
                                e.target.value === '' && !key.endsWith('Inning')
                                  ? null
                                  : Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                  ))}
                  {(
                    [
                      ['lead', 'リード'],
                      ['tied', '同点'],
                      ['trailing', 'ビハインド'],
                    ] as const
                  ).map(([value, title]) => (
                    <label key={value}>
                      <input
                        type="checkbox"
                        checked={entry.conditions.scoreStates.includes(value)}
                        onChange={(e) =>
                          update(role, {
                            ...entry,
                            conditions: {
                              ...entry.conditions,
                              scoreStates: e.target.checked
                                ? [...entry.conditions.scoreStates, value]
                                : entry.conditions.scoreStates.filter((s) => s !== value),
                            },
                          })
                        }
                      />{' '}
                      {title}
                    </label>
                  ))}
                </>
              )}
            </fieldset>
          );
        })}
        <p className="hint">
          点差は自チーム得点−相手得点です。下限・上限の空欄は制限なし。同役割では小さい優先順位を優先します。試作の役割順：
          {view.definitions.reliefConfig!.roleOrder.map((r) => reliefRoleLabels[r]).join(' → ')}
          。休養優先投手はその後に回します。
        </p>
        {invalid && <p role="alert">{invalid}</p>}
        <button
          disabled={locked || !changed || !!invalid}
          onClick={() => send({ kind: 'setReliefPolicy', squadId, reliefRoles: rules })}
        >
          救援条件を確定して保存
        </button>
        <p>
          保存済み方針版：{saved.policyRevision}
          。試合開始後の方針と休養状態は固定します。二軍・他球団は開始時データの設定を使用します。
        </p>
        <h3>今日・前日の登板判断（新しい順、最大12件）</h3>
        {!saved.decisions.length ? (
          <p>まだ交代基準に達した場面はありません。</p>
        ) : (
          saved.decisions.map((row) => (
            <details key={row.gameId + ':' + row.eventSeq} data-testid="relief-decision">
              <summary>
                {row.date}・{isFarmSquad(view.definitions, row.squadId) ? '二軍' : '一軍'}・
                {row.decision.inning}
                回：{names.get(row.decision.outPlayerId)} →{' '}
                {row.decision.selectedId ? names.get(row.decision.selectedId) : '続投'}
              </summary>
              <p>
                点差 {row.decision.scoreDifference}：{row.decision.reason}
              </p>
              <ul>
                {row.decision.candidates.map((c) => (
                  <li key={c.playerId}>
                    {names.get(c.playerId)}：{c.reason}
                    {c.role ? ' ／ ' + reliefRoleLabels[c.role] + '・優先順位' + c.priority : ''}
                    {c.restPriority > 0 ? ' ／ 休養優先' : ''}
                  </li>
                ))}
              </ul>
            </details>
          ))
        )}
        <p className="hint">
          条件に合う候補がなければ続投します。未登板でもベンチ外の投手は起用しません。役割・ひな形は試作で、ブルペン準備・ワンポイント専用の交代・役割を契機とした早期交代は未対応です。
        </p>
      </details>
    </section>
  );
}
