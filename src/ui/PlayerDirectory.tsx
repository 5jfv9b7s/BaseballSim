import { playerProfile, playerAge } from '../world/player-profiles.ts';
import { PROFILE_POSITIONS } from '../world/player-profile-types.ts';
import { useMemo, useState } from 'react';
import { growthAbilityKey } from '../world/growth-basis.ts';
import { commonTrainingRef } from '../world/training.ts';
import { AbilityRating } from './visuals/AbilityRating.tsx';
import { clubStyle, ClubMark } from './visuals/BaseballVisuals.tsx';
import './player-directory.css';
import type { WorldView } from '../world/controller.ts';
import './player-details.css';

const contactKey = growthAbilityKey(commonTrainingRef('batting.contactVsRight'));
const powerKey = growthAbilityKey(commonTrainingRef('batting.powerVsRight'));
const conditionArrows: Record<string, string> = {
  絶不調: '↓↓',
  不調: '↓',
  普通: '→',
  好調: '↑',
  絶好調: '↑↑',
};

function StateMeter({ label, value }: { label: string; value?: number | null }) {
  return (
    <span className="player-card-meter" data-kind={label === '疲労' ? 'fatigue' : 'energy'}>
      <span>
        {label}
        <strong>{value == null ? '記録なし' : (value / 1000).toFixed(1)}</strong>
      </span>
      {value != null && (
        <meter min={0} max={100} value={value / 1000} aria-label={label}>
          {(value / 1000).toFixed(1)} / 100
        </meter>
      )}
    </span>
  );
}

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
  // 名前や状態をカードごと・ソート比較ごとに全名簿から探さない。
  const statusById = useMemo(
    () => new Map((view.playerStatuses ?? []).map((row) => [row.playerId, row])),
    [view.playerStatuses],
  );
  const entries = useMemo(() => {
    const pitchesByPlayer = new Map<string, typeof squad.pitches>();
    for (const pitch of squad.pitches) {
      const pitches = pitchesByPlayer.get(pitch.playerId) ?? [];
      pitches.push(pitch);
      pitchesByPlayer.set(pitch.playerId, pitches);
    }
    return squad.players.map((player) => {
      const profile = playerProfile(view.definitions, player.playerId);
      const name = profile?.displayName ?? player.familyName + ' ' + player.givenName;
      const pitches = pitchesByPlayer.get(player.playerId) ?? [];
      const learned = pitches.filter(
        (pitch) =>
          (view.growth?.pitchLearning?.acquisition[pitch.pitchId]?.progressMilli ??
            pitch.acquisitionProgressMilli) === 100000,
      );
      const current = view.growth?.current[player.playerId];
      return {
        player,
        profile,
        name,
        searchName: normalize(name),
        age: profile ? playerAge(profile.birthDate, view.currentDate) : null,
        isPitcher: pitches.length > 0,
        maxVelocity: learned.length
          ? Math.max(...learned.map((pitch) => pitch.velocity.maxCentiKph))
          : null,
        learnedCount: learned.length,
        contact: current?.[contactKey] ?? player.batting.contactVsRight.valueMilli,
        power: current?.[powerKey] ?? player.powerVsRight.valueMilli,
      };
    });
  }, [squad, view.definitions, view.growth, view.currentDate]);
  const query = normalize(search);
  const players = entries
    .filter((entry) => {
      const status = statusById.get(entry.player.playerId);
      return (
        entry.searchName.includes(query) &&
        (category === 'all' || status?.registration === category) &&
        (role === 'all' || entry.isPitcher === (role === 'pitcher')) &&
        (position === 'all' ||
          (position === 'unknown' ? !entry.profile : entry.profile?.primaryPosition === position))
      );
    })
    .sort((a, b) => {
      const tie = a.player.playerId.localeCompare(b.player.playerId);
      if (order === 'name') return a.name.localeCompare(b.name, 'ja') || tie;
      if (order === 'ageAsc' || order === 'ageDesc') {
        if (a.age === null) return b.age === null ? tie : 1;
        if (b.age === null) return -1;
        return (order === 'ageAsc' ? a.age - b.age : b.age - a.age) || tie;
      }
      return tie;
    });

  return (
    <section className="panel player-directory" aria-label="選手一覧">
      <header className="player-directory-heading">
        <ClubMark clubId={squad.team.clubId} small />
        <div>
          <h3>選手一覧</h3>
          <p>
            <span>{squad.team.name}</span>
            <span>
              <time dateTime={view.currentDate}>{view.currentDate}</time>現在
            </span>
          </p>
        </div>
        <span className="player-directory-count">
          <strong>{players.length}</strong> / {squad.players.length}名
        </span>
      </header>
      <div className="player-directory-filters">
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
      <p className="player-directory-summary" aria-live="polite">
        {players.length}名表示（所属{squad.players.length}名）
      </p>
      <ul className="player-card-grid" aria-label="選手プロフィール一覧">
        {players.map((entry) => {
          const { player, profile, name, age, isPitcher } = entry;
          const status = statusById.get(player.playerId);
          const registration =
            status?.registration === 'first'
              ? '一軍'
              : status?.registration === 'farm'
                ? '二軍'
                : '登録記録なし';
          return (
            <li key={player.playerId}>
              <article
                className="player-card"
                style={clubStyle(squad.team.clubId)}
                data-player-id={player.playerId}
                data-age={age ?? ''}
              >
                <div className="player-card-top">
                  <span>{isPitcher ? '投手' : '野手'}</span>
                  <span className="player-card-registration" data-category={status?.registration}>
                    {registration}
                  </span>
                </div>
                <div className="player-card-identity">
                  <span
                    className="player-card-position"
                    aria-label={
                      profile ? `代表守備位置 ${profile.primaryPosition}` : '代表守備位置 記録なし'
                    }
                    title={profile ? '代表守備位置' : '代表守備位置の記録なし'}
                  >
                    {profile?.primaryPosition ?? '—'}
                  </span>
                  <div>
                    <button
                      className="player-link player-card-open"
                      onClick={() => onSelect(player.playerId)}
                    >
                      {name}
                    </button>
                    <p className="player-card-profile">
                      {age === null ? '年齢記録なし' : `${age}歳`}
                      <span aria-hidden="true"> ／ </span>
                      {player.throwingHand === 'R' ? '右' : '左'}投
                      {player.battingHand === 'R' ? '右' : player.battingHand === 'L' ? '左' : '両'}
                      打
                    </p>
                  </div>
                </div>
                <div className="player-card-abilities">
                  {isPitcher ? (
                    <>
                      <div>
                        <span>MAX球速（設定）</span>
                        <strong>
                          {entry.maxVelocity === null ? (
                            '記録なし'
                          ) : (
                            <>
                              {(entry.maxVelocity / 100).toFixed(1)}
                              <small> km/h</small>
                            </>
                          )}
                        </strong>
                      </div>
                      <div>
                        <span>習得球種</span>
                        <strong>
                          {entry.learnedCount}
                          <small> 種</small>
                        </strong>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <span>対右ミート</span>
                        <AbilityRating valueMilli={entry.contact} label={`${name}の対右ミート`} />
                      </div>
                      <div>
                        <span>対右パワー</span>
                        <AbilityRating valueMilli={entry.power} label={`${name}の対右パワー`} />
                      </div>
                    </>
                  )}
                </div>
                <div className="player-card-state">
                  <span className="player-card-condition">
                    <span>調子</span>
                    <strong>
                      <span aria-hidden="true">
                        {conditionArrows[status?.condition ?? ''] ?? '—'}{' '}
                      </span>
                      {status?.condition ?? '記録なし'}
                    </strong>
                  </span>
                  <StateMeter label="体力" value={status?.energyMilli} />
                  <StateMeter label="疲労" value={status?.fatigueMilli} />
                </div>
                <span className="player-card-action" aria-hidden="true">
                  選手詳細を見る →
                </span>
              </article>
            </li>
          );
        })}
      </ul>
      <details className="player-directory-guide">
        <summary>表示項目について</summary>
        <p className="hint">
          能力は現在の基本値です。年齢はゲーム内日付の満年齢、代表位置は守備適性とは別です。投手は持ち球で分類し、MAX球速は習得済み球種の設定値です。守備適性と全能力は選手詳細で確認できます。背番号は工事中です。
        </p>
      </details>
      {players.length === 0 && <p>条件に合う選手がいません。</p>}
    </section>
  );
}
