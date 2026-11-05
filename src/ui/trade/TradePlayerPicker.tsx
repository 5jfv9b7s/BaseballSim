import { useEffect, useRef, useState } from 'react';
import type { WorldView } from '../../world/controller.ts';
import { playerAge, playerProfile } from '../../world/player-profiles.ts';
import { PROFILE_POSITIONS } from '../../world/player-profile-types.ts';
import { PlayerDetails } from '../PlayerDetails.tsx';
import { tradePlayerName } from './trade-preview.ts';

export function TradePlayerPicker({
  view,
  squadId,
  excludedIds,
  currentId,
  label,
  onPick,
  onClose,
}: {
  view: WorldView;
  squadId: string;
  excludedIds: string[];
  currentId?: string;
  label: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [position, setPosition] = useState('all');
  const [registration, setRegistration] = useState('all');
  const [selected, setSelected] = useState(currentId ?? '');
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    searchInput.current?.focus();
    return () => element?.close();
  }, []);
  const squad = view.definitions.squads.find((s) => s.squadId === squadId);
  const normalize = (text: string) =>
    text.normalize('NFKC').replace(/\s/g, '').toLocaleLowerCase('ja');
  const candidates = (squad?.players ?? [])
    .filter((p) => {
      const profile = playerProfile(view.definitions, p.playerId);
      const pitcher = squad!.pitches.some((pitch) => pitch.playerId === p.playerId);
      const state = view.playerStatuses?.find((s) => s.playerId === p.playerId);
      return (
        (!excludedIds.includes(p.playerId) || p.playerId === currentId) &&
        normalize(tradePlayerName(view, p.playerId)).includes(normalize(search)) &&
        (role === 'all' || pitcher === (role === 'pitcher')) &&
        (position === 'all' || (profile?.primaryPosition ?? 'unknown') === position) &&
        (registration === 'all' || state?.registration === registration)
      );
    })
    .sort(
      (a, b) =>
        tradePlayerName(view, a.playerId).localeCompare(tradePlayerName(view, b.playerId), 'ja') ||
        a.playerId.localeCompare(b.playerId),
    );
  const active = candidates.find((p) => p.playerId === selected);
  return (
    <dialog
      className="trade-picker"
      ref={dialog}
      aria-label={`${label}を選択`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <h3>
          {label}を選択 — {squad?.team.name ?? '球団未取得'}
        </h3>
        <button onClick={onClose}>選手選択を閉じる</button>
      </header>
      <div className="trade-filters">
        <label>
          候補の名前で検索
          <input ref={searchInput} value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label>
          候補の種類
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="all">投手・野手</option>
            <option value="pitcher">投手（持ち球あり）</option>
            <option value="fielder">野手</option>
          </select>
        </label>
        <label>
          候補の主守備位置
          <select value={position} onChange={(e) => setPosition(e.target.value)}>
            <option value="all">すべて</option>
            {PROFILE_POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
            <option value="unknown">記録なし</option>
          </select>
        </label>
        <label>
          候補の登録区分
          <select value={registration} onChange={(e) => setRegistration(e.target.value)}>
            <option value="all">一軍・二軍</option>
            <option value="first">一軍</option>
            <option value="farm">二軍</option>
          </select>
        </label>
      </div>
      <p className="hint">
        選手名で能力・成績を確認し、「この選手を選ぶ」で枠へ入れます。選択済みの選手は重複表示しません。
      </p>
      <div className="trade-picker-columns">
        <section aria-label="トレード候補一覧">
          <p role="status">{candidates.length}名の候補</p>
          <div
            className="trade-candidates-scroll"
            tabIndex={0}
            role="region"
            aria-label="候補一覧のスクロール"
          >
            <table>
              <thead>
                <tr>
                  <th>名前</th>
                  <th>年齢</th>
                  <th>主位置</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((p) => {
                  const profile = playerProfile(view.definitions, p.playerId);
                  const age = profile ? playerAge(profile.birthDate, view.currentDate) : null;
                  return (
                    <tr key={p.playerId} data-player-id={p.playerId}>
                      <td>
                        <button
                          aria-pressed={active?.playerId === p.playerId}
                          onClick={() => setSelected(p.playerId)}
                        >
                          {tradePlayerName(view, p.playerId)}を比較
                        </button>
                      </td>
                      <td>{age === null ? '記録なし' : `${age}歳`}</td>
                      <td>{profile?.primaryPosition ?? '記録なし'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!candidates.length && <p>条件に合う選手がいません。条件を変更してください。</p>}
          </div>
        </section>
        <section className="trade-candidate-detail" aria-label="候補選手の比較情報">
          {active ? (
            <PlayerDetails
              key={active.playerId}
              view={view}
              playerId={active.playerId}
              inline
              onClose={() => {}}
            />
          ) : (
            <p>候補の選手名を選ぶと、比較情報を表示します。</p>
          )}
          <p className="hint">年俸・契約条件は記録なし（契約基盤は未実装）。</p>
        </section>
      </div>
      <footer>
        <button disabled={!active} onClick={() => active && onPick(active.playerId)}>
          この選手を選ぶ
        </button>
        <button className="secondary" onClick={onClose}>
          選ばずに戻る
        </button>
      </footer>
    </dialog>
  );
}
