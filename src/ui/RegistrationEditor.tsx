import { RosterPolicyEditor } from './RosterPolicyEditor.tsx';
import { useEffect, useState } from 'react';
import type { WorldAction, WorldView } from '../world/controller.ts';

/** 入力中の下書きのみ保持。資格検査・確定・保存はWorkerで行う。 */
export function RegistrationEditor({
  view,
  disabled,
  send,
}: {
  view: WorldView;
  disabled: boolean;
  send: (action: WorldAction) => void;
}) {
  const registration = view.registration!;
  const squadId = view.management!.controlledSquadId;
  const squad = view.definitions.squads.find((squad) => squad.squadId === squadId)!;
  const rules = view.definitions.registrationRules!;
  const rows = registration.registrations.filter(
    (entry) => entry.clubId === squad.team.clubId && entry.until === null,
  );
  const current = rows.filter((entry) => entry.category === 'first').map((entry) => entry.playerId);
  const preview = view.registrationPreview;
  const [first, setFirst] = useState(current);
  const [bench, setBench] = useState(preview?.roster.playerIds ?? []);
  const currentKey = JSON.stringify([
    current,
    view.currentDate,
    view.rosterPolicy?.policy.changeMode,
  ]);
  const benchKey = JSON.stringify([preview?.gameId, preview?.roster.playerIds]);
  useEffect(() => setFirst(current), [currentKey]);
  useEffect(() => setBench(preview?.roster.playerIds ?? []), [benchKey]);
  const locked = disabled || !view.canEditManagement;
  const automatic = view.rosterPolicy?.policy.changeMode === 'auto';
  const changed = squad.players.some(
    (player) => first.includes(player.playerId) !== current.includes(player.playerId),
  );
  const toggle = (ids: string[], id: string, checked: boolean) =>
    checked ? [...ids, id] : ids.filter((value) => value !== id);
  const foreignCount = (ids: string[]) =>
    ids.filter((id) =>
      squad.registrationInputs!.some(
        (entry) => entry.playerId === id && entry.foreignBaseStatus === 'subject',
      ),
    ).length;

  return (
    <section className="panel" aria-label="登録・ベンチ管理">
      <h2>登録・ベンチ管理</h2>
      <p>
        所属 {squad.players.length}/{rules.clubLimit}人 ／ 一軍 {current.length}/{rules.firstLimit}
        人 ／ 二軍 {squad.players.length - current.length}人
      </p>
      <p className="hint">
        手動で登録・抹消します。抹消後は{rules.reentryDays}
        日後から再登録できます。二軍の試合は未対応です。
      </p>
      {view.rosterPolicy && <RosterPolicyEditor view={view} disabled={disabled} send={send} />}
      {automatic && (
        <p className="hint">直接の登録変更は、入れ替え方針を手動に切り替えてから行ってください。</p>
      )}
      <details>
        <summary>一軍登録・当日のベンチを編集</summary>
        <p>
          登録案 {first.length}/{rules.firstLimit}人（外国人枠 {foreignCount(first)}/
          {rules.foreignFirstLimit}人）
        </p>
        {preview && (
          <p>
            ベンチ案 {bench.length}/{rules.benchLimit}人（外国人枠 {foreignCount(bench)}/
            {rules.foreignBenchLimit}人）
          </p>
        )}
        <p className="hint">
          一軍のチェックを外して確定すると抹消します。今日だけ休ませる場合はベンチのチェックを外してください。理想オーダーは保持し、必要な代役を当日だけ選びます。
        </p>
        <div className="world-table">
          <table>
            <thead>
              <tr>
                <th>選手</th>
                <th>現在</th>
                <th>再登録可能日</th>
                <th>一軍案</th>
                <th>今日のベンチ案</th>
                <th>出場</th>
              </tr>
            </thead>
            <tbody>
              {squad.players.map((player) => {
                const row = rows.find((entry) => entry.playerId === player.playerId)!;
                const name = player.familyName + ' ' + player.givenName;
                const waiting =
                  row.category === 'farm' &&
                  row.nextFirstEligibleOn !== null &&
                  row.nextFirstEligibleOn > view.currentDate;
                const participant = preview?.roster.participants.find(
                  (entry) => entry.playerId === player.playerId,
                );
                const subject =
                  squad.registrationInputs!.find((entry) => entry.playerId === player.playerId)!
                    .foreignBaseStatus === 'subject';
                return (
                  <tr key={player.playerId}>
                    <th scope="row">
                      {name}
                      {subject ? '（外国人枠）' : ''}
                    </th>
                    <td>{row.category === 'first' ? '一軍' : '二軍'}</td>
                    <td>{row.nextFirstEligibleOn ?? '—'}</td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${name}の一軍登録`}
                        checked={first.includes(player.playerId)}
                        disabled={locked || automatic || waiting}
                        onChange={(event) =>
                          setFirst(toggle(first, player.playerId, event.target.checked))
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${name}のベンチ入り`}
                        checked={bench.includes(player.playerId)}
                        disabled={locked || !preview || !current.includes(player.playerId)}
                        onChange={(event) =>
                          setBench(toggle(bench, player.playerId, event.target.checked))
                        }
                      />
                    </td>
                    <td>{participant?.appeared ? '出場' : participant ? '未出場' : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="world-controls">
          <button
            disabled={locked || automatic || !changed}
            onClick={() =>
              send({
                kind: 'setRegistrations',
                squadId,
                changes: squad.players
                  .filter(
                    (player) =>
                      first.includes(player.playerId) !== current.includes(player.playerId),
                  )
                  .map((player) => ({
                    playerId: player.playerId,
                    category: first.includes(player.playerId) ? 'first' : 'farm',
                  })),
              })
            }
          >
            登録変更を確定して保存
          </button>
          <button
            disabled={locked || !preview || changed}
            onClick={() =>
              send({ kind: 'setGameBench', squadId, gameId: preview!.gameId, playerIds: bench })
            }
          >
            今日のベンチを指定して保存
          </button>
          <button
            disabled={locked || !preview || !registration.benchOverrides[preview.gameId]}
            onClick={() =>
              send({ kind: 'setGameBench', squadId, gameId: preview!.gameId, playerIds: null })
            }
          >
            ベンチ指定を解除
          </button>
        </div>
        {changed && (
          <p className="hint">登録変更を先に確定してください。ベンチ案は登録後に設定できます。</p>
        )}
        {!preview && <p>担当球団の試合がない日です。登録変更はできます。</p>}
        {preview && (
          <p>
            今日のベンチ：{preview.roster.participants.map((entry) => entry.displayName).join('、')}
          </p>
        )}
      </details>
    </section>
  );
}
