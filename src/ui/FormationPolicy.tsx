import { useState } from 'react';
import type { WorldView } from '../world/controller.ts';
import type { FormationDraft } from '../world/formation-draft.ts';
import { RulesEditor } from './RestPolicyEditor.tsx';

/** 起用方針も親の編集案だけを更新する。タブを離れても確定しない。 */
export function FormationPolicy({
  view,
  draft,
  locked,
  onChange,
}: {
  view: WorldView;
  draft: FormationDraft;
  locked: boolean;
  onChange: (draft: FormationDraft) => void;
}) {
  const squad = view.definitions.squads.find((s) => s.squadId === draft.squadId)!;
  const [selected, setSelected] = useState(squad.team.pitcherIds[0]!);
  const rest = draft.restPolicy;
  const entry = rest?.individualRest.find((r) => r.playerId === selected);
  const setEntry = (value: NonNullable<typeof entry>) => {
    if (!rest) return;
    onChange({
      ...draft,
      restPolicy: {
        ...rest,
        individualRest: entry
          ? rest.individualRest.map((r) => (r.playerId === selected ? value : r))
          : [...rest.individualRest, value],
      },
    });
  };
  return (
    <section aria-label="起用方針パネル">
      <h4>起用方針</h4>
      {draft.rosterPolicy ? (
        <>
          <label>
            一軍・二軍の管理
            <select
              aria-label="入れ替えモード"
              disabled={locked}
              value={draft.rosterPolicy.changeMode}
              onChange={(e) =>
                onChange({
                  ...draft,
                  rosterPolicy: {
                    ...draft.rosterPolicy!,
                    changeMode: e.target.value as 'manual' | 'auto',
                  },
                })
              }
            >
              <option value="manual">手動</option>
              <option value="auto">自動</option>
            </select>
          </label>
          <p>
            手動では通常の昇降格を自動実行しません。自動では一軍固定・二軍固定を退出時と翌日開始時に反映します。おまかせは現在の登録を維持する試作です。
          </p>
          <p>
            選手別の固定希望は、野手・投手オーダーの選択選手情報で変更できます。一軍固定はスタメン固定ではありません。
          </p>
        </>
      ) : (
        <p>この保存は登録方針に対応していません。</p>
      )}
      {rest ? (
        <>
          <RulesEditor
            label="一軍の既定条件"
            disabled={locked}
            value={rest.teamRestPolicy}
            onChange={(teamRestPolicy) =>
              onChange({ ...draft, restPolicy: { ...rest, teamRestPolicy } })
            }
          />
          <p className="hint">
            空欄の条件は使いません。いずれかの条件で休養を優先します。一律の登板禁止ではありません。数値は保存内の未校正設定です。
          </p>
          <label>
            個別設定する投手
            <select
              aria-label="個別設定する投手"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {squad.team.pitcherIds.map((id) => {
                const p = squad.players.find((p) => p.playerId === id)!;
                return (
                  <option key={id} value={id}>
                    {p.familyName} {p.givenName}
                  </option>
                );
              })}
            </select>
          </label>
          <label>
            個別条件の使い方
            <select
              disabled={locked}
              aria-label="個別条件の使い方"
              value={entry?.mode ?? 'inherit'}
              onChange={(e) =>
                setEntry(
                  e.target.value === 'inherit'
                    ? { playerId: selected, mode: 'inherit' }
                    : {
                        playerId: selected,
                        mode: 'custom',
                        rules: structuredClone(rest.teamRestPolicy),
                      },
                )
              }
            >
              <option value="inherit">一軍の既定を継承</option>
              <option value="custom">この投手の条件を指定</option>
            </select>
          </label>
          {entry?.mode === 'custom' && (
            <RulesEditor
              label="投手個別の条件"
              disabled={locked}
              value={entry.rules}
              onChange={(rules) => setEntry({ ...entry, rules })}
            />
          )}
        </>
      ) : (
        <p>この保存は投手休養設定に対応していません。</p>
      )}
      <fieldset disabled className="rest-rules">
        <legend>自動采配（工事中）</legend>
        {['代打', '代走', '守備固め', '継投', '盗塁', 'エンドラン', '送りバント', 'スクイズ'].map(
          (label) => (
            <label key={label}>
              {label}
              <select aria-label={label + 'の積極性'} defaultValue="">
                <option value="">工事中</option>
                <option>積極的</option>
                <option>普通</option>
                <option>消極的</option>
              </select>
            </label>
          ),
        )}
      </fieldset>
      <p className="hint">
        積極性の保存・試合への反映は未実装です。現在の自動試合モデルで進行します。
      </p>
    </section>
  );
}
