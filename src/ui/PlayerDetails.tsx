import { playerProfile, playerAge, profileBirthplace } from '../world/player-profiles.ts';
import { BACKGROUND_NAMES } from '../world/player-profile-types.ts';
import { PitchCharacteristics } from './PitchCharacteristics.tsx';
import { useEffect, useId, useRef, useState } from 'react';
import type { WorldView } from '../world/controller.ts';
import type { Ability } from '../engine/types.ts';
import { pitchNames } from '../data/pitch-types/index.ts';
import { WorldStats } from './WorldStats.tsx';
import './player-details.css';

const points = (value: number) => (value / 1000).toFixed(3).replace(/\.?0+$/, '');
const statusPoints = (value: number | null | undefined) =>
  value == null ? '記録なし' : (value / 1000).toFixed(1);

/** 通常の選手詳細は現在値。試合結果の歴史表示とは分離する。 */
export function PlayerDetails({
  view,
  playerId,
  onClose,
  inline = false,
  registrationDraft,
}: {
  view: WorldView;
  playerId: string;
  onClose: () => void;
  inline?: boolean;
  registrationDraft?: 'first' | 'farm';
}) {
  const headingId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<'ability' | 'stats' | 'state' | 'contract'>('ability');
  const [scope, setScope] = useState<'firstRegular' | 'farmRegular'>('firstRegular');
  const squad = view.definitions.squads.find((item) =>
    item.players.some((player) => player.playerId === playerId),
  );
  const player = squad?.players.find((item) => item.playerId === playerId);

  const resolvedId = player?.playerId;

  function close() {
    dialog.current?.close();
    onClose();
  }

  useEffect(() => {
    if (inline) return;
    setTab('ability');
    setScope('firstRegular');
    if (playerId && resolvedId) dialog.current?.showModal();
    else dialog.current?.close();
  }, [playerId, resolvedId, inline]);

  if (!player || !squad) return null;
  const profile = playerProfile(view.definitions, playerId);
  const age = profile ? playerAge(profile.birthDate, view.currentDate) : null;
  const state = view.playerStatuses?.find((item) => item.playerId === playerId);
  const registration = registrationDraft ?? state?.registration;
  const physical = squad.physicalInputs?.find((item) => item.playerId === playerId)?.physical;
  const abilities: [string, Ability | undefined][] = [
    ['右投手へのミート', player.batting.contactVsRight],
    ['左投手へのミート', player.batting.contactVsLeft],
    ['選球眼', player.batting.plateDiscipline],
    ['右投手へのパワー', player.powerVsRight],
    ['左投手へのパワー', player.powerVsLeft],
    ['走力', player.runningSpeed],
    ['守備範囲', player.fieldingRange],
    ['肩力', player.armStrength],
    ['捕球', player.fielding?.catching],
    ['基礎スタミナ', physical?.stamina],
    ['回復能力', physical?.recovery],
  ];
  const pitches = squad.pitches.filter((pitch) => pitch.playerId === playerId);
  const stats =
    scope === 'farmRegular' && view.farm
      ? (view.farm.summary?.stats ?? view.farm.stats)
      : (view.seasonSummary?.stats ?? view.stats);
  const lines = {
    batting: stats.batting.filter((row) => row.playerId === playerId),
    pitching: stats.pitching.filter((row) => row.playerId === playerId),
    fielding: stats.fielding.filter((row) => row.playerId === playerId),
  };
  const hasStats = Object.values(lines).some((rows) => rows.length > 0);

  const content = (
    <>
      <div className="player-details-heading">
        <div>
          <p>PLAYER PROFILE ／ {view.currentDate}現在</p>
          <h2 id={headingId}>
            {profile?.displayName ?? `${player.familyName} ${player.givenName}`}
          </h2>
          {inline && (
            <p>
              年齢：{age === null ? '記録なし' : `${age}歳`} ／ 調子：
              {state?.condition ?? '記録なし'} ／ 疲労：
              {statusPoints(state?.fatigueMilli)}
            </p>
          )}
          <p>
            {squad.team.name} ／ {player.throwingHand === 'R' ? '右' : '左'}投
            {player.battingHand === 'R' ? '右' : player.battingHand === 'L' ? '左' : '両'}打 ／{' '}
            {registration === 'first' ? '一軍' : registration === 'farm' ? '二軍' : '登録記録なし'}
            {registrationDraft && '（編集案）'}
          </p>
          {!inline && (
            <p>
              {age === null ? '年齢：記録なし' : `${age}歳`} ／ 代表守備位置：
              {profile?.primaryPosition ?? '記録なし'}
            </p>
          )}
        </div>
        {!inline && (
          <button autoFocus onClick={close} aria-label="選手詳細を閉じる">
            閉じる ×
          </button>
        )}
      </div>
      <nav className="main-subnav" aria-label="選手詳細の項目">
        {(
          [
            ['ability', '能力・球種'],
            ['stats', '成績'],
            ['state', '状態・成長'],
            ['contract', '契約・経歴'],
          ] as const
        )
          .filter(([id]) => !inline || id !== 'contract')
          .map(([id, label]) => (
            <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
      </nav>
      {tab === 'ability' && (
        <>
          <p>現在の基本能力です。調子・体力による試合時の一時補正とは区別します。</p>
          <div className="world-table">
            <table aria-label="選手の基本能力">
              <thead>
                <tr>
                  <th>項目</th>
                  <th>現在値</th>
                  <th>成長上限</th>
                </tr>
              </thead>
              <tbody>
                {abilities.map(([label, ability]) => (
                  <tr key={label}>
                    <th>{label}</th>
                    <td>{ability ? points(ability.valueMilli) : '記録なし'}</td>
                    <td>{ability ? points(ability.ceilingMilli) : '記録なし'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>持ち球</h3>
          {pitches.length === 0 ? (
            <p>持ち球の登録がありません。</p>
          ) : (
            <div className="world-table">
              <table aria-label="選手の球種">
                <thead>
                  <tr>
                    <th>球種</th>
                    <th>通常球速</th>
                    <th>最高球速</th>
                    <th>制球</th>
                    <th>再現性</th>
                    <th>習得進捗</th>
                  </tr>
                </thead>
                <tbody>
                  {pitches.map((pitch) => (
                    <tr key={pitch.pitchId}>
                      <th>
                        {view.definitions.pitchProfiles?.profiles.find(
                          (p) => p.code === pitch.pitchTypeCode,
                        )?.name ??
                          pitchNames[pitch.pitchTypeCode] ??
                          pitch.pitchTypeCode}
                      </th>
                      <td>{(pitch.velocity.typicalCentiKph / 100).toFixed(2)} km/h</td>
                      <td>{(pitch.velocity.maxCentiKph / 100).toFixed(2)} km/h</td>
                      <td>{points(pitch.control.valueMilli)}</td>
                      <td>{points(pitch.repeatability.valueMilli)}</td>
                      <td>{points(pitch.acquisitionProgressMilli)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {view.definitions.pitchProfiles && pitches.length > 0 && (
            <PitchCharacteristics
              pitches={pitches}
              profiles={view.definitions.pitchProfiles}
              side={player.throwingHand}
            />
          )}
          <p className="hint">能力の値・上限は保存内の設定です。成長処理・守備適性は未実装です。</p>
        </>
      )}
      {tab === 'stats' && (
        <>
          <label>
            選手成績の大会
            <select
              value={scope}
              onChange={(event) => setScope(event.target.value as typeof scope)}
            >
              <option value="firstRegular">一軍公式戦</option>
              {view.farm && <option value="farmRegular">二軍公式戦</option>}
            </select>
          </label>
          <p>
            {view.definitions.seasonId} ／ {view.currentDate}現在・確定試合のみ
          </p>
          {hasStats ? (
            <WorldStats lines={lines} definitions={view.definitions} />
          ) : (
            <p>この大会の成績記録はありません。</p>
          )}
        </>
      )}
      {tab === 'state' && (
        <>
          <p>{view.currentDate}現在の状態</p>
          <dl className="player-state">
            <div>
              <dt>調子</dt>
              <dd>{state?.condition ?? '記録なし'}</dd>
            </div>
            <div>
              <dt>体力</dt>
              <dd>{statusPoints(state?.energyMilli)} / 100</dd>
            </div>
            <div>
              <dt>疲労</dt>
              <dd>{statusPoints(state?.fatigueMilli)} / 100</dd>
            </div>
          </dl>
          <p>体力は高いほど余力があり、疲労は高いほど蓄積しています。</p>
          <p className="hint">
            怪我・恒久的成長・成長履歴は工事中です。記録のない状態を健康・成長なしとは判定しません。
          </p>
        </>
      )}
      {tab === 'contract' && (
        <>
          <h3>プロフィール</h3>
          {profile ? (
            <dl className="player-profile-facts">
              <div>
                <dt>生年月日</dt>
                <dd>
                  {profile.birthDate}（{age}歳）
                </dd>
              </div>
              <div>
                <dt>出身地</dt>
                <dd>{profileBirthplace(view.definitions, profile)}</dd>
              </div>
              <div>
                <dt>出身区分</dt>
                <dd>{BACKGROUND_NAMES[profile.background]}</dd>
              </div>
              <div>
                <dt>身長・体重</dt>
                <dd>
                  {profile.heightMm / 10}cm ／ {profile.weightGrams / 1000}kg
                </dd>
              </div>
              <div>
                <dt>代表守備位置</dt>
                <dd>{profile.primaryPosition}</dd>
              </div>
              <div>
                <dt>プロ入り年</dt>
                <dd>{profile.firstProYear ?? '記録なし'}</dd>
              </div>
            </dl>
          ) : (
            <p>この保存にはプロフィールの記録がありません。</p>
          )}
          <p className="hint">
            契約・年俸・所属履歴・背番号は工事中です。代表位置は守備適性とは別の項目です。
          </p>
        </>
      )}
    </>
  );
  return inline ? (
    <section className="formation-profile" aria-labelledby={headingId}>
      {content}
    </section>
  ) : (
    <dialog
      ref={dialog}
      className="player-details"
      aria-labelledby={headingId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      {content}
    </dialog>
  );
}
