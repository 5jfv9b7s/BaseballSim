import { playerProfile, playerAge } from '../world/player-profiles.ts';
import { PROFILE_POSITIONS } from '../world/player-profile-types.ts';
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
  const [position, setPosition] = useState('all');
  const squad =
    view.definitions.squads.find((s) => s.squadId === club) ??
    view.definitions.squads.find((s) => s.squadId === view.management?.controlledSquadId) ??
    view.definitions.squads[0]!;
  const normalize = (value: string) =>
    value.normalize('NFKC').replace(/\s/g, '').toLocaleLowerCase('ja');
  const statusOf = (id: string) => view.playerStatuses?.find((row) => row.playerId === id);
  const isPitcher = (id: string) => squad.pitches.some((pitch) => pitch.playerId === id);
  const profileOf = (id: string) => playerProfile(view.definitions, id);
  const ageOf = (id: string) => {
    const p = profileOf(id);
    return p ? playerAge(p.birthDate, view.currentDate) : null;
  };
  const nameOf = (p: (typeof squad.players)[number]) =>
    profileOf(p.playerId)?.displayName ?? p.familyName + ' ' + p.givenName;
  const players = squad.players
    .filter((player) => {
      const state = statusOf(player.playerId);
      return (
        normalize(nameOf(player)).includes(normalize(search)) &&
        (category === 'all' || state?.registration === category) &&
        (role === 'all' || isPitcher(player.playerId) === (role === 'pitcher')) &&
        (position === 'all' ||
          (position === 'unknown'
            ? !profileOf(player.playerId)
            : profileOf(player.playerId)?.primaryPosition === position))
      );
    })
    .sort((a, b) => {
      const tie = a.playerId.localeCompare(b.playerId);
      if (order === 'name') return nameOf(a).localeCompare(nameOf(b), 'ja') || tie;
      if (order === 'ageAsc' || order === 'ageDesc') {
        const x = ageOf(a.playerId),
          y = ageOf(b.playerId);
        // 未記録を0歳にせず、どちらの順でも末尾へ置く。
        if (x === null) return y === null ? tie : 1;
        if (y === null) return -1;
        return (order === 'ageAsc' ? x - y : y - x) || tie;
      }
      return tie;
    });

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
          代表守備位置
          <select value={position} onChange={(event) => setPosition(event.target.value)}>
            <option value="all">すべて</option>
            {PROFILE_POSITIONS.map((p) => (
              <option value={p} key={p}>
                {p}
              </option>
            ))}
            <option value="unknown">記録なし</option>
          </select>
        </label>
        <label>
          選手の並び順
          <select value={order} onChange={(event) => setOrder(event.target.value)}>
            <option value="name">氏名順</option>
            <option value="id">選手ID順</option>
            <option value="ageAsc">年齢の低い順</option>
            <option value="ageDesc">年齢の高い順</option>
          </select>
        </label>
      </div>
      <p>
        {view.currentDate}現在 ／ {squad.team.name} ／ {players.length}名表示（所属
        {squad.players.length}名）
      </p>
      <p className="hint">
        名前を選ぶと詳細を開きます。年齢はゲーム内日付の満年齢、代表位置は守備適性とは別です。投手は持ち球で分類し、背番号・守備適性は工事中です。
      </p>
      <div className="world-table">
        <table aria-label="選手プロフィール一覧">
          <thead>
            <tr>
              <th>名前</th>
              <th>年齢</th>
              <th>代表位置</th>
              <th>投打</th>
              <th>登録</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => (
              <tr key={player.playerId}>
                <td>
                  <button className="player-link" onClick={() => onSelect(player.playerId)}>
                    {nameOf(player)}
                  </button>
                </td>
                <td>
                  {ageOf(player.playerId) === null ? '記録なし' : `${ageOf(player.playerId)}歳`}
                </td>
                <td>{profileOf(player.playerId)?.primaryPosition ?? '記録なし'}</td>
                <td>
                  {player.throwingHand === 'R' ? '右' : '左'}投
                  {player.battingHand === 'R' ? '右' : player.battingHand === 'L' ? '左' : '両'}打
                </td>
                <td>
                  {statusOf(player.playerId)?.registration === 'first'
                    ? '一軍'
                    : statusOf(player.playerId)?.registration === 'farm'
                      ? '二軍'
                      : '記録なし'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {players.length === 0 && <p>条件に合う選手がいません。</p>}
    </section>
  );
}
