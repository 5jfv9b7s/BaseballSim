import { PlayerGrowth } from './PlayerGrowth.tsx';
import { growthAbilityKey } from '../world/growth-basis.ts';
import { PlayerAbilities } from './PlayerAbilities.tsx';
import { AbilityRating } from './visuals/AbilityRating.tsx';
import { playerDevelopment } from '../world/player-development.ts';
import { playerProfile, playerAge, profileBirthplace } from '../world/player-profiles.ts';
import { BACKGROUND_NAMES } from '../world/player-profile-types.ts';
import { PitchCharacteristics } from './PitchCharacteristics.tsx';
import { useEffect, useId, useRef, useState } from 'react';
import type { WorldView } from '../world/controller.ts';
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
  const development = playerDevelopment(view.definitions, playerId);
  const current = view.growth?.current[playerId];
  const pitches = squad.pitches
    .filter((pitch) => pitch.playerId === playerId)
    .map((pitch) => ({
      ...pitch,
      control: {
        ...pitch.control,
        valueMilli:
          current?.[
            growthAbilityKey({ scope: 'pitch', pitchId: pitch.pitchId, code: 'control' })
          ] ?? pitch.control.valueMilli,
      },
      repeatability: {
        ...pitch.repeatability,
        valueMilli:
          current?.[
            growthAbilityKey({ scope: 'pitch', pitchId: pitch.pitchId, code: 'repeatability' })
          ] ?? pitch.repeatability.valueMilli,
      },
    }));
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
          <PlayerAbilities
            key={playerId}
            definitions={view.definitions}
            playerId={playerId}
            current={current}
          />
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
          <p className="hint">
            {view.growth
              ? `現在値には確定済みの通常練習${view.growth.version !== 'daily-training-v1' ? '・実戦経験' : ''}を反映します。追加11能力・守備習熟の試合への作用、適性の計算接続は準備中です。`
              : '能力・上限・適性は保存内の設定です。この保存では練習・恒久的成長は未対応です。'}
          </p>
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
          {development && (
            <>
              <h3>成長特性</h3>
              <div className="player-growth-traits" aria-label="才能と向上心">
                <div>
                  <span>才能</span>
                  <AbilityRating valueMilli={development.growthProfile.talentMilli} label="才能" />
                </div>
                <div>
                  <span>向上心</span>
                  <AbilityRating
                    valueMilli={development.growthProfile.ambitionMilli}
                    label="向上心"
                  />
                </div>
              </div>
              <p className="hint">
                {view.growth
                  ? `才能は${view.growth.version !== 'daily-training-v1' ? '通常練習・実戦経験' : '通常練習'}の成長量、向上心は成長機会に作用します。固定特性で、成長合計には含みません。`
                  : '架空の固定初期値です。この保存では成長量・機会への作用は未接続です。'}
              </p>
            </>
          )}

          <p>体力は高いほど余力があり、疲労は高いほど蓄積しています。</p>
          <p className="hint">
            {view.growth?.version === 'daily-development-v4'
              ? '通常練習・実戦経験・年齢変化・ルーキー覚醒の確定実績を表示します。怪我・移籍覚醒・キャンプは工事中です。'
              : view.growth?.version === 'daily-development-v3'
                ? '通常練習・実戦経験・年齢変化の確定実績を表示します。怪我・覚醒・キャンプは工事中です。'
                : view.growth?.version === 'daily-development-v2'
                  ? '通常練習と実戦経験の確定実績を表示します。怪我・加齢・覚醒・キャンプは工事中です。'
                  : view.growth
                    ? '怪我・実戦経験・加齢・覚醒・キャンプは工事中です。通常練習の実績だけを表示します。'
                    : '怪我・恒久的成長・成長履歴は工事中です。記録のない状態を健康・成長なしとは判定しません。'}
          </p>
        </>
      )}
      {tab === 'state' && <PlayerGrowth key={playerId} view={view} playerId={playerId} />}
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
