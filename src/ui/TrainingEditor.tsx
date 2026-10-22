import { growthAbilityKey } from '../world/growth-basis.ts';
import { PlayerGrowth } from './PlayerGrowth.tsx';
import { useState } from 'react';
import { canonicalJson } from '../storage/codec.ts';
import { playerAge, playerProfile } from '../world/player-profiles.ts';
import { PROFILE_POSITIONS } from '../world/player-profile-types.ts';
import {
  trainingTargetOptions,
  trainingTargetLabel,
  trainingTargetAbilities,
} from '../world/training.ts';
import type { TrainingDraft, TrainingSettings } from '../world/training-types.ts';
import type { WorldView } from '../world/controller.ts';
import { AbilityRating } from './visuals/AbilityRating.tsx';
import './training-editor.css';

const INTENSITIES = { light: '軽め', normal: '普通', hard: '強め', rest: '休養' };
export function TrainingEditor({
  view,
  draft,
  changed,
  locked,
  onChange,
  onSave,
  onReset,
  onSelectPlayer,
}: {
  view: WorldView;
  draft: TrainingDraft;
  changed: boolean;
  locked: boolean;
  onChange: (draft: TrainingDraft) => void;
  onSave: () => void;
  onReset: () => void;
  onSelectPlayer: (id: string) => void;
}) {
  const squad = view.definitions.squads.find(
    (s) => s.squadId === view.management?.controlledSquadId,
  )!;
  const [selected, setSelected] = useState<string[]>([squad.players[0]!.playerId]);
  const [search, setSearch] = useState('');
  const [registration, setRegistration] = useState('all');
  const [role, setRole] = useState('all');
  const [position, setPosition] = useState('all');
  const nameOf = (id: string) => {
    const p = squad.players.find((p) => p.playerId === id)!;
    return playerProfile(view.definitions, id)?.displayName ?? `${p.familyName} ${p.givenName}`;
  };
  const statusOf = (id: string) => view.playerStatuses.find((p) => p.playerId === id);
  const normalize = (text: string) =>
    text.normalize('NFKC').replace(/\s/g, '').toLocaleLowerCase('ja');
  const visible = squad.players.filter((player) => {
    const id = player.playerId;
    const pitcher = squad.pitches.some((p) => p.playerId === id);
    return (
      normalize(nameOf(id)).includes(normalize(search)) &&
      (registration === 'all' || statusOf(id)?.registration === registration) &&
      (role === 'all' || pitcher === (role === 'pitcher')) &&
      (position === 'all' || playerProfile(view.definitions, id)?.primaryPosition === position)
    );
  });
  const selectedPlans = selected.map((id) => draft[id]!);
  const same = <T,>(values: T[]): T | undefined =>
    values.length && values.every((value) => canonicalJson(value) === canonicalJson(values[0]))
      ? values[0]
      : undefined;
  const target = same(selectedPlans.map((plan) => plan.target));
  const intensity = same(selectedPlans.map((plan) => plan.intensity));
  const autoAdjust = same(selectedPlans.map((plan) => plan.autoAdjustForFatigue));
  const options = selected.length
    ? trainingTargetOptions(view.definitions, selected[0]!).filter((option) =>
        selected
          .slice(1)
          .every((id) =>
            trainingTargetOptions(view.definitions, id).some((other) => other.key === option.key),
          ),
      )
    : [];
  function patch(settings: Partial<TrainingSettings>) {
    const next = structuredClone(draft);
    for (const id of selected) next[id] = { ...next[id]!, ...structuredClone(settings) };
    onChange(next);
  }
  const hiddenSelected = selected.filter((id) => !visible.some((p) => p.playerId === id)).length;
  const single = selected.length === 1 ? selected[0]! : null;
  return (
    <section className="panel training-panel" aria-label="育成・練習設定">
      <div className="training-toolbar">
        <p role="status">
          {changed
            ? '練習設定を編集中'
            : view.unsavedChanges
              ? '練習設定の変更なし（プレイは未保存）'
              : '練習設定は保存済み'}
          <small>ゲーム内の別画面へ移ると、変更した選手の設定をまとめて保存します。</small>
        </p>
        <div className="world-controls">
          <button disabled={locked || !changed} onClick={onSave}>
            変更を保存
          </button>
          <button className="secondary" disabled={locked || !changed} onClick={onReset}>
            変更を取り消す
          </button>
        </div>
      </div>
      <p className="training-scope-note">
        {view.growth?.version === 'daily-development-v2'
          ? '全試合終了後の日次確定で通常練習と実戦経験を反映します。現在の指定は次の通常練習に使用します。加齢・覚醒・キャンプは工事中です。'
          : view.growth
            ? '全試合終了後の日次確定で通常練習を実施します。現在の指定は次の練習に使用します。実戦経験・加齢・覚醒・キャンプは工事中です。'
            : 'この保存は練習の指定・保存まで対応しています。日次の練習効果・疲労調整・経験・恒久成長は工事中です。設定だけで能力や疲労は変化しません。'}
      </p>
      {locked && (
        <p className="hint">
          進行中・当日の試合開始後・全日程終了後は閲覧のみです。変更は試合開始前に行えます。
        </p>
      )}
      <div className="training-layout">
        <div className="training-roster">
          <h3>{squad.team.name}の選手</h3>
          <div className="training-filters">
            <label>
              選手名
              <input value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
            <label>
              練習の登録区分
              <select value={registration} onChange={(e) => setRegistration(e.target.value)}>
                <option value="all">一軍・二軍すべて</option>
                <option value="first">一軍</option>
                <option value="farm">二軍</option>
              </select>
            </label>
            <label>
              練習の選手種別
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="all">すべて</option>
                <option value="pitcher">投手</option>
                <option value="fielder">野手</option>
              </select>
            </label>
            <label>
              練習の代表位置
              <select value={position} onChange={(e) => setPosition(e.target.value)}>
                <option value="all">すべて</option>
                {PROFILE_POSITIONS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="world-controls">
            <button
              className="secondary"
              disabled={!visible.length}
              onClick={() => setSelected(visible.map((p) => p.playerId))}
            >
              表示中を選択（{visible.length}人）
            </button>
            <button
              className="secondary"
              disabled={!selected.length}
              onClick={() => setSelected([])}
            >
              選択を解除
            </button>
          </div>
          <p className="hint">
            名前で1人を選択、チェックで複数選択。{selected.length}人選択中
            {hiddenSelected > 0 && `（表示外${hiddenSelected}人を含む）`}
          </p>
          <div
            className="world-table training-roster-scroll"
            role="region"
            aria-label="練習選手一覧のスクロール"
            tabIndex={0}
          >
            <table aria-label="練習選手一覧">
              <thead>
                <tr>
                  <th>選択</th>
                  <th>選手・年齢</th>
                  <th>現在の指定</th>
                  <th>調子・疲労</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((player) => {
                  const id = player.playerId;
                  const profile = playerProfile(view.definitions, id);
                  const status = statusOf(id);
                  const plan = draft[id]!;
                  const saved = view.training!.plans[id]!;
                  const edited =
                    canonicalJson(plan) !==
                    canonicalJson({
                      target: saved.target,
                      intensity: saved.intensity,
                      autoAdjustForFatigue: saved.autoAdjustForFatigue,
                    });
                  return (
                    <tr key={id} data-selected={selected.includes(id)}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`${nameOf(id)}を一括選択`}
                          checked={selected.includes(id)}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...selected, id]
                                : selected.filter((item) => item !== id),
                            )
                          }
                        />
                      </td>
                      <th scope="row">
                        <button
                          className="player-link"
                          aria-pressed={selected.includes(id)}
                          onClick={() => setSelected([id])}
                        >
                          {nameOf(id)}
                        </button>
                        <small>
                          {profile
                            ? `${playerAge(profile.birthDate, view.currentDate)}歳 / ${profile.primaryPosition}`
                            : '記録なし'}{' '}
                          /{' '}
                          {status?.registration === 'first'
                            ? '一軍'
                            : status?.registration === 'farm'
                              ? '二軍'
                              : '記録なし'}
                        </small>
                      </th>
                      <td>
                        {trainingTargetLabel(view.definitions, id, plan.target)}
                        <small>
                          {INTENSITIES[plan.intensity]}
                          {edited ? '・編集中' : ''}
                        </small>
                      </td>
                      <td>
                        {status?.condition ?? '記録なし'}
                        <small>
                          疲労{' '}
                          {status?.fatigueMilli === null || status?.fatigueMilli === undefined
                            ? '記録なし'
                            : `${Math.floor(status.fatigueMilli / 1000)}%`}
                        </small>
                        {status?.fatigueMilli !== null && status?.fatigueMilli !== undefined && (
                          <meter
                            aria-label={`${nameOf(id)}の疲労`}
                            min={0}
                            max={100}
                            value={status.fatigueMilli / 1000}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!visible.length && <p>条件に合う選手はいません。</p>}
          </div>
        </div>
        <section className="training-detail" aria-label="選択選手の練習内容">
          <h3>
            {single
              ? nameOf(single)
              : selected.length
                ? `${selected.length}人へ一括設定`
                : '選手を選択'}
          </h3>
          {selected.length > 1 && (
            <p className="hint">
              異なる設定は「設定が異なります」と表示します。操作した項目だけを全選手へ変更し、他の項目は保ちます。
            </p>
          )}
          <fieldset disabled={locked || !selected.length}>
            <legend>通常練習</legend>
            <label>
              練習対象
              <select
                value={target ? canonicalJson(target) : ''}
                onChange={(e) => {
                  const option = options.find((o) => o.key === e.target.value);
                  if (option) patch({ target: option.target });
                }}
              >
                {!target && (
                  <option value="">
                    {selected.length ? '設定が異なります（変更しない）' : '選手を選んでください'}
                  </option>
                )}
                {options.map((option) => (
                  <option value={option.key} key={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              練習強度
              <select
                value={intensity ?? ''}
                onChange={(e) => {
                  if (Object.hasOwn(INTENSITIES, e.target.value))
                    patch({ intensity: e.target.value as TrainingSettings['intensity'] });
                }}
              >
                {!intensity && (
                  <option value="">
                    {selected.length ? '設定が異なります（変更しない）' : '選手を選んでください'}
                  </option>
                )}
                {Object.entries(INTENSITIES).map(([key, label]) => (
                  <option value={key} key={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              疲労による自動調整
              <select
                value={autoAdjust === undefined ? '' : String(autoAdjust)}
                onChange={(e) => {
                  if (e.target.value) patch({ autoAdjustForFatigue: e.target.value === 'true' });
                }}
              >
                {autoAdjust === undefined && (
                  <option value="">
                    {selected.length ? '設定が異なります（変更しない）' : '選手を選んでください'}
                  </option>
                )}
                <option value="true">{view.growth ? '許可する' : '許可する（判定準備中）'}</option>
                <option value="false">手動指定を維持する</option>
              </select>
            </label>
          </fieldset>
          {single && (
            <>
              <p className="hint">
                保存済みの指定開始日：{view.training!.plans[single]!.effectiveFrom} / 終了指定なし
              </p>
              <button className="secondary" onClick={() => onSelectPlayer(single)}>
                選手詳細を開く
              </button>
              <h4>練習対象の現在値</h4>
              <div
                className="world-table"
                role="region"
                aria-label="練習対象の能力表スクロール"
                tabIndex={0}
              >
                <table aria-label="練習対象の現在能力">
                  <thead>
                    <tr>
                      <th>項目</th>
                      <th>現在値</th>
                      <th>上限</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trainingTargetAbilities(view.definitions, single, draft[single]!.target).map(
                      (ability) => (
                        <tr key={canonicalJson(ability.abilityRef)}>
                          <th scope="row">{ability.label}</th>
                          <td>
                            <AbilityRating
                              label={ability.label}
                              valueMilli={
                                view.growth?.current[single]?.[
                                  growthAbilityKey(ability.abilityRef)
                                ] ?? ability.valueMilli
                              }
                            />
                          </td>
                          <td>{Math.floor(ability.ceilingMilli / 1000)}</td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {single && <PlayerGrowth key={single} view={view} playerId={single} />}
          <details className="training-help">
            <summary>対応範囲と未実装の機能</summary>
            <p>
              対象群は保存内の辞書から展開します。球種の制球・再現性は本人の持ち球を選ぶ場合だけ指定できます。複数選択では全員に共通する対象を表示します。
            </p>
            <p>
              {view.growth
                ? '通常練習は才能・向上心と指定を使用し、指定外にも基礎練習を配分します。疲労の自動調整は全試合後の体力・疲労・出場負荷で強度を下げます。将来の成長予測・キャンプ・新球種習得・傾向変更は工事中です。'
                : 'キャンプ、新球種習得、傾向変更、成長履歴・成長予測は工事中です。疲労による自動調整は希望の保存のみです。'}
            </p>
          </details>
        </section>
      </div>
    </section>
  );
}
