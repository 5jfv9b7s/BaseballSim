import { useState, type DragEvent, type ReactNode } from 'react';
import type { TradePlayView } from '../../world/trade-play-view.ts';
import type { TradeWorkerActive, TradeWorkerResponse } from '../../world/trade-worker-protocol.ts';
import type { TradeWorkerAction } from '../../world/trade-worker-client.ts';
import type { TradeRosterPreview } from '../../world/trade-roster-preview.ts';
import { AbilityRating } from '../visuals/AbilityRating.tsx';
import {
  buildTradeRosterAction,
  changeDraftRegistration,
  createTradeRosterDraft,
  placeDraftBatter,
  placeDraftPitcher,
  sameDraft,
  swapDraftPositions,
  type TradeRosterDraft,
  type PitcherDestination,
} from './trade-roster-draft.ts';
import './trade-roster.css';

const TRANSFER = 'application/x-baseball-trade-roster';
type Selection = { sourceKey: string } & (
  { kind: 'player'; playerId: string } | { kind: 'position'; squadId: string; slotNo: number }
);
type Reviewed = { action: ReturnType<typeof buildTradeRosterAction>; result: TradeRosterPreview };

/** 配置と登録の未送信案。確認済みの同じ指示だけを確定に使う。 */
export function TradeRosterEditor({
  active,
  view,
  draft,
  disabled,
  onChange,
  onSend,
  onSelectPlayer,
}: {
  active: TradeWorkerActive;
  view: TradePlayView;
  draft: TradeRosterDraft;
  disabled: boolean;
  onChange: (draft: TradeRosterDraft) => void;
  onSend: (action: TradeWorkerAction, success: string) => Promise<TradeWorkerResponse | undefined>;
  onSelectPlayer: (id: string) => void;
}) {
  const [category, setCategory] = useState<'first' | 'farm'>('first');
  const [tab, setTab] = useState<'batters' | 'pitchers'>('batters');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [message, setMessage] = useState('');
  const [reviewed, setReviewed] = useState<Reviewed | null>(null);
  const original = createTradeRosterDraft(active, view),
    dirty = !sameDraft(original, draft);
  const sourceKey = JSON.stringify(draft.source);
  const squad = draft.squads.find((s) => s.category === category);
  const editable = !disabled && view.capabilities.canEditRoster;
  const movable = editable && view.capabilities.canChangeRegistrations;
  const label = (id: string | null) =>
    id ? (view.players.find((p) => p.playerId === id)?.name ?? id) : '未配置';
  const selected = view.players.find((p) => p.playerId === selectedId);
  const members = view.players.filter((p) => (tab === 'batters' ? p.canBat : p.canPitch));
  const ids = (army: 'first' | 'farm') =>
    members.filter((p) => draft.categories[p.playerId] === army);

  function update(next: TradeRosterDraft, text: string) {
    if (!editable) return;
    onChange(next);
    setReviewed(null);
    setMessage(text);
  }
  function apply(run: () => TradeRosterDraft, text: string) {
    if (!editable) return;
    try {
      update(run(), text);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '配置を変更できません');
    }
  }
  function choose(value: Selection) {
    setSelection(value);
    if (value.kind === 'player') {
      setSelectedId(value.playerId);
      onSelectPlayer(value.playerId);
    }
  }
  function drag(event: DragEvent, value: Selection) {
    if (!editable) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData(TRANSFER, JSON.stringify(value));
    event.dataTransfer.effectAllowed = 'move';
    choose(value);
  }
  function dropped(event: DragEvent): Selection | null {
    event.preventDefault();
    if (!editable) return null;
    try {
      const value = JSON.parse(event.dataTransfer.getData(TRANSFER)) as Selection;
      if (value.sourceKey !== sourceKey) throw new Error();
      if (value.kind === 'player' && view.players.some((p) => p.playerId === value.playerId))
        return value;
      if (
        value.kind === 'position' &&
        draft.squads.some(
          (s) =>
            s.squadId === value.squadId &&
            s.lineup.battingOrder.some((row) => row.slotNo === value.slotNo),
        )
      )
        return value;
    } catch {
      setMessage('この編成画面からドラッグしてください。');
    }
    return null;
  }
  function targetDrop(event: DragEvent, action: (value: Selection) => void) {
    const value = dropped(event);
    if (value) action(value);
  }
  function allow(event: DragEvent) {
    if (editable && event.dataTransfer.types.includes(TRANSFER)) event.preventDefault();
  }
  function registration(value: Selection, to: 'first' | 'farm') {
    if (!movable || value.kind !== 'player') return;
    if (draft.categories[value.playerId] === to) {
      setMessage('同じ軍の配置は、打順・先発・救援の枠で変更してください。');
      return;
    }
    apply(
      () => changeDraftRegistration(draft, value.playerId, to),
      `${label(value.playerId)}の登録先を${to === 'first' ? '一軍' : '二軍'}へ変更しました。旧軍の配置・個別指定を解除し、空席は未補充です（下書き）。`,
    );
  }
  function batter(value: Selection, slotNo: number) {
    if (!squad) return;
    if (value.kind === 'position') {
      if (value.squadId !== squad.squadId) {
        setMessage('守備位置は同じ軍の中で交換してください。');
        return;
      }
      apply(
        () => swapDraftPositions(draft, squad.squadId, value.slotNo, slotNo),
        '選手と打順を保ち、守備位置だけ交換しました。',
      );
    } else {
      if (!view.players.find((p) => p.playerId === value.playerId)?.canBat) return;
      if (draft.categories[value.playerId] !== squad.category) {
        setMessage('先に登録先を変更してから、この軍の打順へ配置してください。');
        return;
      }
      apply(
        () => placeDraftBatter(draft, squad.squadId, slotNo, value.playerId),
        '打順の配置を変更しました。',
      );
    }
  }
  function pitcher(value: Selection, target: PitcherDestination) {
    if (
      !squad ||
      value.kind !== 'player' ||
      !view.players.find((p) => p.playerId === value.playerId)?.canPitch
    )
      return;
    apply(
      () => placeDraftPitcher(draft, squad.squadId, value.playerId, target),
      '投手の配置・優先順を変更しました。',
    );
  }
  function card(id: string | null, prefix?: ReactNode) {
    if (!id) return <span className="trade-roster-vacancy">未配置</span>;
    const player = view.players.find((p) => p.playerId === id);
    return (
      <button
        type="button"
        className="secondary trade-roster-card"
        draggable={editable}
        aria-pressed={selectedId === id}
        onDragStart={(e) => drag(e, { sourceKey, kind: 'player', playerId: id })}
        onClick={() => choose({ sourceKey, kind: 'player', playerId: id })}
      >
        {prefix}
        <strong>{label(id)}</strong>
        <small>
          {player &&
            `体力 ${(player.energyMilli / 1000).toFixed(0)} ／ 疲労 ${(player.fatigueMilli / 1000).toFixed(0)}`}
        </small>
      </button>
    );
  }
  function registrationColumn(army: 'first' | 'farm', title: string, pool = ids(army)) {
    return (
      <section
        className="trade-roster-column"
        onDragOver={allow}
        onDrop={(e) => targetDrop(e, (value) => registration(value, army))}
      >
        <h3>
          {title} <small>{pool.length}人</small>
        </h3>
        <button
          className="secondary"
          disabled={
            !movable ||
            selection?.kind !== 'player' ||
            draft.categories[selection.playerId] === army
          }
          onClick={() => selection && registration(selection, army)}
        >
          選択選手を{army === 'first' ? '一軍' : '二軍'}へ
        </button>
        {pool.map((p) => (
          <div key={p.playerId}>
            {card(p.playerId)}
            {p.nextFirstEligibleOn && <small>一軍再登録可能 {p.nextFirstEligibleOn}</small>}
          </div>
        ))}
      </section>
    );
  }
  async function inspect() {
    try {
      const action = buildTradeRosterAction(active, view, draft, crypto.randomUUID());
      const response = await onSend(
        { kind: 'previewCandidateRoster', sessionId: action.sessionId, command: action.command },
        '登録・編成案の検査結果を表示しました（未保存）。',
      );
      if (
        response?.ok &&
        response.rosterPreview?.commandId === action.command.commandId &&
        response.rosterPreview.stateRevision === draft.source.stateRevision &&
        response.active?.sessionId === draft.source.sessionId
      )
        setReviewed({ action, result: response.rosterPreview });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '編成を確認できませんでした');
    }
  }
  const rosterChanges = view.players.filter((p) => p.category !== draft.categories[p.playerId]);
  const changedSquads = draft.squads.filter(
    (s) => JSON.stringify(s) !== JSON.stringify(view.squads.find((r) => r.squadId === s.squadId)),
  );
  return (
    <section className="trade-play-section trade-roster" aria-labelledby="trade-roster-heading">
      <h2 id="trade-roster-heading">登録・編成</h2>
      <p>未送信の案を編集し、「変更案を検査」→「この案を確定して自動保存」で反映します。</p>
      <p>
        下書きの登録人数：一軍{' '}
        {view.players.filter((p) => draft.categories[p.playerId] === 'first').length}人 ／ 二軍{' '}
        {view.players.filter((p) => draft.categories[p.playerId] === 'farm').length}
        人。当日ベンチは上の試合開始欄で指定します。
      </p>
      {!view.capabilities.canEditRoster && (
        <p>編成の変更は当日の全試合開始前・未保存指示なしの時に行えます。</p>
      )}
      {!view.capabilities.canChangeRegistrations && view.capabilities.canEditRoster && (
        <p>
          登録先を変える場合は、下の起用方針を手動にして保存してください。現在の登録内の配置は編集できます。
        </p>
      )}
      <div className="trade-play-actions" aria-label="編成の表示切替">
        <button
          className="secondary"
          aria-pressed={category === 'first'}
          onClick={() => {
            setCategory('first');
            setSelection(null);
          }}
        >
          一軍
        </button>
        <button
          className="secondary"
          aria-pressed={category === 'farm'}
          onClick={() => {
            setCategory('farm');
            setSelection(null);
          }}
        >
          二軍
        </button>
        <button
          className="secondary"
          aria-pressed={tab === 'batters'}
          onClick={() => {
            setTab('batters');
            setSelection(null);
          }}
        >
          野手オーダー
        </button>
        <button
          className="secondary"
          aria-pressed={tab === 'pitchers'}
          onClick={() => {
            setTab('pitchers');
            setSelection(null);
          }}
        >
          投手オーダー
        </button>
      </div>
      <p className="muted">
        選手をドラッグするか、選手を選んで配置ボタンを押します。登録先変更は旧軍の配置・個別指定を解除し、空席を自動補充しません。
      </p>
      <p role="status">
        {message ||
          (selectedId
            ? `選択中：${label(selectedId)}`
            : '選手を選ぶと右列に能力・状態を表示します。')}
      </p>
      {squad && (
        <div className="trade-roster-columns">
          <section className="trade-roster-column">
            <h3>
              {category === 'first' ? '一軍' : '二軍'}
              {tab === 'batters' ? 'オーダー' : '先発ローテーション'}
            </h3>
            {tab === 'batters' ? (
              squad.lineup.battingOrder.map((slot) => (
                <div
                  className="trade-roster-slot"
                  key={slot.slotNo}
                  onDragOver={allow}
                  onDrop={(e) => {
                    e.stopPropagation();
                    targetDrop(e, (value) => batter(value, slot.slotNo));
                  }}
                >
                  <span>{slot.slotNo}番</span>
                  <button
                    className="secondary trade-roster-position"
                    draggable={editable}
                    disabled={!editable}
                    aria-label={`${slot.slotNo}番 ${slot.battingRole}の守備位置を選択`}
                    onDragStart={(e) => {
                      e.stopPropagation();
                      drag(e, {
                        sourceKey,
                        kind: 'position',
                        squadId: squad.squadId,
                        slotNo: slot.slotNo,
                      });
                    }}
                    onClick={() => {
                      if (selection?.kind === 'position') {
                        batter(selection, slot.slotNo);
                        setSelection(null);
                      } else {
                        choose({
                          sourceKey,
                          kind: 'position',
                          squadId: squad.squadId,
                          slotNo: slot.slotNo,
                        });
                        setMessage('交換先の守備位置を押してください。選手と打順は動きません。');
                      }
                    }}
                  >
                    {slot.battingRole}
                  </button>
                  {card(slot.playerId)}
                  <button
                    className="secondary"
                    disabled={!editable || !selection}
                    onClick={() => selection && batter(selection, slot.slotNo)}
                  >
                    {slot.slotNo}番へ配置
                  </button>
                </div>
              ))
            ) : (
              <>
                <label>
                  次の先発枠
                  <select
                    disabled={!editable}
                    value={squad.pitchers.nextSlotNo ?? ''}
                    onChange={(e) =>
                      apply(
                        () => ({
                          ...draft,
                          squads: draft.squads.map((s) =>
                            s.squadId === squad.squadId
                              ? {
                                  ...s,
                                  pitchers: {
                                    ...s.pitchers,
                                    nextSlotNo: e.target.value ? Number(e.target.value) : null,
                                  },
                                }
                              : s,
                          ),
                        }),
                        '次の先発枠を変更しました。',
                      )
                    }
                  >
                    <option value="">未設定</option>
                    {squad.pitchers.rotationSlots.map((r) => (
                      <option key={r.slotNo} value={r.slotNo}>
                        {r.slotNo}枠：{label(r.playerId)}
                      </option>
                    ))}
                  </select>
                </label>
                {squad.pitchers.rotationSlots.map((row, index) => (
                  <div
                    className="trade-roster-slot"
                    key={row.slotNo}
                    onDragOver={allow}
                    onDrop={(e) =>
                      targetDrop(e, (value) => pitcher(value, { kind: 'rotation', index }))
                    }
                  >
                    <span>{row.slotNo}枠</span>
                    {card(row.playerId)}
                    <button
                      className="secondary"
                      disabled={!editable || selection?.kind !== 'player'}
                      onClick={() => selection && pitcher(selection, { kind: 'rotation', index })}
                    >
                      この先発枠へ配置
                    </button>
                  </div>
                ))}
                <button
                  className="secondary"
                  disabled={!editable || squad.pitchers.rotationSlots.length >= 6}
                  onClick={() =>
                    apply(
                      () => ({
                        ...draft,
                        squads: draft.squads.map((s) =>
                          s.squadId === squad.squadId
                            ? {
                                ...s,
                                pitchers: {
                                  ...s.pitchers,
                                  rotationSlots: [
                                    ...s.pitchers.rotationSlots,
                                    { slotNo: s.pitchers.rotationSlots.length + 1, playerId: null },
                                  ],
                                },
                              }
                            : s,
                        ),
                      }),
                      '空の先発枠を追加しました。',
                    )
                  }
                >
                  先発枠を追加（最大6）
                </button>
                <button
                  className="secondary"
                  disabled={!editable || squad.pitchers.rotationSlots.at(-1)?.playerId !== null}
                  onClick={() =>
                    apply(
                      () => ({
                        ...draft,
                        squads: draft.squads.map((s) =>
                          s.squadId === squad.squadId
                            ? {
                                ...s,
                                pitchers: {
                                  ...s.pitchers,
                                  rotationSlots: s.pitchers.rotationSlots.slice(0, -1),
                                  nextSlotNo:
                                    s.pitchers.nextSlotNo === s.pitchers.rotationSlots.length
                                      ? null
                                      : s.pitchers.nextSlotNo,
                                },
                              }
                            : s,
                        ),
                      }),
                      '末尾の空き先発枠を削除しました。次枠が未設定なら選び直してください。',
                    )
                  }
                >
                  末尾の空き先発枠を削除
                </button>
              </>
            )}
          </section>
          {tab === 'batters' ? (
            registrationColumn(
              category,
              `${category === 'first' ? '一軍' : '二軍'}控え`,
              ids(category).filter(
                (p) => !squad.lineup.battingOrder.some((row) => row.playerId === p.playerId),
              ),
            )
          ) : (
            <section className="trade-roster-column">
              <h3>通常救援・優先順</h3>
              {squad.pitchers.reliefRoles.map((row, index) => (
                <div
                  className="trade-roster-slot"
                  key={row.playerId}
                  onDragOver={allow}
                  onDrop={(e) =>
                    targetDrop(e, (value) => pitcher(value, { kind: 'relief', index }))
                  }
                >
                  {card(row.playerId, <span>{row.priority}番手 </span>)}
                  <button
                    className="secondary"
                    disabled={!editable || selection?.kind !== 'player'}
                    onClick={() => selection && pitcher(selection, { kind: 'relief', index })}
                  >
                    この救援枠へ配置
                  </button>
                </div>
              ))}
              <button
                className="secondary"
                disabled={!editable || selection?.kind !== 'player'}
                onDragOver={allow}
                onDrop={(e) =>
                  targetDrop(e, (value) =>
                    pitcher(value, { kind: 'relief', index: squad.pitchers.reliefRoles.length }),
                  )
                }
                onClick={() =>
                  selection &&
                  pitcher(selection, { kind: 'relief', index: squad.pitchers.reliefRoles.length })
                }
              >
                救援末尾へ配置
              </button>
              <h4>この軍の未配置投手</h4>
              {ids(category)
                .filter(
                  (p) =>
                    !squad.pitchers.rotationSlots.some((r) => r.playerId === p.playerId) &&
                    !squad.pitchers.reliefRoles.some((r) => r.playerId === p.playerId),
                )
                .map((p) => (
                  <div key={p.playerId}>{card(p.playerId)}</div>
                ))}
            </section>
          )}
          {registrationColumn(
            category === 'first' ? 'farm' : 'first',
            `${category === 'first' ? '二軍' : '一軍'}メンバー`,
          )}
          <section className="trade-roster-column trade-roster-information">
            <h3>選択選手情報</h3>
            {selected ? (
              <>
                <h4>{selected.name}</h4>
                <p>
                  現在登録：{selected.category === 'first' ? '一軍' : '二軍'} ／ 下書き：
                  {draft.categories[selected.playerId] === 'first' ? '一軍' : '二軍'}
                </p>
                <p>
                  体力 {(selected.energyMilli / 1000).toFixed(1)} ／ 疲労{' '}
                  {(selected.fatigueMilli / 1000).toFixed(1)} ／ 調子{' '}
                  {(selected.conditionMilli / 1000).toFixed(1)}
                </p>
                <p>一軍再登録：{selected.nextFirstEligibleOn ?? '待機なし'}</p>
                <div className="trade-roster-card-actions">
                  {(['first', 'farm'] as const).map((army) => (
                    <button
                      className="secondary"
                      key={army}
                      disabled={!movable || draft.categories[selected.playerId] === army}
                      onClick={() =>
                        registration(
                          { sourceKey, kind: 'player', playerId: selected.playerId },
                          army,
                        )
                      }
                    >
                      {army === 'first' ? '一軍' : '二軍'}へ登録変更
                    </button>
                  ))}
                </div>
                <dl>
                  {selected.abilities
                    .filter(
                      (a) => a.abilityRef.scope !== 'pitch' && a.abilityRef.scope !== 'position',
                    )
                    .map((a) => (
                      <div key={a.key}>
                        <dt>{a.label}</dt>
                        <dd>
                          <AbilityRating
                            valueMilli={a.valueMilli}
                            label={`${selected.name}の${a.label}`}
                          />
                        </dd>
                      </div>
                    ))}
                </dl>
              </>
            ) : (
              <p>選手を選択してください。</p>
            )}
          </section>
        </div>
      )}
      <details>
        <summary>個別休養・条件別救援の指定</summary>
        <p>
          既存の指定は保存します。登録先を変えた選手の旧軍の指定は解除されます。条件の追加・数値編集は工事中です。
        </p>
        {draft.squads.map((s) => (
          <div key={s.squadId}>
            <h3>{s.category === 'first' ? '一軍' : '二軍'}</h3>
            {[
              ...new Set([
                ...s.individualRest.map((r) => r.playerId),
                ...s.conditionalRelief.map((r) => r.playerId),
              ]),
            ].map((id) => (
              <p key={id}>
                {label(id)}：個別休養 {s.individualRest.filter((r) => r.playerId === id).length}件
                ／ 救援条件 {s.conditionalRelief.filter((r) => r.playerId === id).length}件{' '}
                <button
                  className="secondary"
                  disabled={!editable}
                  onClick={() =>
                    apply(
                      () => ({
                        ...draft,
                        squads: draft.squads.map((r) =>
                          r.squadId === s.squadId
                            ? {
                                ...r,
                                individualRest: r.individualRest.filter((x) => x.playerId !== id),
                                conditionalRelief: r.conditionalRelief.filter(
                                  (x) => x.playerId !== id,
                                ),
                              }
                            : r,
                        ),
                      }),
                      '選んだ投手の個別指定を下書きから解除しました。',
                    )
                  }
                >
                  この軍の個別指定を解除
                </button>
              </p>
            ))}
          </div>
        ))}
      </details>
      {dirty && (
        <div className="trade-roster-review">
          <h3>変更案（未保存）</h3>
          <ul>
            {rosterChanges.map((p) => (
              <li key={p.playerId}>
                {p.name}：{p.category === 'first' ? '一軍' : '二軍'} →{' '}
                {draft.categories[p.playerId] === 'first' ? '一軍' : '二軍'}
              </li>
            ))}
            {changedSquads.map((s) => {
              const before = view.squads.find((r) => r.squadId === s.squadId)!;
              return (
                <li key={s.squadId}>
                  {s.category === 'first' ? '一軍' : '二軍'}の配置変更
                  <details>
                    <summary>変更後の打順・投手配置と個別指定数</summary>
                    <ol>
                      {s.lineup.battingOrder.map((r) => (
                        <li key={r.slotNo}>
                          {label(r.playerId)}（{r.battingRole}）
                        </li>
                      ))}
                    </ol>
                    <p>
                      先発：
                      {s.pitchers.rotationSlots.map((r) => label(r.playerId)).join(' → ') ||
                        '未配置'}{' '}
                      ／ 次枠 {s.pitchers.nextSlotNo ?? '未設定'}
                    </p>
                    <p>
                      通常救援：
                      {s.pitchers.reliefRoles.map((r) => label(r.playerId)).join(' → ') || 'なし'}
                    </p>
                    <p>
                      個別休養 {before.individualRest.length} → {s.individualRest.length}件 ／
                      救援条件 {before.conditionalRelief.length} → {s.conditionalRelief.length}件
                    </p>
                  </details>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div className="trade-play-actions">
        <button className="primary" disabled={!editable || !dirty} onClick={() => void inspect()}>
          変更案を検査（保存しない）
        </button>
        <button
          className="secondary"
          disabled={!editable || !dirty}
          onClick={() => {
            update(original, '登録・編成の下書きを戻しました。');
            setSelection(null);
          }}
        >
          登録・編成の下書きを戻す
        </button>
      </div>
      {reviewed && (
        <section className="trade-roster-review" aria-label="登録・編成の検査結果">
          <p>
            確認時点：{draft.source.date} ／ 状態版 {reviewed.result.stateRevision}
            。編集すると再検査が必要です。
          </p>
          <h3>
            {reviewed.result.status === 'ready' ? 'この案は確定できます' : 'この案は確定できません'}
          </h3>
          {reviewed.result.status === 'blocked' ? (
            <ul role="alert">
              {reviewed.result.issues.map((issue, i) => (
                <li key={i}>
                  {issue.playerId ? `${label(issue.playerId)}：` : ''}
                  {issue.message}
                </li>
              ))}
            </ul>
          ) : (
            <>
              <p>
                未開始試合の無効になる当日指定 {reviewed.result.audit.invalidatedOverrides.length}
                件を解除します。個人状態・過去試合・会計は維持します。
              </p>
              <ul>
                {reviewed.result.audit.invalidatedOverrides.map((r) => (
                  <li key={r.gameId}>
                    {view.games.find((g) => g.gameId === r.gameId)?.date ?? r.gameId}：
                    {r.fields
                      .map(
                        (f) =>
                          ({ lineup: '当日打順', starterId: '当日先発', benchIds: '当日ベンチ' })[
                            f
                          ],
                      )
                      .join('・')}
                  </li>
                ))}
              </ul>
              <button
                className="primary"
                disabled={!editable}
                onClick={() =>
                  void onSend(reviewed.action, '登録・編成を確定し、自動保存しました。')
                }
              >
                この案を確定して自動保存
              </button>
            </>
          )}
          <button className="secondary" disabled={!editable} onClick={() => setReviewed(null)}>
            確定せず編集に戻る
          </button>
        </section>
      )}
    </section>
  );
}
