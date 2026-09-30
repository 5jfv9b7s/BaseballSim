import { useEffect, useState } from 'react';
import type { WorldAction, WorldView } from '../world/controller.ts';
import type { RosterChangeMode, RosterPreference } from '../world/roster-policy-types.ts';

/** 下書きだけを保持し、設定と実登録の確定はWorkerへ依頼する。 */
export function RosterPolicyEditor({
  view,
  disabled,
  send,
}: {
  view: WorldView;
  disabled: boolean;
  send: (action: WorldAction) => void;
}) {
  const saved = view.rosterPolicy!;
  const squadId = view.management!.controlledSquadId;
  const squad = view.definitions.squads.find((squad) => squad.squadId === squadId)!;
  const [mode, setMode] = useState(saved.policy.changeMode);
  const [preferences, setPreferences] = useState(
    saved.preferences.map(({ playerId, preference }) => ({ playerId, preference })),
  );
  const savedKey = JSON.stringify([saved.policy, saved.preferences]);
  useEffect(() => {
    setMode(saved.policy.changeMode);
    setPreferences(saved.preferences.map(({ playerId, preference }) => ({ playerId, preference })));
  }, [savedKey]);
  const locked = disabled || !view.canEditManagement;
  const changed =
    mode !== saved.policy.changeMode ||
    preferences.some(
      (entry) =>
        saved.preferences.find((row) => row.playerId === entry.playerId)!.preference !==
        entry.preference,
    );

  return (
    <details>
      <summary>入れ替え方針・固定希望を編集</summary>
      <p className="hint">
        手動では希望を保存するだけで登録を変えません。自動は保存時と翌日の開始時に固定希望を反映します。
        おまかせの選手は現在の登録を維持する試作です。戦力・疲労による選別は未対応です。
      </p>
      <label>
        入れ替えモード{' '}
        <select
          aria-label="入れ替えモード"
          value={mode}
          disabled={locked}
          onChange={(event) => setMode(event.target.value as RosterChangeMode)}
        >
          <option value="manual">手動</option>
          <option value="auto">自動（固定希望のみ・試作）</option>
        </select>
      </label>
      <p>
        保存済み：{saved.policy.changeMode === 'manual' ? '手動' : '自動'} ／ 方針版{' '}
        {saved.policy.policyRevision}
      </p>
      <p data-testid="roster-policy-pending">
        保存済み希望と実登録の差：{saved.pending}人
        {saved.pending > 0 &&
          (saved.policy.changeMode === 'manual'
            ? '（手動のため自動変更しません）'
            : '（球団の変更一式を保留中）')}
        {saved.reason && `。反映できない理由：${saved.reason}`}
      </p>
      <div className="world-table">
        <table>
          <thead>
            <tr>
              <th>選手</th>
              <th>実登録</th>
              <th>固定希望案</th>
            </tr>
          </thead>
          <tbody>
            {squad.players.map((player) => {
              const name = player.familyName + ' ' + player.givenName;
              const entry = preferences.find((row) => row.playerId === player.playerId)!;
              const actual = view.registration!.registrations.find(
                (row) => row.playerId === player.playerId,
              )!;
              return (
                <tr key={player.playerId}>
                  <th scope="row">{name}</th>
                  <td>{actual.category === 'first' ? '一軍' : '二軍'}</td>
                  <td>
                    <select
                      aria-label={`${name}の固定希望`}
                      value={entry.preference}
                      disabled={locked}
                      onChange={(event) =>
                        setPreferences(
                          preferences.map((row) =>
                            row.playerId === player.playerId
                              ? { ...row, preference: event.target.value as RosterPreference }
                              : row,
                          ),
                        )
                      }
                    >
                      <option value="auto">おまかせ</option>
                      <option value="firstFixed">一軍固定</option>
                      <option value="farmFixed">二軍固定</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">
        一軍固定でも今日のベンチから外せます。再登録待ち・人数枠・当日指定に抵触すると、球団の変更一式を保留します。
        自動モードで希望の反映を再試行する場合も、このボタンを押してください。
      </p>
      <button
        disabled={
          locked || (!changed && !(saved.policy.changeMode === 'auto' && saved.pending > 0))
        }
        onClick={() => send({ kind: 'setRosterPolicy', squadId, changeMode: mode, preferences })}
      >
        方針・固定希望を保存
      </button>
    </details>
  );
}
