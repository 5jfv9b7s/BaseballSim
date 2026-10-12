import { useState } from 'react';
import type { WorldView } from '../world/controller.ts';
import './player-details.css';

export function PlayerDirectory({
  view,
  onSelect,
}: {
  view: WorldView;
  onSelect: (id: string) => void;
}) {
  const [club, setClub] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [role, setRole] = useState('all');
  const [order, setOrder] = useState('name');
  const squad =
    view.definitions.squads.find((s) => s.squadId === club) ??
    view.definitions.squads.find((s) => s.squadId === view.management?.controlledSquadId) ??
    view.definitions.squads[0]!;
  const normalize = (value: string) =>
    value.normalize('NFKC').replace(/\s/g, '').toLocaleLowerCase('ja');
  const statusOf = (id: string) => view.playerStatuses?.find((row) => row.playerId === id);
  const isPitcher = (id: string) => squad.pitches.some((pitch) => pitch.playerId === id);
  const players = squad.players
    .filter((player) => {
      const state = statusOf(player.playerId);
      return (
        normalize(player.familyName + player.givenName).includes(normalize(search)) &&
        (category === 'all' || state?.registration === category) &&
        (role === 'all' || isPitcher(player.playerId) === (role === 'pitcher'))
      );
    })
    .sort((a, b) =>
      order === 'name'
        ? (a.familyName + a.givenName).localeCompare(b.familyName + b.givenName, 'ja')
        : a.playerId.localeCompare(b.playerId),
    );

  return (
    <section className="panel" aria-label="選手一覧">
      <h3>選手一覧</h3>
      <div className="world-controls">
        <label>
          選手の球団
          <select value={squad.squadId} onChange={(event) => setClub(event.target.value)}>
            {view.definitions.squads.map((item) => (
              <option key={item.squadId} value={item.squadId}>
                {item.team.name}
                {item.squadId === view.management?.controlledSquadId ? '（担当球団）' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          名前で検索
          <input value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <label>
          登録区分
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">一軍・二軍すべて</option>
            <option value="first">一軍</option>
            <option value="farm">二軍</option>
          </select>
        </label>
        <label>
          選手の種類
          <select value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="all">すべて</option>
            <option value="pitcher">投手</option>
            <option value="fielder">野手</option>
          </select>
        </label>
        <label>
          選手の並び順
          <select value={order} onChange={(event) => setOrder(event.target.value)}>
            <option value="name">氏名順</option>
            <option value="id">選手ID順</option>
          </select>
        </label>
      </div>
      <p>
        {view.currentDate}現在 ／ {squad.team.name} ／ {players.length}名表示（所属
        {squad.players.length}名）
      </p>
      <p className="hint">
        名前を選ぶと詳細を開きます。投手は持ち球のある選手で分類しています。背番号・年齢・守備適性は未実装です。
      </p>
      <div className="player-grid">
        {players.map((player) => (
          <div key={player.playerId}>
            <button className="player-link" onClick={() => onSelect(player.playerId)}>
              {player.familyName} {player.givenName}
            </button>
            <small>
              {isPitcher(player.playerId) ? '投手' : '野手'} ／{' '}
              {statusOf(player.playerId)?.registration === 'first'
                ? '一軍'
                : statusOf(player.playerId)?.registration === 'farm'
                  ? '二軍'
                  : '登録記録なし'}
            </small>
          </div>
        ))}
      </div>
      {players.length === 0 && <p>条件に合う選手がいません。</p>}
    </section>
  );
}
